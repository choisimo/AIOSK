// src/routes/order.routes.js
const authMiddleware = require("../middleware/auth.middleware.js");

module.exports = app => {
  const orders = require("../controllers/order.controller.js");
  var router = require("express").Router();

  // Create a new Order (Public for Kiosk)
  router.post("/", orders.create);

  // Retrieve a single Order with id (Protected for Admin)
  router.get("/:id", authMiddleware, orders.findOne);

  // TODO: Add other routes as needed
  // router.get("/", authMiddleware, orders.findAll); // For Admin
  // router.put("/:id/status", authMiddleware, orders.updateStatus); // For Admin

  app.use('/api/orders', router);
};
