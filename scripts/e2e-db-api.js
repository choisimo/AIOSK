#!/usr/bin/env node

const assert = require('assert/strict');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

const rootDir = path.resolve(__dirname, '..');

if (process.argv.length > 2) {
  console.error('Usage: scripts/e2e-db-api.js');
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

const createConfig = () => {
  const appPortEnv = process.env.E2E_APP_PORT || process.env.PORT;
  const appPortEnvName = process.env.E2E_APP_PORT ? 'E2E_APP_PORT' : 'PORT';

  return {
    dbHost: process.env.DB_HOST || '127.0.0.1',
    dbPort: parsePort(process.env.DB_PORT, 3306, 'DB_PORT'),
    dbUser: process.env.DB_USER || 'root',
    dbPassword: process.env.DB_PASSWORD || 'root',
    dbName: process.env.DB_NAME || 'aiosk_e2e',
    appPort: parsePort(appPortEnv, 3100, appPortEnvName),
    jwtSecret: process.env.JWT_SECRET || 'aiosk-e2e-jwt-secret-at-least-32-characters',
    adminUsername: process.env.E2E_ADMIN_USERNAME || 'e2e_admin',
    adminPassword: process.env.E2E_ADMIN_PASSWORD || 'e2e_admin_password',
    uploadDir: process.env.E2E_UPLOAD_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'aiosk-e2e-uploads-')),
    removeUploadDir: !process.env.E2E_UPLOAD_DIR
  };
};

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
  await admin.end();

  const result = spawnSync(process.execPath, ['scripts/create-admin.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      DB_HOST: config.dbHost,
      DB_PORT: String(config.dbPort),
      DB_USER: config.dbUser,
      DB_PASSWORD: config.dbPassword,
      DB_NAME: config.dbName,
      ADMIN_USERNAME: config.adminUsername,
      ADMIN_PASSWORD: config.adminPassword
    },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error([
      'scripts/create-admin.js failed during E2E setup.',
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
};

const dropDatabase = async () => {
  assertSafeDatabaseName();
  const admin = await connectAdmin();
  await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(config.dbName)}`);
  await admin.end();
};

const startServer = async () => {
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
      SESSION_SECRET: 'local-e2e-session-secret-at-least-32-characters',
      SESSION_STORE: 'mysql',
      SESSION_COOKIE_SAME_SITE: 'lax',
      UPLOAD_DIR: config.uploadDir,
      MAX_FILE_SIZE: '5242880',
      PORT: String(config.appPort),
      NODE_ENV: 'test',
      LOG_LEVEL: 'error'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${config.appPort}`;
  let lastError;

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before readiness.\n${logs.join('')}`);
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return { child, logs, baseUrl };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  child.kill('SIGTERM');
  throw new Error(`Server did not become ready: ${lastError && lastError.message}\n${logs.join('')}`);
};

const stopServer = async (server) => {
  if (!server || !server.child || server.child.exitCode !== null) return;

  const exited = new Promise((resolve) => {
    server.child.once('exit', resolve);
  });

  server.child.kill('SIGTERM');
  await Promise.race([
    exited,
    sleep(5000).then(() => {
      if (server.child.exitCode === null) {
        server.child.kill('SIGKILL');
      }
    })
  ]);
};

const requestJson = async (baseUrl, method, route, options = {}) => {
  const headers = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${method} ${route} returned non-JSON response (${response.status}): ${text}`);
    }
  }

  if (options.status !== undefined) {
    assert.equal(
      response.status,
      options.status,
      `${method} ${route} expected ${options.status}, got ${response.status}: ${text}`
    );
  }

  return data;
};

const requestText = async (baseUrl, method, route, options = {}) => {
  const headers = {};
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: options.form ? new URLSearchParams(options.form).toString() : undefined,
    redirect: options.redirect || 'follow'
  });
  const text = await response.text();

  if (options.status !== undefined) {
    assert.equal(
      response.status,
      options.status,
      `${method} ${route} expected ${options.status}, got ${response.status}: ${text.slice(0, 300)}`
    );
  }

  return {
    response,
    text,
    cookie: typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
        .map(cookie => cookie.split(';')[0])
        .join('; ')
      : (response.headers.get('set-cookie') ? response.headers.get('set-cookie').split(';')[0] : '')
  };
};

const assertIncludes = (text, expected, context) => {
  assert.ok(text.includes(expected), `${context} should include "${expected}"`);
};

const runApiChecks = async ({ baseUrl }) => {
  const apiIndex = await requestJson(baseUrl, 'GET', '/api', { status: 200 });
  assert.equal(apiIndex.service, 'AIOSK Backend API');
  assert.equal(apiIndex.status, 'ok');
  assert.equal(apiIndex.links.openapi, `${baseUrl}/api-docs.json`);

  const liveness = await requestJson(baseUrl, 'GET', '/healthz', { status: 200 });
  assert.equal(liveness.status, 'alive');

  const readiness = await requestJson(baseUrl, 'GET', '/readyz', { status: 200 });
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.checks.database.status, 'up');

  const metrics = await requestText(baseUrl, 'GET', '/metrics', { status: 200 });
  assertIncludes(metrics.text, 'aiosk_process_uptime_seconds', 'metrics response');
  assertIncludes(metrics.text, 'aiosk_http_requests_total', 'metrics response');

  await requestJson(baseUrl, 'GET', '/api/admin/orders', { status: 403 });

  const login = await requestJson(baseUrl, 'POST', '/api/admin/login', {
    status: 200,
    body: {
      username: config.adminUsername,
      password: config.adminPassword
    }
  });
  const token = login && login.data && login.data.token;
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20);

  const kioskStatus = await requestJson(baseUrl, 'POST', '/api/public/kiosk/status', {
    status: 200,
    body: {
      kioskId: 'e2e-kiosk-1',
      label: 'E2E Kiosk',
      status: 'ONLINE',
      appVersion: 'e2e'
    }
  });
  assert.equal(kioskStatus.success, true);
  assert.equal(kioskStatus.data.kioskId, 'e2e-kiosk-1');
  assert.equal(kioskStatus.data.status, 'ONLINE');

  const adminKioskStatus = await requestJson(baseUrl, 'GET', '/api/admin/kiosks/status', {
    status: 200,
    token
  });
  assert.equal(adminKioskStatus.success, true);
  assert.equal(adminKioskStatus.summary.online, 1);
  assert.ok(adminKioskStatus.data.some((kiosk) => kiosk.kioskId === 'e2e-kiosk-1'));

  const category = await requestJson(baseUrl, 'POST', '/api/categories', {
    status: 201,
    token,
    body: {
      name: 'E2E Drinks',
      sort_order: 7
    }
  });
  assert.equal(typeof category.id, 'number');

  const updatedCategory = await requestJson(baseUrl, 'PUT', `/api/categories/${category.id}`, {
    status: 200,
    token,
    body: {
      name: 'E2E Drinks Updated',
      sort_order: 3
    }
  });
  assert.equal(updatedCategory.name, 'E2E Drinks Updated');

  const menu = await requestJson(baseUrl, 'POST', '/api/menus', {
    status: 201,
    token,
    body: {
      category_id: category.id,
      name: 'E2E Americano',
      price: 4500,
      description: 'Created by DB/API E2E',
      status: 'FOR_SALE'
    }
  });
  assert.equal(typeof menu.id, 'number');

  const updatedMenu = await requestJson(baseUrl, 'PUT', `/api/menus/${menu.id}`, {
    status: 200,
    token,
    body: {
      price: 5000,
      description: 'Updated by DB/API E2E'
    }
  });
  assert.equal(Number(updatedMenu.price), 5000);

  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const imageForm = new FormData();
  imageForm.append('image', new Blob([imageBytes], { type: 'image/png' }), 'e2e-menu.png');
  const uploadRoute = `/api/menus/${menu.id}/image`;
  const uploadResponse = await fetch(`${baseUrl}${uploadRoute}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: imageForm
  });
  const uploadText = await uploadResponse.text();
  let uploadedImage = null;
  if (uploadText) {
    try {
      uploadedImage = JSON.parse(uploadText);
    } catch (error) {
      throw new Error(`POST ${uploadRoute} returned non-JSON response (${uploadResponse.status}): ${uploadText}`);
    }
  }
  assert.equal(
    uploadResponse.status,
    200,
    `POST ${uploadRoute} expected 200, got ${uploadResponse.status}: ${uploadText}`
  );
  assert.ok(uploadedImage, 'menu image upload should return JSON body');
  assert.match(uploadedImage.imageUrl, /^\/uploads\/menus\/menu-\d+-\d+\.png$/);

  const uploadedImageResponse = await fetch(`${baseUrl}${uploadedImage.imageUrl}`);
  assert.equal(uploadedImageResponse.status, 200, 'uploaded image should be served from UPLOAD_DIR');

  const publicCategories = await requestJson(baseUrl, 'GET', '/api/public/categories', { status: 200 });
  assert.ok(publicCategories.some((item) => item.categoryId === category.id && item.name === 'E2E Drinks Updated'));

  const publicMenus = await requestJson(baseUrl, 'GET', `/api/public/menus?categoryId=${category.id}`, { status: 200 });
  assert.ok(publicMenus.some((item) => item.menuId === menu.id && item.price === 5000));

  const createdOrder = await requestJson(baseUrl, 'POST', '/api/public/orders', {
    status: 201,
    body: {
      items: [
        {
          menuId: menu.id,
          quantity: 2
        }
      ]
    }
  });
  assert.equal(createdOrder.status, 'RECEIVED');
  assert.equal(createdOrder.totalPrice, 10000);
  assert.equal(createdOrder.items[0].menuId, menu.id);

  const orderList = await requestJson(baseUrl, 'GET', '/api/admin/orders?limit=10', {
    status: 200,
    token
  });
  assert.equal(orderList.success, true);
  assert.ok(orderList.data.some((order) => order.id === createdOrder.orderId));

  const orderDetail = await requestJson(baseUrl, 'GET', `/api/admin/orders/${createdOrder.orderId}`, {
    status: 200,
    token
  });
  assert.equal(orderDetail.success, true);
  assert.equal(orderDetail.data.items[0].menu_id, menu.id);

  const statusUpdate = await requestJson(baseUrl, 'PATCH', `/api/admin/orders/${createdOrder.orderId}/status`, {
    status: 200,
    token,
    body: {
      status: 'COMPLETED'
    }
  });
  assert.equal(statusUpdate.success, true);
  assert.equal(statusUpdate.status, 'COMPLETED');

  const dashboard = await requestJson(baseUrl, 'GET', '/api/admin/statistics', {
    status: 200,
    token
  });
  assert.equal(dashboard.success, true);
  assert.ok(Number(dashboard.data.overview.total_orders) >= 1);
  assert.ok(Number(dashboard.data.overview.total_sales) >= 10000);

  const topMenus = await requestJson(baseUrl, 'GET', '/api/admin/statistics/top-menus?limit=5', {
    status: 200,
    token
  });
  assert.equal(topMenus.success, true);
  assert.ok(topMenus.data.menus.some((item) => item.menu_id === menu.id));

  const loginPage = await requestText(baseUrl, 'GET', '/admin/login', { status: 200 });
  assertIncludes(loginPage.text, '로그인', 'admin login page');
  const csrfTokenMatch = loginPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(csrfTokenMatch, 'admin HTML should include a CSRF token');
  const csrfToken = csrfTokenMatch[1];

  const sessionLogin = await requestText(baseUrl, 'POST', '/admin/login', {
    status: 302,
    redirect: 'manual',
    cookie: loginPage.cookie,
    form: {
      _csrf: csrfToken,
      username: config.adminUsername,
      password: config.adminPassword
    }
  });
  const sessionCookie = sessionLogin.cookie;
  const rawSessionCookie = typeof sessionLogin.response.headers.getSetCookie === 'function'
    ? sessionLogin.response.headers.getSetCookie().join('\n')
    : sessionLogin.response.headers.get('set-cookie') || '';
  assert.ok(sessionCookie.includes('connect.sid='), 'admin session login should set connect.sid');
  assertIncludes(rawSessionCookie, 'HttpOnly', 'admin session cookie');
  assertIncludes(rawSessionCookie, 'SameSite=Lax', 'admin session cookie');
  assert.equal(sessionLogin.response.headers.get('location'), '/admin');
  const sessionConnection = await mysql.createConnection({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName
  });
  try {
    const [sessionRows] = await sessionConnection.execute('SELECT COUNT(*) AS count FROM Sessions');
    assert.ok(Number(sessionRows[0].count) >= 1, 'admin session should be persisted in MySQL Sessions table');
  } finally {
    await sessionConnection.end();
  }

  const dashboardPage = await requestText(baseUrl, 'GET', '/admin', {
    status: 200,
    cookie: sessionCookie
  });
  assertIncludes(dashboardPage.text, '대시보드', 'admin dashboard page');
  assertIncludes(dashboardPage.text, '온라인 1 / 전체 1', 'admin dashboard kiosk status summary');
  assertIncludes(dashboardPage.text, 'const salesData =', 'admin dashboard extracted script');
  assertIncludes(dashboardPage.text, "window.addEventListener('aiosk:new-order'", 'admin dashboard socket bridge');
  assert.equal(
    dashboardPage.text.includes('const socket = io()'),
    false,
    'admin dashboard should use the shared admin socket connection'
  );

  const adminPages = [
    ['/admin/orders', '주문 관리'],
    ['/admin/menus', '메뉴 관리'],
    ['/admin/categories', '카테고리 관리'],
    ['/admin/statistics', '통계 및 리포트']
  ];
  for (const [route, expectedText] of adminPages) {
    const page = await requestText(baseUrl, 'GET', route, {
      status: 200,
      cookie: sessionCookie
    });
    assertIncludes(page.text, expectedText, `${route} page`);

    if (route === '/admin/orders') {
      assertIncludes(page.text, 'function updateOrderStatus', 'admin orders extracted script');
      assertIncludes(page.text, "window.addEventListener('aiosk:new-order'", 'admin orders socket bridge');
      assert.equal(
        page.text.includes('const socket = io()'),
        false,
        'admin orders should use the shared admin socket connection'
      );
    }
  }

  const ejsOrderDetail = await requestJson(baseUrl, 'GET', `/admin/orders/${createdOrder.orderId}.json`, {
    status: 200,
    cookie: sessionCookie
  });
  assert.equal(ejsOrderDetail.success, true);
  assert.equal(ejsOrderDetail.data.id, createdOrder.orderId);

  const logoutResponse = await requestText(baseUrl, 'POST', '/admin/logout', {
    status: 302,
    redirect: 'manual',
    cookie: sessionCookie,
    form: {
      _csrf: csrfToken
    }
  });
  assert.equal(logoutResponse.response.headers.get('location'), '/admin/login');

  const postLogoutDashboard = await requestText(baseUrl, 'GET', '/admin', {
    status: 302,
    redirect: 'manual',
    cookie: sessionCookie
  });
  assert.equal(postLogoutDashboard.response.headers.get('location'), '/admin/login');

  const deletedMenu = await requestJson(baseUrl, 'DELETE', `/api/menus/${menu.id}`, {
    status: 200,
    token
  });
  assert.match(deletedMenu.message, /deleted successfully/i);

  const deletedCategory = await requestJson(baseUrl, 'DELETE', `/api/categories/${category.id}`, {
    status: 200,
    token
  });
  assert.match(deletedCategory.message, /deleted successfully/i);
};

const main = async () => {
  config = createConfig();

  let server;
  let databasePrepared = false;
  try {
    await resetDatabase();
    databasePrepared = true;
    server = await startServer();
    try {
      await runApiChecks(server);
    } catch (error) {
      const serverLogs = server.logs.join('').trim();
      if (serverLogs) {
        error.message = `${error.message}\n\nServer output:\n${serverLogs}`;
      }
      throw error;
    }
    console.log('ok DB/API E2E');
  } finally {
    await stopServer(server);
    if (databasePrepared) {
      await dropDatabase();
    }
    if (config.removeUploadDir) {
      fs.rmSync(config.uploadDir, { recursive: true, force: true });
    }
  }
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
