// src/controllers/category.controller.js
const Category = require("../models/category.model.js");

// Create and Save a new Category
exports.create = async (req, res) => {
  // Validate request
  if (!req.body.name) {
    return res.status(400).send({
      message: "Category name can not be empty!"
    });
  }

  // Create a Category
  const category = new Category({
    name: req.body.name,
    sort_order: req.body.sort_order
  });

  // Save Category in the database
  try {
    const data = await Category.create(category);
    res.status(201).send(data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Category."
    });
  }
};

// Retrieve all Categories from the database.
exports.findAll = async (req, res) => {
  const name = req.query.name; // For filtering by name, if provided

  try {
    const data = await Category.getAll(name);
    res.send(data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving categories."
    });
  }
};

// Find a single Category with an id
exports.findOne = async (req, res) => {
  const id = req.params.id;

  try {
    const data = await Category.findById(id);
    if (data) {
      res.send(data);
    } else {
      res.status(404).send({
        message: `Cannot find Category with id ${id}.`
      });
    }
  } catch (err) {
    // Differentiate between not found and other server errors if model throws specific error kinds
    if (err.kind === "not_found") {
         res.status(404).send({
             message: `Not found Category with id ${id}.`
         });
    } else {
         res.status(500).send({
             message: "Error retrieving Category with id " + id
         });
    }
  }
};

// Update a Category identified by the id in the request
exports.update = async (req, res) => {
  const id = req.params.id;

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send({
      message: "Data to update can not be empty!"
    });
  }

  // Construct category data from req.body
  // Only include fields that are actually present in the request body
  const categoryDataToUpdate = {};
  if (req.body.name !== undefined) {
    categoryDataToUpdate.name = req.body.name;
  }
  if (req.body.sort_order !== undefined) {
    categoryDataToUpdate.sort_order = req.body.sort_order;
  }
  
  // Prevent updating with an empty name if name is provided
  if (req.body.name === "") {
    return res.status(400).send({ message: "Category name cannot be empty if provided for update." });
  }


  try {
    const data = await Category.updateById(id, categoryDataToUpdate);
    if (data) {
      if (data.message === "No fields to update") {
        // If no actual update happened because payload was same as existing or empty after filtering
        const currentCategory = await Category.findById(id);
        return res.send(currentCategory);
      }
      res.send(data);
    } else {
      res.status(404).send({
        message: `Cannot update Category with id=${id}. Maybe Category was not found or req.body is empty!`
      });
    }
  } catch (err) {
     if (err.kind === "not_found") {
         res.status(404).send({
             message: `Not found Category with id ${id}.`
         });
     } else {
         res.status(500).send({
             message: "Error updating Category with id " + id
         });
     }
  }
};

// Delete a Category with the specified id in the request
exports.delete = async (req, res) => {
  const id = req.params.id;

  try {
    const data = await Category.remove(id);
    if (data) {
      res.send({ message: "Category was deleted successfully!" });
    } else {
      // This case might be handled if Category.remove returns null for not_found
      res.status(404).send({
        message: `Cannot delete Category with id=${id}. Maybe Category was not found!`
      });
    }
  } catch (err) {
    if (err.kind === "not_found") {
         res.status(404).send({
             message: `Not found Category with id ${id}.`
         });
    } else {
         res.status(500).send({
             message: "Could not delete Category with id " + id
         });
    }
  }
};

// Delete all Categories from the database. (Use with caution)
exports.deleteAll = async (req, res) => {
  try {
    const data = await Category.removeAll();
    res.send({ message: `${data.message || 'All Categories were deleted successfully!'}` });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while removing all categories."
    });
  }
};
