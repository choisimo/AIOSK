const fs = require('fs');

const DEFAULT_SECRET_KEYS = [
  'ADMIN_PASSWORD',
  'DB_PASSWORD',
  'JWT_SECRET',
  'KIOSK_STATUS_TOKEN',
  'METRICS_TOKEN',
  'SESSION_SECRET'
];
const loadedFileKeys = new Set();

const loadEnvFileSecrets = (keys = DEFAULT_SECRET_KEYS) => {
  const loaded = [];

  keys.forEach((key) => {
    const fileKey = `${key}_FILE`;
    const filePath = process.env[fileKey];

    if (!filePath) return;

    if (process.env[key]) {
      if (loadedFileKeys.has(key)) return;
      throw new Error(`${key} and ${fileKey} must not both be set.`);
    }

    const resolvedFilePath = filePath.startsWith('/run/secrets/')
      ? `${(process.env.AIOSK_SECRETS_DIR || '/run/secrets').replace(/\/+$/, '')}/${filePath.slice('/run/secrets/'.length)}`
      : filePath;
    let value;
    try {
      value = fs.readFileSync(resolvedFilePath, 'utf8').replace(/(?:\r?\n)+$/, '');
    } catch (error) {
      throw new Error(`Failed to read ${fileKey}: ${error.message}`);
    }

    if (!value) {
      throw new Error(`${fileKey} must not point to an empty file.`);
    }

    process.env[key] = value;
    loadedFileKeys.add(key);
    loaded.push(key);
  });

  return loaded;
};

module.exports = {
  loadEnvFileSecrets
};
