#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .reduce((values, rawLine, index) => {
      const lineNumber = index + 1;
      const trimmed = rawLine.replace(/\r$/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) return values;

      const envLine = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
      if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(envLine)) {
        fail(`malformed env line ${lineNumber} in ${filePath}`);
      }

      const separatorIndex = envLine.indexOf('=');
      const key = envLine.slice(0, separatorIndex);
      let value = envLine.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
};

const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
const fileEnv = envFiles.reduce((values, fileName) => ({
  ...values,
  ...parseEnvFile(path.join(rootDir, fileName))
}), {});
const env = {
  ...fileEnv,
  ...process.env
};
const apiUrl = env.VITE_API_URL?.trim();

['VITE_ALLOW_LOCAL_API_URL', 'VITE_USE_MOCK_DATA'].forEach((envName) => {
  const value = env[envName];
  if (value !== undefined && value !== '' && !['true', 'false'].includes(value)) {
    fail(`${envName} must be true or false for production frontend builds.`);
  }
});

const allowLocalApiUrl = env.VITE_ALLOW_LOCAL_API_URL === 'true';
const kioskStatusToken = env.VITE_KIOSK_STATUS_TOKEN?.trim();

if (!apiUrl) {
  fail('VITE_API_URL is required for production frontend builds.');
}

if (!allowLocalApiUrl && /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(apiUrl)) {
  fail('VITE_API_URL must not point to a local address for production frontend builds.');
}

if (env.VITE_USE_MOCK_DATA === 'true') {
  fail('VITE_USE_MOCK_DATA must be false for production frontend builds.');
}

if (kioskStatusToken && kioskStatusToken.length < 16) {
  fail('VITE_KIOSK_STATUS_TOKEN must be at least 16 characters when set.');
}

if (kioskStatusToken && /^(change_this|replace_with|your[_-])/i.test(kioskStatusToken)) {
  fail('VITE_KIOSK_STATUS_TOKEN must not use placeholder values.');
}

if (kioskStatusToken && /\s/.test(kioskStatusToken)) {
  fail('VITE_KIOSK_STATUS_TOKEN must not contain whitespace.');
}
