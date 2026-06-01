// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.js');

const verifyToken = (req, res, next) => {
  let token = req.headers['authorization']; // Common header for JWT

  if (!token) {
    return res.status(403).send({ message: "No token provided!" });
  }

  if (token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  if (!process.env.JWT_SECRET) {
    logger.logError(new Error('JWT_SECRET is not defined for token verification.'), req);
    return res.status(500).send({ message: "Authentication configuration error." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).send({ message: "Unauthorized! Token was expired." });
      }
      return res.status(401).send({ message: "Unauthorized! Invalid Token." });
    }

    req.adminId = decoded.id;
    req.adminUsername = decoded.username;
    next();
  });
};

module.exports = verifyToken;
