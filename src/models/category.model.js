// src/models/category.model.js
const sql = require('./db.js');

const Category = {};

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

const normalizeRequiredText = (value, fieldName) => {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  const text = value.trim();
  if (!text) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return text;
};

// Create a new Category
Category.create = async (newCategory) => {
  const sortOrder = parseNonNegativeInteger(newCategory.sort_order);
  if (sortOrder === null) {
    throw new Error('sort_order must be a non-negative integer.');
  }

  const category = {
    name: normalizeRequiredText(newCategory.name, 'name'),
    sort_order: sortOrder
  };

  const [res] = await sql.execute(
    "INSERT INTO Categories (name, sort_order) VALUES (?, ?)",
    [category.name, category.sort_order]
  );
  return { id: res.insertId, ...category };
};

// Find a Category by ID
Category.findById = async (id) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  const [rows] = await sql.execute("SELECT * FROM Categories WHERE id = ?", [normalizedId]);
  if (rows.length) {
    return rows[0];
  }
  return null;
};

// Get all Categories
Category.getAll = async (name) => {
  let normalizedName = null;
  if (name !== undefined && name !== null && name !== '') {
    if (typeof name !== 'string') {
      throw new Error('name filter must be a string.');
    }
    const text = name.trim();
    normalizedName = text || null;
  }

  let query = "SELECT * FROM Categories";
  const params = [];
  if (normalizedName) {
    query += " WHERE name LIKE ?";
    params.push(`%${normalizedName}%`);
  }
  query += " ORDER BY sort_order ASC, name ASC"; // Default sort order

  const [rows] = await sql.execute(query, params);
  return rows;
};

// Update a Category by ID
Category.updateById = async (id, categoryData) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  // Construct the SET clause dynamically for fields that are provided
  const fieldsToUpdate = [];
  const values = [];

  if (categoryData.name !== undefined) {
    fieldsToUpdate.push("name = ?");
    const name = normalizeRequiredText(categoryData.name, 'name');
    values.push(name);
    categoryData.name = name;
  }
  if (categoryData.sort_order !== undefined) {
    const sortOrder = parseNonNegativeInteger(categoryData.sort_order);
    if (sortOrder === null) {
      throw new Error('sort_order must be a non-negative integer.');
    }
    fieldsToUpdate.push("sort_order = ?");
    values.push(sortOrder);
    categoryData.sort_order = sortOrder;
  }

  if (fieldsToUpdate.length === 0) {
    // Nothing to update
    return { id: normalizedId, ...categoryData, message: "No fields to update" };
  }

  values.push(normalizedId); // For the WHERE id = ?

  const query = `UPDATE Categories SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

  const [res] = await sql.execute(query, values);

  if (res.affectedRows == 0) {
    // Not found Category with the id
    return null;
  }

  return { id: normalizedId, ...categoryData };
};

// Delete a Category by ID
Category.remove = async (id) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  const [res] = await sql.execute("DELETE FROM Categories WHERE id = ?", [normalizedId]);
  if (res.affectedRows == 0) {
    // Not found Category with the id
    return null;
  }
  return { id: normalizedId, message: "Category deleted successfully" };
};

module.exports = Category;
