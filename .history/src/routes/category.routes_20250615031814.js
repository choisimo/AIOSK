// src/routes/category.routes.js
const authMiddleware = require("../middleware/auth.middleware.js"); // Import the middleware

module.exports = app => {
  const categories = require("../controllers/category.controller.js");
  var router = require("express").Router();

  // Apply middleware to all category routes that need protection
  // Create a new Category
  router.post("/", authMiddleware, categories.create);

  // Retrieve all Categories (can be public or protected, let's protect for consistency)
  router.get("/", authMiddleware, categories.findAll);

  // Retrieve a single Category with id (can be public or protected)
  router.get("/:id", authMiddleware, categories.findOne);

  // Update a Category with id
  router.put("/:id", authMiddleware, categories.update);

  // Delete a Category with id
  router.delete("/:id", authMiddleware, categories.delete);

  // Delete all Categories (if exposed, definitely protect)
  // router.delete("/", authMiddleware, categories.deleteAll);

  app.use('/api/categories', router);
};
