// src/models/order.model.js
const sql = require('./db.js'); // The promisified pool
const Menu = require('./menu.model.js'); // To fetch menu prices

// Constructor for Order (less used directly, data assembled in create method)
const Order = function(order) {
  this.total_price = order.total_price;
  this.status = order.status || 'RECEIVED';
  // items would be an array of OrderItem objects, handled in create
};

// Constructor for OrderItem (internal use, or could be a separate model)
const OrderItem = function(item) {
  this.order_id = item.order_id;
  this.menu_id = item.menu_id;
  this.quantity = item.quantity;
  this.price_per_item = item.price_per_item;
};

Order.create = async (orderData) => {
  // orderData = { userId (optional, future), items: [{ menu_id, quantity }, ...] }
  const connection = await sql.getConnection(); // Get a connection from the pool for transaction

  try {
    await connection.beginTransaction();

    // 1. Calculate total_price and validate items
    let calculatedTotalPrice = 0;
    const orderItemsData = [];

    for (const item of orderData.items) {
      const menuItem = await Menu.findById(item.menu_id); // Use connection if Menu model can accept it
      if (!menuItem || menuItem.status !== 'FOR_SALE') {
        throw new Error(`Menu item with ID ${item.menu_id} is not available or not for sale.`);
      }
      if (item.quantity <= 0) {
        throw new Error(`Quantity for menu item ID ${item.menu_id} must be positive.`);
      }
      const priceAtOrderTime = parseFloat(menuItem.price);
      calculatedTotalPrice += priceAtOrderTime * item.quantity;
      orderItemsData.push({
        menu_id: item.menu_id,
        quantity: item.quantity,
        price_per_item: priceAtOrderTime
      });
    }
    
    calculatedTotalPrice = parseFloat(calculatedTotalPrice.toFixed(2)); // Ensure 2 decimal places

    // 2. Create the Order entry
    const orderStatus = orderData.status || 'RECEIVED';
    const [orderRes] = await connection.execute(
      "INSERT INTO Orders (total_price, status) VALUES (?, ?)",
      [calculatedTotalPrice, orderStatus]
    );
    const orderId = orderRes.insertId;

    // 3. Create OrderItem entries
    const orderItemPromises = orderItemsData.map(item => {
      return connection.execute(
        "INSERT INTO OrderItems (order_id, menu_id, quantity, price_per_item) VALUES (?, ?, ?, ?)",
        [orderId, item.menu_id, item.quantity, item.price_per_item]
      );
    });
    await Promise.all(orderItemPromises);

    await connection.commit(); // Commit the transaction

    console.log("Created order: ", { id: orderId, total_price: calculatedTotalPrice, status: orderStatus, items: orderItemsData });
    return { id: orderId, total_price: calculatedTotalPrice, status: orderStatus, items: orderItemsData };

  } catch (err) {
    await connection.rollback(); // Rollback transaction on error
    console.error("Error creating order:", err);
    // Create a more specific error object to be caught by controller
    const appError = new Error(err.message || "Failed to create order due to an internal error.");
    appError.details = err; // Attach original error for logging or internal use
    throw appError; // Rethrow the application-specific error
  } finally {
    connection.release(); // Always release the connection back to the pool
  }
};

// Placeholder for other order methods (findById, getAll, updateStatus etc.)
Order.findById = async (id) => {
    const connection = await sql.getConnection();
    try {
        const [orderRows] = await connection.execute("SELECT * FROM Orders WHERE id = ?", [id]);
        if (!orderRows.length) {
            return null;
        }
        const order = orderRows[0];
        const [itemRows] = await connection.execute(
            "SELECT oi.menu_id, oi.quantity, oi.price_per_item, m.name as menu_name " +
            "FROM OrderItems oi LEFT JOIN Menus m ON oi.menu_id = m.id WHERE oi.order_id = ?", [id]);
        order.items = itemRows;
        return order;
    } catch (err) {
        console.error("Error finding order by id:", err);
        throw err;
    } finally {
        connection.release();
    }
};


module.exports = Order;
