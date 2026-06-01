// src/models/menu.model.js
const sql = require('./db.js');

const Menu = {};
const MENU_STATUSES = ['FOR_SALE', 'SOLD_OUT'];

const parsePositiveInteger = (value) => {
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseNonNegativePrice = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
  return Number.isFinite(parsed) ? parsed : null;
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

const normalizeOptionalText = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }
  const text = value.trim();
  return text || null;
};

const normalizeStatus = (value, useDefault) => {
  if (value === undefined) {
    return useDefault ? 'FOR_SALE' : undefined;
  }
  if (value === null || value === '') {
    if (useDefault) return 'FOR_SALE';
    throw new Error('status must be one of: FOR_SALE, SOLD_OUT.');
  }
  if (typeof value !== 'string') {
    throw new Error('status must be one of: FOR_SALE, SOLD_OUT.');
  }
  const status = value.trim();
  if (!MENU_STATUSES.includes(status)) {
    throw new Error('status must be one of: FOR_SALE, SOLD_OUT.');
  }
  return status;
};

// Create a new Menu
Menu.create = async (newMenu) => {
  const categoryId = parsePositiveInteger(newMenu.category_id);
  if (categoryId === null) {
    throw new Error('category_id must be a positive integer.');
  }
  const price = parseNonNegativePrice(newMenu.price);
  if (price === null) {
    throw new Error('price must be a non-negative number.');
  }

  const menu = {
    category_id: categoryId,
    name: normalizeRequiredText(newMenu.name, 'name'),
    price,
    image_url: normalizeOptionalText(newMenu.image_url, 'image_url'),
    description: normalizeOptionalText(newMenu.description, 'description'),
    status: normalizeStatus(newMenu.status, true)
  };

  const [res] = await sql.execute(
    "INSERT INTO Menus (category_id, name, price, image_url, description, status) VALUES (?, ?, ?, ?, ?, ?)",
    [menu.category_id, menu.name, menu.price, menu.image_url, menu.description, menu.status]
  );
  return { id: res.insertId, ...menu };
};

// Find a Menu by ID
Menu.findById = async (id) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  // Select from Menus and join with Categories to get category_name (optional, but good for display)
  const [rows] = await sql.execute(
    "SELECT m.*, c.name as category_name FROM Menus m LEFT JOIN Categories c ON m.category_id = c.id WHERE m.id = ?",
    [normalizedId]
  );
  if (rows.length) {
    return rows[0];
  }
  return null;
};

// Get all Menus (optionally filtered by category_id or name, sorted by name)
Menu.getAll = async (filters = {}) => {
  let query = "SELECT m.*, c.name as category_name FROM Menus m LEFT JOIN Categories c ON m.category_id = c.id";
  const params = [];
  const conditions = [];

  const categoryId = parsePositiveInteger(filters.category_id);
  if (categoryId !== null) {
    conditions.push("m.category_id = ?");
    params.push(categoryId);
  }
  if (filters.name) {
    conditions.push("m.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  const status = normalizeStatus(filters.status, false);
  if (status !== undefined) {
    conditions.push("m.status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY m.name ASC";

  const [rows] = await sql.execute(query, params);
  return rows;
};

// Update a Menu by ID
Menu.updateById = async (id, menuData) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  const fieldsToUpdate = [];
  const values = [];

  if (menuData.category_id !== undefined) {
    const categoryId = parsePositiveInteger(menuData.category_id);
    if (categoryId === null) {
      throw new Error('category_id must be a positive integer.');
    }
    fieldsToUpdate.push("category_id = ?");
    values.push(categoryId);
  }
  if (menuData.name !== undefined) {
    fieldsToUpdate.push("name = ?");
    values.push(normalizeRequiredText(menuData.name, 'name'));
  }
  if (menuData.price !== undefined) {
    const price = parseNonNegativePrice(menuData.price);
    if (price === null) {
      throw new Error('price must be a non-negative number.');
    }
    fieldsToUpdate.push("price = ?");
    values.push(price);
  }
  if (menuData.image_url !== undefined) {
    fieldsToUpdate.push("image_url = ?");
    values.push(normalizeOptionalText(menuData.image_url, 'image_url'));
  }
  if (menuData.description !== undefined) {
    fieldsToUpdate.push("description = ?");
    values.push(normalizeOptionalText(menuData.description, 'description'));
  }
  if (menuData.status !== undefined) {
    const status = normalizeStatus(menuData.status, false);
    fieldsToUpdate.push("status = ?");
    values.push(status);
  }

  if (fieldsToUpdate.length === 0) {
    const currentMenu = await Menu.findById(normalizedId);
    if (!currentMenu) return null; // Menu not found
    return { ...currentMenu, message: "No fields provided for update. Current data returned."};
  }

  values.push(normalizedId); // For the WHERE id = ?
  const query = `UPDATE Menus SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

  const [res] = await sql.execute(query, values);

  if (res.affectedRows == 0) {
    return null;
  }

  // Fetch the updated menu data to return the complete object, including any joined fields like category_name
  const updatedMenu = await Menu.findById(normalizedId);
  return updatedMenu;
};

// Delete a Menu by ID
Menu.remove = async (id) => {
  const normalizedId = parsePositiveInteger(id);
  if (normalizedId === null) {
    return null;
  }

  const [res] = await sql.execute("DELETE FROM Menus WHERE id = ?", [normalizedId]);
  if (res.affectedRows == 0) {
    return null;
  }
  // Return a success indicator or the ID of the deleted item
  return { id: normalizedId, message: "Menu deleted successfully" };
};

module.exports = Menu;
