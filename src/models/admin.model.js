// src/models/admin.model.js
const sql = require('./db.js');
const bcrypt = require('bcrypt'); // Corrected library name
const saltRounds = 10; // Store salt rounds in a variable

// Constructor
const Admin = function(admin) {
  this.username = admin.username;
  this.password = admin.password; // Plain password, will be hashed in create
};

// Create a new Admin (with password hashing)
Admin.create = async (newAdmin) => {
  try {
    const hashedPassword = await bcrypt.hash(newAdmin.password, saltRounds);
    const [res, fields] = await sql.execute(
      "INSERT INTO Admins (username, password) VALUES (?, ?)",
      [newAdmin.username, hashedPassword]
    );
    console.log("Created admin: ", { id: res.insertId, username: newAdmin.username });
    // Do not return the password hash or plain password
    return { id: res.insertId, username: newAdmin.username };
  } catch (err) {
    // Handle potential duplicate username error (MySQL error code ER_DUP_ENTRY often 1062)
    if (err.code === 'ER_DUP_ENTRY') {
        console.error("Error creating admin: Username already exists.", err.sqlMessage);
        // Throw a more specific error or an error object that the controller can understand
        const customError = new Error("Username already exists.");
        customError.kind = "duplicate_username";
        throw customError;
    }
    console.error("Error creating admin:", err);
    throw err; // Rethrow other errors
  }
};

// Find an Admin by username (fetches the user including their hashed password)
Admin.findByUsername = async (username) => {
  try {
    const [rows, fields] = await sql.execute(
        "SELECT * FROM Admins WHERE username = ?",
        [username]
    );
    if (rows.length) {
      // console.log("Found admin by username: ", rows[0].username); // Don't log sensitive data like password hash here
      return rows[0]; // Contains id, username, password (hashed)
    }
    console.log("Admin not found with username: ", username);
    return null;
  } catch (err) {
    console.error("Error finding admin by username:", err);
    throw err;
  }
};

module.exports = Admin;
