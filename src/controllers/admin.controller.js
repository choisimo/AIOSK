// src/controllers/admin.controller.js
const Admin = require("../models/admin.model.js");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.js');

// Admin Login
exports.login = async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    logger.logWarning('Admin API login failed', {
      context: 'Admin API login',
      reason: 'missing_credentials',
      username: username.slice(0, 100),
      ip: req.ip,
      requestId: req.id
    });
    return res.status(400).send({ message: "Username and password are required!" });
  }

  try {
    const admin = await Admin.findByUsername(username);
    const passwordMatches = admin ? await bcrypt.compare(password, admin.password) : false;

    if (!admin || !passwordMatches) {
      logger.logWarning('Admin API login failed', {
        context: 'Admin API login',
        reason: 'invalid_credentials',
        username: username.slice(0, 100),
        ip: req.ip,
        requestId: req.id
      });
      return res.status(401).send({ message: "Invalid username or password." });
    }

    // Passwords match, create JWT
    if (!process.env.JWT_SECRET) {
        logger.logError(new Error('JWT_SECRET is not defined for admin token signing.'), req);
        return res.status(500).send({ message: "Authentication configuration error." });
    }

    const token = jwt.sign(
        { id: admin.id, username: admin.username },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // For security, do not send password back, even the hash
    res.send({
      message: "Login successful",
      data: {
        id: admin.id,
        username: admin.username,
        token: token
      }
    });

  } catch (error) {
    logger.logError(error, req, { context: 'Admin API login' });
    res.status(500).send({ message: "Error during login process." });
  }
};
