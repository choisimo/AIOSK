// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config(); // To access process.env.JWT_SECRET

const verifyToken = (req, res, next) => {
  let token = req.headers['authorization']; // Common header for JWT

  if (!token) {
    return res.status(403).send({ message: "No token provided!" });
  }

  // Check if the token starts with 'Bearer '
  if (token.startsWith('Bearer ')) {
    // Remove 'Bearer ' from string
    token = token.slice(7, token.length);
  } else {
    // If it doesn't start with 'Bearer ', it might be a malformed token or not a Bearer token.
    // Depending on strictness, you could reject or try to use it as is.
    // For this implementation, we'll assume if 'Authorization' header is present, it should be Bearer.
    // Or, you could decide to allow the token directly if no "Bearer " prefix.
    // For now, let's be somewhat flexible but log a warning if not Bearer.
    // console.warn("Token does not start with 'Bearer '. Using token as is.");
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in .env file for token verification.");
    return res.status(500).send({ message: "Authentication configuration error." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).send({ message: "Unauthorized! Token was expired." });
      }
      // Other errors like JsonWebTokenError (malformed token)
      return res.status(401).send({ message: "Unauthorized! Invalid Token." });
    }
    // If token is valid, attach decoded payload to request object
    req.adminId = decoded.id; // Assuming your JWT payload has an 'id' field for the admin
    req.adminUsername = decoded.username; // And 'username'
    next(); // Proceed to the next middleware or the controller
  });
};

module.exports = verifyToken;
