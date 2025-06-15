// src/routes/admin.routes.js
module.exports = app => {
  const adminController = require("../controllers/admin.controller.js");
  var router = require("express").Router();

  // Admin Login
  router.post("/login", adminController.login);

  // Admin Registration (optional, for initial setup - secure appropriately in production)
  // router.post("/register", adminController.register);

  app.use('/api/admin', router);
};
