// src/models/admin.model.js
const sql = require('./db.js');

const Admin = {};

// Find an Admin by username (fetches the user including their hashed password)
Admin.findByUsername = async (username) => {
  if (typeof username !== 'string') {
    return null;
  }
  const normalizedUsername = username.trim();
  if (!normalizedUsername) {
    return null;
  }

  const [rows] = await sql.execute(
    "SELECT * FROM Admins WHERE username = ?",
    [normalizedUsername]
  );
  if (rows.length) {
    return rows[0]; // Contains id, username, password (hashed)
  }
  return null;
};

module.exports = Admin;
