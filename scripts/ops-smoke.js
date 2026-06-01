#!/usr/bin/env node

const assert = require('assert/strict');

const DEFAULT_TIMEOUT_MS = 10000;

if (process.argv.length > 2) {
  console.error('Usage: scripts/ops-smoke.js');
  process.exit(1);
}

const rawBaseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || '').trim() || 'http://127.0.0.1:3000';
const parsedBaseUrl = new URL(rawBaseUrl);
if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
  throw new Error(`SMOKE_BASE_URL must use http or https, got: ${rawBaseUrl}`);
}
let timeoutMs = DEFAULT_TIMEOUT_MS;
const rawTimeoutMs = process.env.SMOKE_TIMEOUT_MS;
if (rawTimeoutMs !== undefined && rawTimeoutMs !== '') {
  const timeoutText = typeof rawTimeoutMs === 'number'
    ? String(rawTimeoutMs)
    : (typeof rawTimeoutMs === 'string' ? rawTimeoutMs.trim() : '');
  const parsedTimeoutMs = /^[1-9][0-9]*$/.test(timeoutText) ? Number(timeoutText) : null;
  if (!Number.isSafeInteger(parsedTimeoutMs)) {
    throw new Error('SMOKE_TIMEOUT_MS must be a positive integer.');
  }
  timeoutMs = parsedTimeoutMs;
}

['SMOKE_RUN_WRITE', 'SMOKE_SKIP_ADMIN_SESSION'].forEach((envName) => {
  const value = process.env[envName];
  if (value !== undefined && value !== '' && !['0', '1', 'true', 'false'].includes(value)) {
    throw new Error(`${envName} must be 0, 1, true, or false.`);
  }
});

let adminUsername = '';
let adminPassword = '';
for (const [usernameEnvName, passwordEnvName] of [
  ['SMOKE_ADMIN_USERNAME', 'SMOKE_ADMIN_PASSWORD'],
  ['ADMIN_USERNAME', 'ADMIN_PASSWORD']
]) {
  const username = process.env[usernameEnvName] || '';
  const password = process.env[passwordEnvName] || '';
  if (!username && !password) {
    continue;
  }
  if (!username || !password) {
    throw new Error(`Set both ${usernameEnvName} and ${passwordEnvName}, or unset both to fall back.`);
  }
  adminUsername = username;
  adminPassword = password;
  break;
}

const config = {
  baseUrl: parsedBaseUrl.toString().replace(/\/$/, ''),
  timeoutMs,
  metricsToken: process.env.SMOKE_METRICS_TOKEN || process.env.METRICS_TOKEN || '',
  adminUsername,
  adminPassword,
  runWrite: process.env.SMOKE_RUN_WRITE === '1' || process.env.SMOKE_RUN_WRITE === 'true',
  skipAdminSession: process.env.SMOKE_SKIP_ADMIN_SESSION === '1' || process.env.SMOKE_SKIP_ADMIN_SESSION === 'true'
};

if (config.runWrite && !config.adminUsername) {
  throw new Error('SMOKE_RUN_WRITE=1 requires SMOKE_ADMIN_USERNAME/SMOKE_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD.');
}

const assertIncludes = (text, expected, context) => {
  assert.ok(text.includes(expected), `${context} should include "${expected}"`);
};

const request = async (method, route, options = {}) => {
  const headers = {
    ...options.headers
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;
  try {
    response = await fetch(new URL(route, `${config.baseUrl}/`).toString(), {
      method,
      headers,
      body: options.form
        ? new URLSearchParams(options.form).toString()
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      redirect: options.redirect || 'follow',
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${method} ${route} timed out after ${config.timeoutMs}ms`);
    }
    throw new Error(`${method} ${route} failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (options.status !== undefined) {
    const expected = Array.isArray(options.status) ? options.status : [options.status];
    if (!expected.includes(response.status)) {
      throw new Error(
        `${method} ${route} expected HTTP ${expected.join(' or ')}, got ${response.status}: ${text.slice(0, 400)}`
      );
    }
  }

  return {
    response,
    text,
    cookie: typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
        .map(cookie => cookie.split(';')[0])
        .join('; ')
      : (response.headers.get('set-cookie') ? response.headers.get('set-cookie').split(';')[0] : ''),
    rawCookie: typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie().join('\n')
      : response.headers.get('set-cookie') || ''
  };
};

const requestJson = async (method, route, options = {}) => {
  const result = await request(method, route, options);
  if (!result.text) return null;

  try {
    return JSON.parse(result.text);
  } catch (error) {
    throw new Error(`${method} ${route} returned non-JSON response (${result.response.status}): ${result.text.slice(0, 400)}`);
  }
};

const checkMetrics = async () => {
  const headers = {};
  if (config.metricsToken) {
    headers['x-metrics-token'] = config.metricsToken;
  }

  const expectedMetricsStatus = config.metricsToken ? 200 : [200, 403];
  const metrics = await request('GET', '/metrics', { headers, status: expectedMetricsStatus });
  if (metrics.response.status === 403 && !config.metricsToken) {
    throw new Error('GET /metrics is protected. Set SMOKE_METRICS_TOKEN to run deployment smoke.');
  }

  assertIncludes(metrics.text, 'aiosk_process_uptime_seconds', 'metrics response');
  assertIncludes(metrics.text, 'aiosk_http_requests_total', 'metrics response');
};

const runReadOnlyChecks = async () => {
  const apiIndex = await requestJson('GET', '/api', { status: 200 });
  assert.equal(apiIndex.service, 'AIOSK Backend API');
  assert.equal(apiIndex.status, 'ok');
  assert.equal(typeof apiIndex.links.openapi, 'string');

  const openapi = await requestJson('GET', '/api-docs.json', { status: 200 });
  assert.equal(openapi.openapi, '3.0.0');
  assert.ok(openapi.paths, 'OpenAPI document should include paths');
  assert.ok(openapi.paths['/api/public/orders'], 'OpenAPI document should include public order path');

  const liveness = await requestJson('GET', '/healthz', { status: 200 });
  assert.equal(liveness.status, 'alive');

  const readiness = await requestJson('GET', '/readyz', { status: 200 });
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.checks.database.status, 'up');

  await checkMetrics();

  const publicCategories = await requestJson('GET', '/api/public/categories', { status: 200 });
  assert.ok(Array.isArray(publicCategories), 'GET /api/public/categories should return an array');

  const publicMenus = await requestJson('GET', '/api/public/menus', { status: 200 });
  assert.ok(Array.isArray(publicMenus), 'GET /api/public/menus should return an array');

  const authBoundary = await requestJson('GET', '/api/admin/orders', { status: 403 });
  assert.match(authBoundary.message || '', /token/i);

  const loginPage = await request('GET', '/admin/login', { status: 200 });
  assertIncludes(loginPage.text, 'action="/admin/login"', 'admin login page');

  console.log('ok read-only deployment smoke');
};

const runAdminChecks = async () => {
  if (!config.adminUsername) {
    console.log('skipped admin deployment smoke; set SMOKE_ADMIN_USERNAME/SMOKE_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD to enable it');
    return null;
  }

  const login = await requestJson('POST', '/api/admin/login', {
    status: 200,
    body: {
      username: config.adminUsername,
      password: config.adminPassword
    }
  });
  const token = login && login.data && login.data.token;
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 20, 'admin JWT should be present');

  const kioskStatus = await requestJson('GET', '/api/admin/kiosks/status', {
    status: 200,
    token
  });
  assert.equal(kioskStatus.success, true);
  assert.ok(Array.isArray(kioskStatus.data), 'admin kiosk status should include data array');

  if (!config.skipAdminSession) {
    const sessionLoginPage = await request('GET', '/admin/login', { status: 200 });
    const csrfTokenMatch = sessionLoginPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfTokenMatch, 'admin HTML should include a CSRF token');
    const csrfToken = csrfTokenMatch[1];

    const sessionLogin = await request('POST', '/admin/login', {
      status: 302,
      redirect: 'manual',
      cookie: sessionLoginPage.cookie,
      form: {
        _csrf: csrfToken,
        username: config.adminUsername,
        password: config.adminPassword
      }
    });

    const sessionCookie = sessionLogin.cookie;
    const rawCookie = sessionLogin.rawCookie;
    assert.ok(sessionCookie.includes('connect.sid='), 'admin session login should set connect.sid');
    assertIncludes(rawCookie, 'HttpOnly', 'admin session cookie');
    assert.match(rawCookie, /SameSite=(Lax|Strict|None)/i, 'admin session cookie should set SameSite');

    if (config.baseUrl.startsWith('https://')) {
      assertIncludes(rawCookie, 'Secure', 'admin session cookie on HTTPS');
    }

    const dashboardPage = await request('GET', '/admin', {
      status: 200,
      cookie: sessionCookie
    });
    assertIncludes(dashboardPage.text, '/admin/orders', 'admin dashboard page');
    assertIncludes(dashboardPage.text, '/admin/menus', 'admin dashboard page');

    const logoutResponse = await request('POST', '/admin/logout', {
      status: 302,
      redirect: 'manual',
      cookie: sessionCookie,
      form: {
        _csrf: csrfToken
      }
    });
    assert.equal(logoutResponse.response.headers.get('location'), '/admin/login');

    const postLogoutDashboard = await request('GET', '/admin', {
      status: 302,
      redirect: 'manual',
      cookie: sessionCookie
    });
    assert.equal(postLogoutDashboard.response.headers.get('location'), '/admin/login');
  }

  console.log('ok admin deployment smoke');
  return token;
};

const runWriteChecks = async (token) => {
  if (!config.runWrite) {
    console.log('skipped write deployment smoke; set SMOKE_RUN_WRITE=1 to enable it');
    return;
  }

  const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  let categoryId;
  let menuId;
  let orderId;
  let primaryError;
  const cleanupErrors = [];

  const cleanup = async (method, route, options) => {
    try {
      await requestJson(method, route, options);
    } catch (error) {
      cleanupErrors.push(`${method} ${route}: ${error.message}`);
    }
  };

  try {
    const category = await requestJson('POST', '/api/categories', {
      status: 201,
      token,
      body: {
        name: `Smoke Category ${runId}`,
        sort_order: 9999
      }
    });
    categoryId = category.id;
    assert.equal(typeof categoryId, 'number');

    const menu = await requestJson('POST', '/api/menus', {
      status: 201,
      token,
      body: {
        category_id: categoryId,
        name: `Smoke Menu ${runId}`,
        price: 1234,
        description: 'Created by deployment smoke test',
        status: 'FOR_SALE'
      }
    });
    menuId = menu.id;
    assert.equal(typeof menuId, 'number');

    const order = await requestJson('POST', '/api/public/orders', {
      status: 201,
      body: {
        items: [
          {
            menuId,
            quantity: 1
          }
        ]
      }
    });
    orderId = order.orderId;
    assert.equal(typeof orderId, 'number');
    assert.equal(order.status, 'RECEIVED');
    assert.equal(Number(order.totalPrice), 1234);

    const detail = await requestJson('GET', `/api/admin/orders/${orderId}`, {
      status: 200,
      token
    });
    assert.equal(detail.success, true);
    assert.equal(Number(detail.data.items[0].menu_id), menuId);

    const cancelled = await requestJson('PATCH', `/api/admin/orders/${orderId}/cancel`, {
      status: 200,
      token
    });
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.status, 'CANCELLED');
    orderId = undefined;
  } catch (error) {
    primaryError = error;
  } finally {
    if (orderId) {
      await cleanup('PATCH', `/api/admin/orders/${orderId}/cancel`, { status: 200, token });
    }
    if (menuId) {
      await cleanup('DELETE', `/api/menus/${menuId}`, { status: 200, token });
    }
    if (categoryId) {
      await cleanup('DELETE', `/api/categories/${categoryId}`, { status: 200, token });
    }
  }

  if (cleanupErrors.length > 0) {
    const cleanupMessage = `Write smoke cleanup failed:\n${cleanupErrors.join('\n')}`;
    if (primaryError) {
      primaryError.message = `${primaryError.message}\n\n${cleanupMessage}`;
      throw primaryError;
    }
    throw new Error(cleanupMessage);
  }

  if (primaryError) {
    throw primaryError;
  }

  console.log('ok write deployment smoke');
};

const main = async () => {
  console.log(`running deployment smoke against ${config.baseUrl}`);
  await runReadOnlyChecks();
  const token = await runAdminChecks();
  await runWriteChecks(token);
  console.log('ok deployment smoke');
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
