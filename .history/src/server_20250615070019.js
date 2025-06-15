// src/server.js
require('dotenv').config(); // Ensures environment variables are loaded first

const express = require('express');
const cors = require('cors'); // Import CORS
const http = require('http');
const { Server } = require("socket.io");

// const db = require('./models/db.js'); // The db.js already attempts connection, so direct import here is for awareness or if pool is needed directly.

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"]
  }
});

app.set('io', io); // Make io accessible in routes

// CORS Configuration (Basic - allow all for now, can be configured more strictly)
app.use(cors()); 
// Or for specific origin:
// app.use(cors({ origin: 'http://localhost:YOUR_FRONTEND_PORT' }));


// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Simple test route
app.get('/api', (req, res) => { // Changed to /api to avoid conflict if frontend is served from root
  res.json({ message: 'Kiosk Backend API is running!' });
});

// --- Mount Routes ---
// Note: The order of requiring db.js doesn't strictly matter here as it sets up its own connection.
// However, routes depend on the Express app instance.

// Category routes
require("./routes/category.routes.js")(app);
// Menu routes
require("./routes/menu.routes.js")(app);
// Admin routes
require("./routes/admin.routes.js")(app);
// Admin Order routes
const adminOrderRoutes = require("./routes/admin/orders.routes.js"); // <-- Add this line
app.use('/api/admin/orders', adminOrderRoutes); // <-- Add this line
// Include order routes
require("./routes/order.routes.js")(app); // <-- Add this line

// Centralized Error Handling (Optional but good practice for later)
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).send({ message: 'Something broke!', error: err.message });
// });

// Socket.IO connection listeners
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => { // Changed app.listen to httpServer.listen
  console.log(`Server is running on port ${PORT}.`);
  // The database connection test is already within src/models/db.js
  // If you want an additional check here, you could try a simple query:
  /*
  const sql = require('./models/db.js'); // Get the promisePool
  sql.query('SELECT 1')
    .then(() => {
      console.log('Database connection verified successfully from server.js on startup.');
    })
    .catch(err => {
      console.error('Failed to verify database connection from server.js on startup:', err);
    });
  */
});
