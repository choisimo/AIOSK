// src/controllers/category.controller.js
const Category = require("../models/category.model.js");
const logger = require("../utils/logger.js");

const parsePositiveInteger = (value) => {
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseNonNegativeInteger = (value) => {
  if (value === undefined || value === '') return 0;
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const normalizeRequiredText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
};

// Create and Save a new Category
exports.create = async (req, res) => {
  // Validate request
  const name = normalizeRequiredText(req.body.name);
  if (!name) {
    return res.status(400).send({
      message: "Category name can not be empty!"
    });
  }

  const sortOrder = parseNonNegativeInteger(req.body.sort_order);
  if (sortOrder === null) {
    return res.status(400).send({ message: "sort_order must be a non-negative integer." });
  }

  const category = {
    name,
    sort_order: sortOrder
  };

  // Save Category in the database
  try {
    const data = await Category.create(category);
    res.status(201).send(data);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin category create' });
    res.status(500).send({
      message: "Some error occurred while creating the Category."
    });
  }
};

// Retrieve all Categories from the database.
exports.findAll = async (req, res) => {
  const name = req.query.name === undefined || req.query.name === ''
    ? undefined
    : normalizeRequiredText(req.query.name);
  if (req.query.name !== undefined && req.query.name !== '' && !name) {
    return res.status(400).send({ message: "Invalid category name filter." });
  }

  try {
    const data = await Category.getAll(name);
    res.send(data);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin category list' });
    res.status(500).send({
      message: "Some error occurred while retrieving categories."
    });
  }
};

// Find a single Category with an id
exports.findOne = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
    return res.status(400).send({ message: "Invalid Category ID format." });
  }

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
    logger.logError(err, req, { context: 'Admin category detail' });
    res.status(500).send({
      message: "Error retrieving Category with id " + id
    });
  }
};

// Update a Category identified by the id in the request
exports.update = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
    return res.status(400).send({ message: "Invalid Category ID format." });
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send({
      message: "Data to update can not be empty!"
    });
  }

  // Construct category data from req.body
  // Only include fields that are actually present in the request body
  const categoryDataToUpdate = {};
  if (req.body.name !== undefined) {
    const name = normalizeRequiredText(req.body.name);
    if (!name) {
      return res.status(400).send({ message: "Category name cannot be empty if provided for update." });
    }
    categoryDataToUpdate.name = name;
  }
  if (req.body.sort_order !== undefined) {
    const sortOrder = parseNonNegativeInteger(req.body.sort_order);
    if (sortOrder === null) {
      return res.status(400).send({ message: "sort_order must be a non-negative integer." });
    }
    categoryDataToUpdate.sort_order = sortOrder;
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
    logger.logError(err, req, { context: 'Admin category update' });
    res.status(500).send({
      message: "Error updating Category with id " + id
    });
  }
};

// Delete a Category with the specified id in the request
exports.delete = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
    return res.status(400).send({ message: "Invalid Category ID format." });
  }

  try {
    const data = await Category.remove(id);
    if (data) {
      res.send({ message: "Category was deleted successfully!" });
    } else {
      res.status(404).send({
        message: `Cannot delete Category with id=${id}. Maybe Category was not found!`
      });
    }
  } catch (err) {
    logger.logError(err, req, { context: 'Admin category delete' });
    res.status(500).send({
      message: "Could not delete Category with id " + id
    });
  }
};
