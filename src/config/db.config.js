// src/config/db.config.js
require('dotenv').config(); // Ensure this is at the top if you run this file independently
const { loadEnvFileSecrets } = require('../utils/envSecrets');
loadEnvFileSecrets();

module.exports = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};
