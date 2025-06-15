// src/routes/menu.routes.js
const authMiddleware = require("../middleware/auth.middleware.js"); // Import the middleware

module.exports = app => {
  const menus = require("../controllers/menu.controller.js");
  var router = require("express").Router();

  // Apply middleware to all menu routes that need protection
  // Create a new Menu
  router.post("/", authMiddleware, menus.create);

  // Retrieve all Menus (typically public for a kiosk, but admin might need auth for management)
  // For this exercise, let's assume menu listing for admin management is protected.
  // If kiosk needs public menu listing, a separate public route or logic would be needed.
  router.get("/", authMiddleware, menus.findAll);

  // Retrieve a single Menu with id (similar to findAll, protect for admin management)
  router.get("/:id", authMiddleware, menus.findOne);

  // Update a Menu with id
  router.put("/:id", authMiddleware, menus.update);

  // Delete a Menu with id
  router.delete("/:id", authMiddleware, menus.delete);

  // Delete all Menus (if exposed, definitely protect)
  // router.delete("/", authMiddleware, menus.deleteAll);

  app.use('/api/menus', router);
};
