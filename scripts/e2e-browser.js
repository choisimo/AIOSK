#!/usr/bin/env node

const assert = require('assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..');

if (process.argv.length > 2) {
  console.error('Usage: scripts/e2e-browser.js');
  process.exit(1);
}

const parsePort = (value, fallback, envName) => {
  if (value === undefined || value === '') return fallback;

  const text = String(value).trim();
  const port = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error(`${envName} must be a positive integer between 1 and 65535.`);
  }

  return port;
};

let config;

const createConfig = () => ({
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: parsePort(process.env.DB_PORT, 3306, 'DB_PORT'),
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || 'root',
  dbName: process.env.DB_NAME || 'aiosk_e2e_browser',
  appPort: parsePort(process.env.E2E_APP_PORT, 3101, 'E2E_APP_PORT'),
  frontendPort: parsePort(process.env.E2E_FRONTEND_PORT, 5174, 'E2E_FRONTEND_PORT'),
  jwtSecret: process.env.JWT_SECRET || 'aiosk-browser-e2e-jwt-secret-at-least-32-characters',
  adminUsername: process.env.E2E_ADMIN_USERNAME || 'browser_e2e_admin',
  adminPassword: process.env.E2E_ADMIN_PASSWORD || 'browser_e2e_admin_password'
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeIdentifier = (identifier) => {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
};

const assertSafeDatabaseName = () => {
  const allowUnsafeDb = process.env.E2E_ALLOW_UNSAFE_DB;
  if (allowUnsafeDb !== undefined && allowUnsafeDb !== '' && allowUnsafeDb !== '0' && allowUnsafeDb !== '1') {
    throw new Error('E2E_ALLOW_UNSAFE_DB must be 0 or 1.');
  }
  if (allowUnsafeDb === '1') return;

  if (!config.dbName.startsWith('aiosk_e2e')) {
    throw new Error(
      `Refusing to reset DB_NAME=${config.dbName}. Use an aiosk_e2e* database or set E2E_ALLOW_UNSAFE_DB=1 intentionally.`
    );
  }
};

const connectAdmin = () => mysql.createConnection({
  host: config.dbHost,
  port: config.dbPort,
  user: config.dbUser,
  password: config.dbPassword,
  multipleStatements: true
});

const waitForDatabase = async () => {
  let lastError;

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const connection = await connectAdmin();
      await connection.query('SELECT 1');
      await connection.end();
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }

  throw new Error(`MySQL did not become ready: ${lastError && lastError.message}`);
};

const resetDatabase = async () => {
  assertSafeDatabaseName();
  await waitForDatabase();

  const dbName = escapeIdentifier(config.dbName);
  const admin = await connectAdmin();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database: config.dbName });
  await admin.query(fs.readFileSync(path.join(rootDir, 'database_schema.sql'), 'utf8'));

  const adminPasswordHash = await bcrypt.hash(config.adminPassword, 10);
  await admin.query(
    'INSERT INTO Admins (username, password) VALUES (?, ?)',
    [config.adminUsername, adminPasswordHash]
  );

  const [categoryResult] = await admin.query(
    'INSERT INTO Categories (name, sort_order) VALUES (?, ?)',
    ['Browser E2E Coffee', 1]
  );
  await admin.query(
    `INSERT INTO Menus (category_id, name, price, image_url, description, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      categoryResult.insertId,
      'Browser E2E Latte',
      5500,
      null,
      'Created by browser E2E',
      'FOR_SALE'
    ]
  );

  await admin.end();
};

const dropDatabase = async () => {
  assertSafeDatabaseName();
  const admin = await connectAdmin();
  await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(config.dbName)}`);
  await admin.end();
};

const stopProcess = async (processHandle) => {
  if (!processHandle || !processHandle.child || processHandle.child.exitCode !== null) return;

  const exited = new Promise((resolve) => {
    processHandle.child.once('exit', resolve);
  });

  processHandle.child.kill('SIGTERM');
  await Promise.race([
    exited,
    sleep(5000).then(() => {
      if (processHandle.child.exitCode === null) {
        processHandle.child.kill('SIGKILL');
      }
    })
  ]);
};

const waitForHttp = async (url, processHandle, label) => {
  let lastError;

  for (let attempt = 1; attempt <= 80; attempt += 1) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(`${label} exited before readiness.\n${processHandle.logs.join('')}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw new Error(`${label} did not become ready: ${lastError && lastError.message}\n${processHandle.logs.join('')}`);
};

const startBackend = async () => {
  const frontendUrl = `http://127.0.0.1:${config.frontendPort}`;
  const backendUrl = `http://127.0.0.1:${config.appPort}`;
  const logs = [];
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_HOST: config.dbHost,
      DB_PORT: String(config.dbPort),
      DB_USER: config.dbUser,
      DB_PASSWORD: config.dbPassword,
      DB_NAME: config.dbName,
      JWT_SECRET: config.jwtSecret,
      SESSION_SECRET: 'local-browser-e2e-session-secret-at-least-32-characters',
      SESSION_STORE: 'mysql',
      SESSION_COOKIE_SAME_SITE: 'lax',
      CORS_ORIGIN: frontendUrl,
      SOCKET_CORS_ORIGIN: `${frontendUrl},${backendUrl}`,
      PORT: String(config.appPort),
      NODE_ENV: 'test',
      LOG_LEVEL: 'error'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const handle = { child, logs };
  await waitForHttp(`${backendUrl}/healthz`, handle, 'Backend server');
  return { ...handle, baseUrl: backendUrl };
};

const startFrontend = async (backendUrl) => {
  const logs = [];
  const child = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(config.frontendPort)],
    {
      cwd: path.join(rootDir, 'frontend'),
      env: {
        ...process.env,
        VITE_API_URL: backendUrl,
        VITE_USE_MOCK_DATA: 'false',
        VITE_APP_VERSION: 'browser-e2e'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const handle = { child, logs };
  const baseUrl = `http://127.0.0.1:${config.frontendPort}`;
  await waitForHttp(baseUrl, handle, 'Frontend dev server');
  return { ...handle, baseUrl };
};

const verifyBrowserEffects = async () => {
  const connection = await mysql.createConnection({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName
  });
  const [orders] = await connection.query(
    `SELECT o.id, o.total_price, o.status, oi.quantity, oi.price_per_item, m.name AS menu_name
     FROM Orders o
     JOIN OrderItems oi ON oi.order_id = o.id
     JOIN Menus m ON m.id = oi.menu_id
     WHERE m.name = ?
     ORDER BY o.id DESC
     LIMIT 1`,
    ['Browser E2E Latte']
  );
  const [categories] = await connection.query(
    'SELECT id, name, sort_order FROM Categories WHERE name = ?',
    ['Admin Browser Category']
  );
  const [menus] = await connection.query(
    'SELECT id, name, price, status FROM Menus WHERE name = ?',
    ['Admin Browser Menu']
  );
  await connection.end();

  assert.equal(orders.length, 1, 'browser E2E order should be persisted');
  assert.equal(Number(orders[0].total_price), 5500);
  assert.equal(orders[0].status, 'PREPARING');
  assert.equal(orders[0].quantity, 1);
  assert.equal(Number(orders[0].price_per_item), 5500);
  assert.equal(categories.length, 1, 'admin browser E2E category should be persisted');
  assert.equal(categories[0].sort_order, 9);
  assert.equal(menus.length, 1, 'admin browser E2E menu should be persisted');
  assert.equal(Number(menus[0].price), 6200);
  assert.equal(menus[0].status, 'FOR_SALE');
};

const submitAndWait = async (page, action) => {
  const navigation = page.waitForNavigation({ waitUntil: 'networkidle' });
  await action();
  await navigation;
};

const runBrowserChecks = async (frontendUrl, backendUrl) => {
  const browser = await chromium.launch({ headless: true });
  const localHttpErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      const url = response.url();
      if (
        response.status() >= 400 &&
        (url.startsWith(frontendUrl) || url.startsWith(backendUrl))
      ) {
        localHttpErrors.push(`${response.status()} ${url}`);
      }
    });

    await page.goto(frontendUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /AIOSK 키오스크/ }).waitFor({ timeout: 15000 });
    await page.getByRole('tab', { name: /Browser E2E Coffee/ }).waitFor({ timeout: 15000 });
    await page.getByText('Browser E2E Latte').first().click();
    await page.getByRole('button', { name: /5,500원 담기/ }).click();
    await page.getByText('총 1개').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '주문하기' }).click();
    await page.getByText('주문이 완료되었습니다').waitFor({ timeout: 15000 });
    await page.getByText('주문 접수').waitFor({ timeout: 10000 });
    await page.getByText('Browser E2E Latte').first().waitFor({ timeout: 10000 });

    await page.goto(`${backendUrl}/admin/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('사용자명').fill(config.adminUsername);
    await page.getByLabel('비밀번호').fill(config.adminPassword);
    await submitAndWait(page, () => page.getByRole('button', { name: /로그인/ }).click());
    await page.getByRole('heading', { name: /대시보드/ }).waitFor({ timeout: 15000 });
    await page.getByText('온라인 1 / 전체 1').waitFor({ timeout: 10000 });

    await page.goto(`${backendUrl}/admin/orders`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /주문 관리/ }).waitFor({ timeout: 15000 });
    await page.getByText('Browser E2E Latte').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /상세/ }).first().click();
    await page.locator('#orderDetailContent').getByText('Browser E2E Latte').waitFor({ timeout: 10000 });
    await page.locator('#orderDetailModal').getByRole('button', { name: '닫기' }).click();
    await page.locator('#orderDetailModal').waitFor({ state: 'hidden', timeout: 10000 });

    page.once('dialog', dialog => dialog.accept());
    const statusResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' &&
      response.url().startsWith(`${backendUrl}/admin/orders/`) &&
      response.url().endsWith('/status')
    ));
    await page.getByRole('button', { name: /준비시작/ }).first().click();
    const statusResponse = await statusResponsePromise;
    assert.equal(statusResponse.ok(), true, 'admin order status update should return a successful response');
    await page.goto(`${backendUrl}/admin/orders`, { waitUntil: 'networkidle' });
    await page.getByText('준비중').first().waitFor({ timeout: 10000 });

    await page.goto(`${backendUrl}/admin/categories`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /카테고리 관리/ }).waitFor({ timeout: 15000 });
    await page.locator('#newCategoryName').fill('Admin Browser Category');
    await page.locator('#newCategorySortOrder').fill('9');
    await submitAndWait(page, () => page.getByRole('button', { name: '추가' }).click());
    await page.locator('input[name="name"][value="Admin Browser Category"]').waitFor({ timeout: 10000 });

    await page.goto(`${backendUrl}/admin/menus`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /메뉴 관리/ }).waitFor({ timeout: 15000 });
    await page.locator('#newMenuName').fill('Admin Browser Menu');
    await page.locator('#newMenuCategory').selectOption({ label: 'Admin Browser Category' });
    await page.locator('#newMenuPrice').fill('6200');
    await page.locator('#newMenuDescription').fill('Created through EJS browser E2E');
    await submitAndWait(page, () => page.getByRole('button', { name: '추가' }).click());
    await page.locator('input[name="name"][value="Admin Browser Menu"]').waitFor({ timeout: 10000 });

    assert.deepEqual(pageErrors, [], `Unexpected browser page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(localHttpErrors, [], `Unexpected local HTTP errors: ${localHttpErrors.join('\n')}`);
  } finally {
    await browser.close();
  }
};

const main = async () => {
  config = createConfig();

  let backend;
  let frontend;
  let databasePrepared = false;

  try {
    await resetDatabase();
    databasePrepared = true;
    backend = await startBackend();
    frontend = await startFrontend(backend.baseUrl);
    await runBrowserChecks(frontend.baseUrl, backend.baseUrl);
    await verifyBrowserEffects();
    console.log('ok browser E2E');
  } finally {
    await stopProcess(frontend);
    await stopProcess(backend);
    if (databasePrepared) {
      await dropDatabase();
    }
  }
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
