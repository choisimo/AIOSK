// src/models/db.js
const mysql = require('mysql2');
const dbConfig = require('../config/db.config.js');

// Create a connection pool
const pool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: parseInt(dbConfig.port), // Ensure port is an integer
  waitForConnections: dbConfig.waitForConnections,
  connectionLimit: dbConfig.connectionLimit,
  queueLimit: dbConfig.queueLimit
});

// Promisify for async/await usage
const promisePool = pool.promise();

// Test the connection (optional, but good for immediate feedback)
promisePool.getConnection()
  .then(connection => {
    console.log('Successfully connected to the database.');
    connection.release(); // Release the connection back to the pool
  })
  .catch(error => {
    console.error('Error connecting to the database via db.js:', error.code, error.message);
    // Consider the impact of process.exit(1) in different environments
    // if (process.env.NODE_ENV === 'production') {
    //   process.exit(1); // More aggressive for production
    // }
  });

module.exports = promisePool;
