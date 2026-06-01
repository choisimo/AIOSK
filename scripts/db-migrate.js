#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const migrationEnvFile = process.env.MIGRATION_ENV_FILE;
require('dotenv').config(migrationEnvFile ? { path: migrationEnvFile } : undefined);
const { loadEnvFileSecrets } = require('../src/utils/envSecrets');
loadEnvFileSecrets();

const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(rootDir, 'database', 'migrations');

const composeDbHost = process.env.COMPOSE_DB_HOST ||
  (process.env.COMPOSE_DB_BIND === '0.0.0.0'
    ? '127.0.0.1'
    : process.env.COMPOSE_DB_BIND);

const normalizeDatabasePort = (value) => {
  const rawPort = value === undefined || value === '' ? 3306 : value;
  const portText = typeof rawPort === 'number' ? String(rawPort) : String(rawPort).trim();
  const port = /^[1-9][0-9]*$/.test(portText) ? Number(portText) : null;

  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error('DB_PORT/COMPOSE_DB_PORT must be a positive integer between 1 and 65535.');
  }

  return port;
};

let config;

const command = process.argv[2] || 'status';
const commandArgs = process.argv.slice(3);
const commandArg = commandArgs[0];

const usage = () => {
  console.error([
    'Usage:',
    '  npm run db:migrate -- up [limit]',
    '  npm run db:migrate -- status',
    '  npm run db:migrate -- down [count]',
    '',
    'Environment:',
    '  MIGRATION_ENV_FILE=/path/to/env  Load a specific env file before connecting.',
    '  DB_* values take precedence; COMPOSE_DB_* values are accepted for compose env files.',
    '  DB_PASSWORD_FILE=/run/secrets/db_password is accepted for the DB password.',
    '  COMPOSE_DB_BIND=0.0.0.0 is treated as 127.0.0.1 for host-side migration clients.',
    '',
    'Safety:',
    '  up/down against non-aiosk_e2e* DB_NAME require confirmation:',
    '  CONFIRM_MIGRATION_APPLY=<DB_NAME> npm run db:migrate -- up',
    '  CONFIRM_MIGRATION_ROLLBACK=<DB_NAME> npm run db:migrate -- down'
  ].join('\n'));
};

const assertSafeMutation = (expectedEnvName) => {
  if (config.database.startsWith('aiosk_e2e')) return;
  if (process.env[expectedEnvName] === config.database) return;

  throw new Error(
    `Refusing to mutate DB_NAME=${config.database} without ${expectedEnvName}=${config.database}.`
  );
};

const parsePositiveInteger = (value, fallback) => {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
};

const checksum = (content) => crypto.createHash('sha256').update(content).digest('hex');

const parseMigrationFile = (file) => {
  const match = file.match(/^([0-9]{12,})_([a-z0-9_]+)\.up\.sql$/);
  const version = match[1];
  const name = match[2];
  const upPath = path.join(migrationsDir, file);
  const downPath = path.join(migrationsDir, `${version}_${name}.down.sql`);

  return {
    version,
    name,
    upPath,
    downPath,
    upSql: fs.readFileSync(upPath, 'utf8'),
    downSql: fs.readFileSync(downPath, 'utf8')
  };
};

const loadMigrations = () => {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const migrationFilePattern = /^[0-9]{12,}_[a-z0-9_]+\.(up|down)\.sql$/;
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const unexpectedEntries = entries
    .filter((entry) => !entry.isFile() || !migrationFilePattern.test(entry.name))
    .map((entry) => entry.name);
  if (unexpectedEntries.length > 0) {
    throw new Error(`Unexpected migration directory entry: ${unexpectedEntries.join(', ')}`);
  }

  const files = entries.map((entry) => entry.name);
  const upFiles = files.filter((file) => /^[0-9]{12,}_[a-z0-9_]+\.up\.sql$/.test(file));
  const downFiles = new Set(files.filter((file) => /^[0-9]{12,}_[a-z0-9_]+\.down\.sql$/.test(file)));
  const upFileSet = new Set(upFiles);

  for (const upFile of upFiles) {
    const downFile = upFile.replace(/\.up\.sql$/, '.down.sql');
    if (!downFiles.has(downFile)) {
      throw new Error(`Down migration not found: ${downFile}`);
    }
  }

  for (const downFile of downFiles) {
    const upFile = downFile.replace(/\.down\.sql$/, '.up.sql');
    if (!upFileSet.has(upFile)) {
      throw new Error(`Down migration has no matching up migration: ${downFile}`);
    }
  }

  const migrations = upFiles
    .map(parseMigrationFile)
    .sort((a, b) => a.version.localeCompare(b.version));

  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  return migrations;
};

const connect = () => mysql.createConnection({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  multipleStatements: true
});

const ensureMigrationTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS SchemaMigrations (
      version VARCHAR(32) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const getApplied = async (connection) => {
  const [rows] = await connection.query(
    'SELECT version, name, checksum, applied_at FROM SchemaMigrations ORDER BY version ASC'
  );
  return rows;
};

const getMigrationDrift = (migrations, appliedRows) => {
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const appliedByVersion = new Map(appliedRows.map((row) => [row.version, row]));
  const changed = [];
  const orphaned = [];

  for (const migration of migrations) {
    const applied = appliedByVersion.get(migration.version);
    if (applied && applied.checksum !== checksum(migration.upSql)) {
      changed.push(`${migration.version}_${migration.name}`);
    }
  }

  for (const row of appliedRows) {
    if (!migrationsByVersion.has(row.version)) {
      orphaned.push(`${row.version}_${row.name}`);
    }
  }

  return { changed, orphaned };
};

const assertNoMigrationDrift = (migrations, appliedRows) => {
  const { changed, orphaned } = getMigrationDrift(migrations, appliedRows);
  if (changed.length === 0 && orphaned.length === 0) return;

  throw new Error([
    'Refusing to mutate schema because migration history differs from local files.',
    changed.length > 0 ? `changed: ${changed.join(', ')}` : '',
    orphaned.length > 0 ? `orphaned: ${orphaned.join(', ')}` : '',
    'Run npm run db:migrate:status with the same image/env and resolve drift before up/down.'
  ].filter(Boolean).join('\n'));
};

const printStatus = async (connection, migrations) => {
  const appliedRows = await getApplied(connection);
  const appliedByVersion = new Map(appliedRows.map((row) => [row.version, row]));
  const knownVersions = new Set(migrations.map((migration) => migration.version));

  for (const migration of migrations) {
    const applied = appliedByVersion.get(migration.version);
    const digest = checksum(migration.upSql);
    const state = applied
      ? (applied.checksum === digest ? 'applied' : 'changed')
      : 'pending';

    console.log(`${state.padEnd(8)} ${migration.version}_${migration.name}`);
  }

  for (const row of appliedRows) {
    if (!knownVersions.has(row.version)) {
      console.log(`orphaned ${row.version}_${row.name}`);
    }
  }
};

const runUp = async (connection, migrations, limit) => {
  assertSafeMutation('CONFIRM_MIGRATION_APPLY');
  const appliedRows = await getApplied(connection);
  assertNoMigrationDrift(migrations, appliedRows);
  const appliedByVersion = new Map(appliedRows.map((row) => [row.version, row]));
  let appliedCount = 0;

  for (const migration of migrations) {
    const digest = checksum(migration.upSql);
    const applied = appliedByVersion.get(migration.version);

    if (applied) {
      if (applied.checksum !== digest) {
        throw new Error(
          `Applied migration checksum changed: ${migration.version}_${migration.name}`
        );
      }
      continue;
    }

    if (appliedCount >= limit) break;

    console.log(`applying ${migration.version}_${migration.name}`);
    await connection.query(migration.upSql);
    await connection.query(
      'INSERT INTO SchemaMigrations (version, name, checksum) VALUES (?, ?, ?)',
      [migration.version, migration.name, digest]
    );
    appliedCount += 1;
  }

  console.log(`Applied ${appliedCount} migration(s).`);
};

const runDown = async (connection, migrations, count) => {
  assertSafeMutation('CONFIRM_MIGRATION_ROLLBACK');
  const appliedRows = await getApplied(connection);
  assertNoMigrationDrift(migrations, appliedRows);
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const [rows] = await connection.query(
    `SELECT version, name FROM SchemaMigrations ORDER BY version DESC LIMIT ${count}`
  );

  if (rows.length === 0) {
    console.log('No applied migrations to roll back.');
    return;
  }

  let rolledBack = 0;
  for (const row of rows) {
    const migration = migrationsByVersion.get(row.version);
    if (!migration) {
      throw new Error(`Cannot roll back missing local migration file: ${row.version}_${row.name}`);
    }

    console.log(`rolling back ${migration.version}_${migration.name}`);
    await connection.query(migration.downSql);
    await connection.query('DELETE FROM SchemaMigrations WHERE version = ?', [migration.version]);
    rolledBack += 1;
  }

  console.log(`Rolled back ${rolledBack} migration(s).`);
};

const main = async () => {
  if (!['status', 'up', 'down'].includes(command)) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === 'status' && commandArgs.length > 0) {
    console.error(`Unexpected argument for status: ${commandArgs[0]}.`);
    usage();
    process.exitCode = 1;
    return;
  }

  if ((command === 'up' || command === 'down') && commandArgs.length > 1) {
    console.error(`Unexpected extra argument: ${commandArgs[1]}.`);
    usage();
    process.exitCode = 1;
    return;
  }

  const migrationLimit = command === 'up' ? parsePositiveInteger(commandArg, Number.POSITIVE_INFINITY) : null;
  const rollbackCount = command === 'down' ? parsePositiveInteger(commandArg, 1) : null;

  const databasePort = normalizeDatabasePort(process.env.DB_PORT || process.env.COMPOSE_DB_PORT);
  config = {
    host: process.env.DB_HOST || composeDbHost || 'localhost',
    port: databasePort,
    user: process.env.DB_USER || process.env.COMPOSE_DB_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.COMPOSE_DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.COMPOSE_DB_NAME || ''
  };

  if (!config.database) {
    throw new Error('DB_NAME is required.');
  }

  const migrations = loadMigrations();
  const connection = await connect();

  try {
    await ensureMigrationTable(connection);

    if (command === 'status') {
      await printStatus(connection, migrations);
    } else if (command === 'up') {
      await runUp(connection, migrations, migrationLimit);
    } else if (command === 'down') {
      await runDown(connection, migrations, rollbackCount);
    }
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
