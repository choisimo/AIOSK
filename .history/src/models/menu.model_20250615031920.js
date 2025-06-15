// src/models/menu.model.js
const sql = require('./db.js'); // The promisified pool

// Constructor
const Menu = function(menu) {
  this.category_id = menu.category_id;
  this.name = menu.name;
  this.price = menu.price;
  this.image_url = menu.image_url || null; // Allow null image_url
  this.description = menu.description || null; // Allow null description
  this.status = menu.status || 'FOR_SALE'; // Default status: 'FOR_SALE', 'SOLD_OUT'
};

// Create a new Menu
Menu.create = async (newMenu) => {
  try {
    const [res, fields] = await sql.execute(
      "INSERT INTO Menus (category_id, name, price, image_url, description, status) VALUES (?, ?, ?, ?, ?, ?)",
      [newMenu.category_id, newMenu.name, newMenu.price, newMenu.image_url, newMenu.description, newMenu.status]
    );
    console.log("Created menu: ", { id: res.insertId, ...newMenu });
    return { id: res.insertId, ...newMenu };
  } catch (err) {
    console.error("Error creating menu:", err);
    throw err;
  }
};

// Find a Menu by ID
Menu.findById = async (id) => {
  try {
    // Select from Menus and join with Categories to get category_name (optional, but good for display)
    const [rows, fields] = await sql.execute(
      "SELECT m.*, c.name as category_name FROM Menus m LEFT JOIN Categories c ON m.category_id = c.id WHERE m.id = ?",
      [id]
    );
    if (rows.length) {
      console.log("Found menu: ", rows[0]);
      return rows[0];
    }
    console.log("Menu not found with id: ", id);
    return null;
  } catch (err) {
    console.error("Error finding menu by id:", err);
    throw err;
  }
};

// Get all Menus (optionally filtered by category_id or name, sorted by name)
Menu.getAll = async (filters = {}) => {
  try {
    let query = "SELECT m.*, c.name as category_name FROM Menus m LEFT JOIN Categories c ON m.category_id = c.id";
    const params = [];
    const conditions = [];

    if (filters.category_id) {
      conditions.push("m.category_id = ?");
      params.push(filters.category_id);
    }
    if (filters.name) {
      conditions.push("m.name LIKE ?");
      params.push(`%${filters.name}%`);
    }
    if (filters.status) {
      conditions.push("m.status = ?");
      params.push(filters.status);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY m.name ASC";

    const [rows, fields] = await sql.execute(query, params);
    console.log("Menus found: ", rows.length);
    return rows;
  } catch (err) {
    console.error("Error getting all menus:", err);
    throw err;
  }
};

// Update a Menu by ID
Menu.updateById = async (id, menuData) => {
  try {
    const fieldsToUpdate = [];
    const values = [];

    // Dynamically build the query based on provided fields
    if (menuData.category_id !== undefined) { fieldsToUpdate.push("category_id = ?"); values.push(menuData.category_id); }
    if (menuData.name !== undefined) { fieldsToUpdate.push("name = ?"); values.push(menuData.name); }
    if (menuData.price !== undefined) { fieldsToUpdate.push("price = ?"); values.push(menuData.price); }
    if (menuData.image_url !== undefined) { fieldsToUpdate.push("image_url = ?"); values.push(menuData.image_url); }
    if (menuData.description !== undefined) { fieldsToUpdate.push("description = ?"); values.push(menuData.description); }
    if (menuData.status !== undefined) { fieldsToUpdate.push("status = ?"); values.push(menuData.status); }

    if (fieldsToUpdate.length === 0) {
      // If no fields are provided for update, fetch and return the current menu data.
      // Or, you could return an error or a specific message.
      // For consistency with how the controller might expect an updated object,
      // fetching the current state is a reasonable approach.
      const currentMenu = await Menu.findById(id);
      if (!currentMenu) return null; // Menu not found
      return { ...currentMenu, message: "No fields provided for update. Current data returned."};
    }

    values.push(id); // For the WHERE id = ?
    const query = `UPDATE Menus SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

    const [res, fields] = await sql.execute(query, values);

    if (res.affectedRows == 0) {
      console.log("Menu not found or no change with id for update: ", id);
      return null;
    }

    // Fetch the updated menu data to return the complete object, including any joined fields like category_name
    const updatedMenu = await Menu.findById(id);
    console.log("Updated menu: ", updatedMenu);
    return updatedMenu;

  } catch (err) {
    console.error("Error updating menu:", err);
    throw err;
  }
};

// Delete a Menu by ID
Menu.remove = async (id) => {
  try {
    const [res, fields] = await sql.execute("DELETE FROM Menus WHERE id = ?", [id]);
    if (res.affectedRows == 0) {
      console.log("Menu not found with id for delete: ", id);
      return null;
    }
    console.log("Deleted menu with id: ", id);
    // Return a success indicator or the ID of the deleted item
    return { id: id, message: "Menu deleted successfully" };
  } catch (err) {
    console.error("Error deleting menu:", err);
    throw err;
  }
};

// Delete all Menus (use with caution - typically not exposed via API directly without strong auth)
Menu.removeAll = async (categoryId = null) => {
  try {
    let query = "DELETE FROM Menus";
    const params = [];
    if (categoryId) {
      query += " WHERE category_id = ?";
      params.push(categoryId);
    }
    const [res, fields] = await sql.execute(query, params);
    const message = categoryId
      ? `Deleted ${res.affectedRows} menus from category ${categoryId}`
      : `Deleted ${res.affectedRows} menus`;
    console.log(message);
    return { message };
  } catch (err) {
    console.error("Error deleting all menus:", err);
    throw err;
  }
};

module.exports = Menu;
