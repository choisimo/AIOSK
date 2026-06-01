#!/usr/bin/env node

const adminEnvFile = process.env.ADMIN_ENV_FILE;
require('dotenv').config(adminEnvFile ? { path: adminEnvFile } : undefined);
const { loadEnvFileSecrets } = require('../src/utils/envSecrets');
loadEnvFileSecrets();

const composeDbHost = process.env.COMPOSE_DB_HOST ||
  (process.env.COMPOSE_DB_BIND && process.env.COMPOSE_DB_BIND !== '0.0.0.0'
    ? process.env.COMPOSE_DB_BIND
    : 'localhost');
const dbEnvFallbacks = {
  DB_HOST: composeDbHost,
  DB_PORT: process.env.COMPOSE_DB_PORT,
  DB_USER: process.env.COMPOSE_DB_USER,
  DB_PASSWORD: process.env.COMPOSE_DB_PASSWORD,
  DB_NAME: process.env.COMPOSE_DB_NAME
};

Object.entries(dbEnvFallbacks).forEach(([key, value]) => {
  if (!process.env[key] && value) {
    process.env[key] = value;
  }
});

const bcrypt = require('bcrypt');
let sql;

const usage = [
  'Usage:',
  '  ADMIN_USERNAME=admin ADMIN_PASSWORD=<password> npm run admin:create',
  '  ADMIN_USERNAME=admin ADMIN_PASSWORD_FILE=/run/secrets/admin_password npm run admin:create',
  '  ADMIN_ENV_FILE=.env.production ADMIN_USERNAME=admin ADMIN_PASSWORD=<password> npm run admin:create',
  '  npm run admin:create -- --username admin --password <password>',
  '',
  'DB_* values take precedence; COMPOSE_DB_* values are accepted for compose env files.',
  'DB_PASSWORD_FILE=/run/secrets/db_password is accepted for the DB password.',
  'Password must be at least 8 characters. The plaintext password is never logged.'
].join('\n');

const createOrUpdateAdmin = async () => {
  const usernameArgIndex = process.argv.indexOf('--username');
  const passwordArgIndex = process.argv.indexOf('--password');
  const usernameArg = usernameArgIndex === -1 ? undefined : process.argv[usernameArgIndex + 1];
  const passwordArg = passwordArgIndex === -1 ? undefined : process.argv[passwordArgIndex + 1];

  if (usernameArgIndex !== -1 && (!usernameArg || usernameArg.startsWith('--'))) {
    throw new Error('--username requires a value.');
  }

  if (passwordArgIndex !== -1 && (!passwordArg || passwordArg.startsWith('--'))) {
    throw new Error('--password requires a value.');
  }

  const supportedOptions = new Set(['--username', '--password']);
  const unsupportedOption = process.argv
    .slice(2)
    .find(arg => arg.startsWith('--') && !supportedOptions.has(arg));
  if (unsupportedOption) {
    throw new Error(`Unsupported option: ${unsupportedOption}.`);
  }

  const duplicateOption = Array.from(supportedOptions)
    .find(option => process.argv.filter(arg => arg === option).length > 1);
  if (duplicateOption) {
    throw new Error(`Duplicate option: ${duplicateOption}.`);
  }

  const cliArgs = process.argv.slice(2);
  const consumedArgIndexes = new Set();
  cliArgs.forEach((arg, index) => {
    if (!supportedOptions.has(arg)) return;

    consumedArgIndexes.add(index);
    if (cliArgs[index + 1] && !cliArgs[index + 1].startsWith('--')) {
      consumedArgIndexes.add(index + 1);
    }
  });

  const unexpectedArgument = cliArgs.find((arg, index) => !consumedArgIndexes.has(index));
  if (unexpectedArgument) {
    throw new Error(`Unexpected argument: ${unexpectedArgument}.`);
  }

  const credentials = {
    username: (process.env.ADMIN_USERNAME || usernameArg || '').trim(),
    password: process.env.ADMIN_PASSWORD || passwordArg || ''
  };

  if (!credentials.username) {
    throw new Error('ADMIN_USERNAME or --username is required.');
  }

  if (!credentials.password) {
    throw new Error('ADMIN_PASSWORD or --password is required.');
  }

  if (credentials.password.length < 8) {
    throw new Error('Admin password must be at least 8 characters.');
  }

  sql = require('../src/models/db');
  const passwordHash = await bcrypt.hash(credentials.password, 12);
  const [result] = await sql.execute(
    `INSERT INTO Admins (username, password)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password = ?`,
    [credentials.username, passwordHash, passwordHash]
  );

  const action = result.affectedRows === 1 ? 'created' : 'updated';
  console.log(`Admin user "${credentials.username}" ${action}.`);
};

const main = async () => {
  try {
    await createOrUpdateAdmin();
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    process.exitCode = 1;
  } finally {
    if (sql) {
      await sql.end();
    }
  }
};

main();
