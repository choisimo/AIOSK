// src/models/category.model.js
const sql = require('./db.js'); // The promisified pool from db.js

// Constructor
const Category = function(category) {
  this.name = category.name;
  this.sort_order = category.sort_order === undefined ? 0 : category.sort_order;
};

// Create a new Category
Category.create = async (newCategory) => {
  try {
    const [res, fields] = await sql.execute(
      "INSERT INTO Categories (name, sort_order) VALUES (?, ?)",
      [newCategory.name, newCategory.sort_order]
    );
    console.log("Created category: ", { id: res.insertId, ...newCategory });
    return { id: res.insertId, ...newCategory };
  } catch (err) {
    console.error("Error creating category:", err);
    throw err; // Rethrow the error to be caught by the controller
  }
};

// Find a Category by ID
Category.findById = async (id) => {
  try {
    const [rows, fields] = await sql.execute("SELECT * FROM Categories WHERE id = ?", [id]);
    if (rows.length) {
      console.log("Found category: ", rows[0]);
      return rows[0];
    }
    console.log("Category not found with id: ", id);
    return null; // Or you could throw an error: throw { kind: "not_found" };
  } catch (err) {
    console.error("Error finding category by id:", err);
    throw err;
  }
};

// Get all Categories
Category.getAll = async (name) => {
  try {
    let query = "SELECT * FROM Categories";
    const params = [];
    if (name) {
      query += " WHERE name LIKE ?";
      params.push(`%${name}%`);
    }
    query += " ORDER BY sort_order ASC, name ASC"; // Default sort order

    const [rows, fields] = await sql.execute(query, params);
    console.log("Categories found: ", rows.length);
    return rows;
  } catch (err) {
    console.error("Error getting all categories:", err);
    throw err;
  }
};

// Update a Category by ID
Category.updateById = async (id, categoryData) => {
  try {
    // Construct the SET clause dynamically for fields that are provided
    const fieldsToUpdate = [];
    const values = [];

    if (categoryData.name !== undefined) {
      fieldsToUpdate.push("name = ?");
      values.push(categoryData.name);
    }
    if (categoryData.sort_order !== undefined) {
      fieldsToUpdate.push("sort_order = ?");
      values.push(categoryData.sort_order);
    }

    if (fieldsToUpdate.length === 0) {
      // Nothing to update
      return { id: id, ...categoryData, message: "No fields to update" };
    }

    values.push(id); // For the WHERE id = ?

    const query = `UPDATE Categories SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

    const [res, fields] = await sql.execute(query, values);

    if (res.affectedRows == 0) {
      // Not found Category with the id
      console.log("Category not found with id for update: ", id);
      return null; // Or throw { kind: "not_found" };
    }

    console.log("Updated category: ", { id: id, ...categoryData });
    return { id: id, ...categoryData };
  } catch (err) {
    console.error("Error updating category:", err);
    throw err;
  }
};

// Delete a Category by ID
Category.remove = async (id) => {
  try {
    const [res, fields] = await sql.execute("DELETE FROM Categories WHERE id = ?", [id]);
    if (res.affectedRows == 0) {
      // Not found Category with the id
      console.log("Category not found with id for delete: ", id);
      return null; // Or throw { kind: "not_found" };
    }
    console.log("Deleted category with id: ", id);
    return { id: id, message: "Category deleted successfully" };
  } catch (err) {
    console.error("Error deleting category:", err);
    throw err;
  }
};

// Optional: Delete all Categories (use with caution)
Category.removeAll = async () => {
  try {
    const [res, fields] = await sql.execute("DELETE FROM Categories");
    console.log(`Deleted ${res.affectedRows} categories`);
    return { message: `Deleted ${res.affectedRows} categories` };
  } catch (err) {
    console.error("Error deleting all categories:", err);
    throw err;
  }
};

module.exports = Category;
