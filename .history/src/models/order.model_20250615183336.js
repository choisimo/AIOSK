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

// 주문 취소 기능
Order.cancel = async (orderId) => {
    const connection = await sql.getConnection();
    try {
        // 먼저 주문이 존재하는지 확인
        const [orderRows] = await connection.execute(
            "SELECT id, status FROM Orders WHERE id = ?", 
            [orderId]
        );
        
        if (!orderRows.length) {
            return { success: false, message: "주문을 찾을 수 없습니다." };
        }
        
        const currentOrder = orderRows[0];
        
        // 취소 가능한 상태인지 확인
        const cancellableStatuses = ['RECEIVED', 'PREPARING'];
        if (!cancellableStatuses.includes(currentOrder.status)) {
            return { 
                success: false, 
                message: `${currentOrder.status} 상태의 주문은 취소할 수 없습니다. 취소 가능한 상태: ${cancellableStatuses.join(', ')}` 
            };
        }
        
        // 주문 상태를 CANCELLED로 변경
        const [updateResult] = await connection.execute(
            "UPDATE Orders SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [orderId]
        );
        
        if (updateResult.affectedRows === 0) {
            return { success: false, message: "주문 상태 변경에 실패했습니다." };
        }
        
        console.log(`주문 ${orderId}이 성공적으로 취소되었습니다.`);
        return { 
            success: true, 
            message: "주문이 성공적으로 취소되었습니다.",
            orderId: parseInt(orderId),
            status: 'CANCELLED'
        };
        
    } catch (err) {
        console.error("주문 취소 오류:", err);
        throw new Error("주문 취소 중 오류가 발생했습니다.");
    } finally {
        connection.release();
    }
};

// 주문 상태 업데이트 (일반적인 상태 변경용)
Order.updateStatus = async (orderId, newStatus) => {
    const connection = await sql.getConnection();
    try {
        // 유효한 상태값 검증
        const validStatuses = ['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
        if (!validStatuses.includes(newStatus.toUpperCase())) {
            return { 
                success: false, 
                message: `유효하지 않은 상태입니다. 가능한 상태: ${validStatuses.join(', ')}` 
            };
        }
        
        // 주문이 존재하는지 확인
        const [orderRows] = await connection.execute(
            "SELECT id, status FROM Orders WHERE id = ?", 
            [orderId]
        );
        
        if (!orderRows.length) {
            return { success: false, message: "주문을 찾을 수 없습니다." };
        }
        
        const currentOrder = orderRows[0];
        const upperStatus = newStatus.toUpperCase();
        
        // 이미 같은 상태인 경우
        if (currentOrder.status === upperStatus) {
            return { 
                success: true, 
                message: "이미 해당 상태입니다.",
                orderId: parseInt(orderId),
                status: upperStatus 
            };
        }
        
        // 상태 변경
        const [updateResult] = await connection.execute(
            "UPDATE Orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [upperStatus, orderId]
        );
        
        if (updateResult.affectedRows === 0) {
            return { success: false, message: "주문 상태 변경에 실패했습니다." };
        }
        
        console.log(`주문 ${orderId}의 상태가 ${currentOrder.status}에서 ${upperStatus}로 변경되었습니다.`);
        return { 
            success: true, 
            message: "주문 상태가 성공적으로 변경되었습니다.",
            orderId: parseInt(orderId),
            previousStatus: currentOrder.status,
            status: upperStatus
        };
        
    } catch (err) {
        console.error("주문 상태 업데이트 오류:", err);
        throw new Error("주문 상태 업데이트 중 오류가 발생했습니다.");
    } finally {
        connection.release();
    }
};

// 주문 목록 조회 (관리자용 - 필터링 및 페이지네이션 지원)
Order.getAll = async (filters = {}) => {
    const connection = await sql.getConnection();
    try {
        let query = `
            SELECT o.id, o.total_price, o.status, o.created_at, o.updated_at,
                   JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'menuId', oi.menu_id,
                           'menuName', m.name,
                           'quantity', oi.quantity,
                           'pricePerItem', oi.price_per_item
                       )
                   ) as items
            FROM Orders o
            JOIN OrderItems oi ON o.id = oi.order_id
            LEFT JOIN Menus m ON oi.menu_id = m.id
        `;
        
        const conditions = [];
        const params = [];
        
        // 필터 조건 추가
        if (filters.status) {
            conditions.push("o.status = ?");
            params.push(filters.status.toUpperCase());
        }
        
        if (filters.startDate) {
            conditions.push("o.created_at >= ?");
            params.push(filters.startDate);
        }
        
        if (filters.endDate) {
            conditions.push("o.created_at <= ?");
            params.push(filters.endDate);
        }
        
        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }
        
        query += " GROUP BY o.id ORDER BY o.created_at DESC";
        
        // 페이지네이션 지원
        if (filters.limit) {
            query += " LIMIT ?";
            params.push(parseInt(filters.limit));
            
            if (filters.offset) {
                query += " OFFSET ?";
                params.push(parseInt(filters.offset));
            }
        }
        
        const [orders] = await connection.execute(query, params);
        console.log(`주문 목록 조회: ${orders.length}건`);
        return orders;
        
    } catch (err) {
        console.error("주문 목록 조회 오류:", err);
        throw new Error("주문 목록 조회 중 오류가 발생했습니다.");
    } finally {
        connection.release();
    }
};

module.exports = Order;
