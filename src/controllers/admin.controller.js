// src/controllers/admin.controller.js
const Admin = require("../models/admin.model.js");
const bcrypt = require('bcrypt'); // Corrected library name
const jwt = require('jsonwebtoken');
require('dotenv').config(); // To access process.env.JWT_SECRET

// Admin Login
exports.login = async (req, res) => {
  if (!req.body.username || !req.body.password) {
    return res.status(400).send({ message: "Username and password are required!" });
  }

  const { username, password } = req.body;

  try {
    const admin = await Admin.findByUsername(username);
    if (!admin) {
      return res.status(401).send({ message: "Invalid username or password." }); // Generic message
    }

    const isPasswordMatching = await bcrypt.compare(password, admin.password);
    if (!isPasswordMatching) {
      return res.status(401).send({ message: "Invalid username or password." }); // Generic message
    }

    // Passwords match, create JWT
    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not defined in .env file");
        return res.status(500).send({ message: "Authentication configuration error." });
    }

    const token = jwt.sign(
        { id: admin.id, username: admin.username },
        process.env.JWT_SECRET,
        { expiresIn: '1h' } // Token expires in 1 hour, adjust as needed
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
    console.error("Login error:", error);
    // Differentiate internal errors from auth failures if possible
    res.status(500).send({ message: error.message || "Error during login process." });
  }
};

// Admin Registration (for creating admin accounts)
exports.register = async (req, res) => {
  if (!req.body.username || !req.body.password) {
    return res.status(400).send({ message: "Username and password are required for registration!" });
  }
  // Add more validation if needed (e.g., password strength)
  if (req.body.password.length < 6) { // Example: Minimum password length
      return res.status(400).send({ message: "Password must be at least 6 characters long." });
  }

  const admin = new Admin({
    username: req.body.username,
    password: req.body.password // Plain password, will be hashed by model
  });

  try {
    const createdAdmin = await Admin.create(admin); // Model now handles hashing
    // Do not send password back in response
    res.status(201).send({
      message: "Admin registered successfully",
      data: { id: createdAdmin.id, username: createdAdmin.username }
    });
  } catch (error) {
    if (error.kind === "duplicate_username") {
        return res.status(409).send({ message: "Username already exists." }); // 409 Conflict
    }
    console.error("Registration error:", error);
    res.status(500).send({ message: error.message || "Error during registration." });
  }
};
