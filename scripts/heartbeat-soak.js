#!/usr/bin/env node

const assert = require('assert/strict');

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;

if (process.argv.length > 2) {
  console.error('Usage: scripts/heartbeat-soak.js');
  process.exit(1);
}

const parsePositiveInt = (value, fallback, envName) => {
  if (value === undefined || value === '') return fallback;
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${envName} must be a positive integer.`);
  }
  return parsed;
};

const rawBaseUrl = (process.env.SOAK_BASE_URL || process.env.SMOKE_BASE_URL || process.env.BASE_URL || '').trim() || DEFAULT_BASE_URL;
const parsedBaseUrl = new URL(rawBaseUrl);
if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
  throw new Error(`SOAK_BASE_URL must use http or https, got: ${rawBaseUrl}`);
}

let adminUsername = '';
let adminPassword = '';
for (const [usernameEnvName, passwordEnvName] of [
  ['SOAK_ADMIN_USERNAME', 'SOAK_ADMIN_PASSWORD'],
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
  durationMs: parsePositiveInt(process.env.SOAK_DURATION_MS, DEFAULT_DURATION_MS, 'SOAK_DURATION_MS'),
  intervalMs: parsePositiveInt(process.env.SOAK_INTERVAL_MS, DEFAULT_INTERVAL_MS, 'SOAK_INTERVAL_MS'),
  timeoutMs: parsePositiveInt(process.env.SOAK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'SOAK_TIMEOUT_MS'),
  kioskId: process.env.SOAK_KIOSK_ID || 'ops-heartbeat-soak',
  label: process.env.SOAK_KIOSK_LABEL || 'Ops Heartbeat Soak',
  appVersion: process.env.SOAK_APP_VERSION || 'ops-soak',
  kioskStatusToken: process.env.SOAK_KIOSK_STATUS_TOKEN || process.env.KIOSK_STATUS_TOKEN || '',
  adminUsername,
  adminPassword,
  maxAgeSeconds: parsePositiveInt(
    process.env.SOAK_MAX_AGE_SECONDS,
    Math.ceil(DEFAULT_INTERVAL_MS / 1000) + 15,
    'SOAK_MAX_AGE_SECONDS'
  )
};

if (!process.env.SOAK_MAX_AGE_SECONDS) {
  config.maxAgeSeconds = Math.ceil(config.intervalMs / 1000) + 15;
}

if (!/^[A-Za-z0-9._-]{1,100}$/.test(config.kioskId)) {
  throw new Error('SOAK_KIOSK_ID must be 1-100 characters using letters, numbers, dot, underscore, or hyphen.');
}

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;
  try {
    response = await fetch(new URL(route, `${config.baseUrl}/`).toString(), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
    text
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

const loginAdmin = async () => {
  if (!config.adminUsername) return null;

  const login = await requestJson('POST', '/api/admin/login', {
    status: 200,
    body: {
      username: config.adminUsername,
      password: config.adminPassword
    }
  });
  const token = login && login.data && login.data.token;
  assert.equal(typeof token, 'string', 'admin login should return a JWT token');
  assert.ok(token.length > 20, 'admin JWT should be present');
  return token;
};

const reportHeartbeat = async (iteration) => {
  const headers = {};
  if (config.kioskStatusToken) {
    headers['x-kiosk-status-token'] = config.kioskStatusToken;
  }

  const payload = {
    kioskId: config.kioskId,
    label: config.label,
    status: 'ONLINE',
    appVersion: config.appVersion
  };

  const response = await requestJson('POST', '/api/public/kiosk/status', {
    status: 200,
    headers,
    body: payload
  });

  assert.equal(response.success, true);
  assert.equal(response.data.kioskId, config.kioskId);
  assert.equal(response.data.status, 'ONLINE');
  assert.equal(response.data.reportedStatus, 'ONLINE');
  assert.equal(response.data.label, config.label);

  return {
    iteration,
    lastSeenAt: response.data.lastSeenAt,
    ageSeconds: response.data.ageSeconds
  };
};

const verifyAdminStatus = async (token) => {
  if (!token) return;

  const response = await requestJson('GET', '/api/admin/kiosks/status?limit=500', {
    status: 200,
    token
  });

  assert.equal(response.success, true);
  assert.ok(Array.isArray(response.data), 'admin kiosk status should return a data array');

  const kiosk = response.data.find((item) => item.kioskId === config.kioskId);
  assert.ok(kiosk, `admin kiosk status should include ${config.kioskId}`);
  assert.equal(kiosk.status, 'ONLINE');
  assert.equal(kiosk.reportedStatus, 'ONLINE');
  assert.ok(
    kiosk.ageSeconds <= config.maxAgeSeconds,
    `${config.kioskId} heartbeat age should be <= ${config.maxAgeSeconds}s, got ${kiosk.ageSeconds}s`
  );
};

const main = async () => {
  const token = await loginAdmin();
  const deadline = Date.now() + config.durationMs;
  let iteration = 0;
  let lastHeartbeat;

  console.log([
    `running heartbeat soak against ${config.baseUrl}`,
    `kioskId=${config.kioskId}`,
    `durationMs=${config.durationMs}`,
    `intervalMs=${config.intervalMs}`,
    token ? 'adminVerification=enabled' : 'adminVerification=skipped'
  ].join(' '));

  do {
    iteration += 1;
    lastHeartbeat = await reportHeartbeat(iteration);
    await verifyAdminStatus(token);

    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(config.intervalMs, remainingMs)));
    }
  } while (Date.now() < deadline);

  if (token) {
    await verifyAdminStatus(token);
  }

  console.log([
    'ok heartbeat soak',
    `heartbeats=${iteration}`,
    `lastSeenAt=${lastHeartbeat.lastSeenAt}`,
    `lastAgeSeconds=${lastHeartbeat.ageSeconds}`
  ].join(' '));
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
