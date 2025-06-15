// src/controllers/order.controller.js
const Order = require("../models/order.model.js");

// Create a new Order
exports.create = async (req, res) => {
  // Validate request
  if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
    return res.status(400).send({
      message: "Order must contain at least one item and 'items' must be an array!"
    });
  }

  // Further validation for each item can be done here or is handled by the model
  for (const item of req.body.items) {
    if (item.menu_id === undefined || item.quantity === undefined) {
      return res.status(400).send({ message: "Each item must have menu_id and quantity." });
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      return res.status(400).send({ message: `Invalid quantity for menu item ID ${item.menu_id}. Must be a positive number.` });
    }
     if (typeof item.menu_id !== 'number' || item.menu_id <= 0) { // Assuming menu_id is a positive integer
      return res.status(400).send({ message: `Invalid menu_id ${item.menu_id}. Must be a positive number.` });
    }
  }
  
  const orderData = {
    items: req.body.items,
    // status: req.body.status // Optional: client might suggest a status, or it defaults in model
  };
  if (req.body.status) { // Allow admin/system to set initial status if provided
      orderData.status = req.body.status;
  }


  try {
    const createdOrder = await Order.create(orderData);
    // The 'createdOrder' from model now includes items with price_per_item.
    // Fetch the full order details if needed (e.g., with menu names) for the response.
    const detailedOrder = await Order.findById(createdOrder.id); 
    res.status(201).send(detailedOrder || createdOrder); // Send detailed order if available
  } catch (error) {
    console.error("Controller Error creating order:", error.message, error.details || error);
    // Check for specific error messages from the model for more precise client feedback
    if (error.message.includes("not available or not for sale") || error.message.includes("must be positive")) {
        return res.status(400).send({ message: error.message });
    }
    res.status(500).send({
      message: error.message || "Some error occurred while creating the Order."
    });
  }
};

// Retrieve a single Order with an id
exports.findOne = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid Order ID format." });
  }

  try {
    const data = await Order.findById(id);
    if (data) {
      res.send(data);
    } else {
      res.status(404).send({
        message: `Cannot find Order with id ${id}.`
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Error retrieving Order with id " + id
    });
  }
};

// TODO: Implement other controller methods as needed:
// exports.findAll = async (req, res) => { ... }; // For admin to see all orders
// exports.updateStatus = async (req, res) => { ... }; // For admin to update order status
