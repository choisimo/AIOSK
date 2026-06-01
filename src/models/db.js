// src/models/db.js
const mysql = require('mysql2');
const dbConfig = require('../config/db.config.js');
const logger = require('../utils/logger.js');

const rawPort = dbConfig.port === undefined || dbConfig.port === '' ? 3306 : dbConfig.port;
const portText = typeof rawPort === 'number' ? String(rawPort) : String(rawPort).trim();
const dbPort = /^[1-9][0-9]*$/.test(portText) ? Number(portText) : null;
if (!Number.isSafeInteger(dbPort) || dbPort > 65535) {
  throw new Error('DB_PORT must be a positive integer between 1 and 65535.');
}

// Create a connection pool
const pool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbPort,
  waitForConnections: dbConfig.waitForConnections,
  connectionLimit: dbConfig.connectionLimit,
  queueLimit: dbConfig.queueLimit
});

// Promisify for async/await usage
const promisePool = pool.promise();

// Test the connection (optional, but good for immediate feedback)
promisePool.getConnection()
  .then(connection => {
    logger.logInfo('Successfully connected to the database.');
    connection.release(); // Release the connection back to the pool
  })
  .catch(error => {
    logger.logError(error, null, { context: 'Database connection check' });
  });

module.exports = promisePool;
