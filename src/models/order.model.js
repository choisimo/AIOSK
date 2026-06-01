// src/models/order.model.js
const sql = require('./db.js');

const Order = {};
const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
const MAX_ORDER_ITEMS = 100;
const MAX_ORDER_ITEM_QUANTITY = 99;
const MAX_ORDER_LIST_LIMIT = 200;
const MAX_ORDER_LIST_OFFSET = 10000;

const parsePositiveInteger = (value) => {
    const text = typeof value === 'number'
        ? String(value)
        : (typeof value === 'string' ? value.trim() : '');
    const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
    return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseNonNegativeAmount = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
    if (parsed !== null && Number.isFinite(parsed)) {
        return parsed;
    }

    throw new Error('Menu price must be a non-negative number.');
};

const parseDateFilter = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a YYYY-MM-DD date.`);
    }

    const text = value.trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) {
        throw new Error(`${fieldName} must be a YYYY-MM-DD date.`);
    }

    const [year, month, day] = text.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`${fieldName} must be a YYYY-MM-DD date.`);
    }

    return text;
};

Order.create = async (orderData) => {
  // orderData = { items: [{ menu_id, quantity }, ...] }, with up to MAX_ORDER_ITEMS entries.
  const orderItems = Array.isArray(orderData?.items) ? orderData.items : [];
  if (orderItems.length === 0) {
    throw new Error('Order items are required.');
  }
  if (orderItems.length > MAX_ORDER_ITEMS) {
    throw new Error(`Order items must not exceed ${MAX_ORDER_ITEMS}.`);
  }

  const normalizedOrderItems = orderItems.map((item) => {
    const menuId = parsePositiveInteger(item.menu_id);
    const quantity = parsePositiveInteger(item.quantity);
    if (menuId === null) {
      throw new Error(`Menu item ID must be a positive integer: ${item.menu_id}.`);
    }
    if (quantity === null || quantity > MAX_ORDER_ITEM_QUANTITY) {
      throw new Error(`Quantity for menu item ID ${menuId} must be a positive integer no greater than ${MAX_ORDER_ITEM_QUANTITY}.`);
    }

    return { menu_id: menuId, quantity };
  });

  const connection = await sql.getConnection(); // Get a connection from the pool for transaction

  try {
    await connection.beginTransaction();

    // 1. Calculate total_price and validate items
    let calculatedTotalPrice = 0;
    const orderItemsData = [];

    for (const item of normalizedOrderItems) {
      const [menuRows] = await connection.execute(
        "SELECT id, price, status FROM Menus WHERE id = ?",
        [item.menu_id]
      );
      const menuItem = menuRows[0];
      if (!menuItem || menuItem.status !== 'FOR_SALE') {
        throw new Error(`Menu item with ID ${item.menu_id} is not available or not for sale.`);
      }
      const priceAtOrderTime = parseNonNegativeAmount(menuItem.price);
      calculatedTotalPrice += priceAtOrderTime * item.quantity;
      orderItemsData.push({
        menu_id: item.menu_id,
        quantity: item.quantity,
        price_per_item: priceAtOrderTime
      });
    }

    calculatedTotalPrice = Number(calculatedTotalPrice.toFixed(2)); // Ensure 2 decimal places

    // 2. Create the Order entry. Orders.status uses the schema default RECEIVED.
    const [orderRes] = await connection.execute(
      "INSERT INTO Orders (total_price) VALUES (?)",
      [calculatedTotalPrice]
    );
    const orderId = orderRes.insertId;

    // 3. Create OrderItem entries on the transaction connection.
    for (const item of orderItemsData) {
      await connection.execute(
        "INSERT INTO OrderItems (order_id, menu_id, quantity, price_per_item) VALUES (?, ?, ?, ?)",
        [orderId, item.menu_id, item.quantity, item.price_per_item]
      );
    }

    await connection.commit(); // Commit the transaction

    return { id: orderId };

  } catch (err) {
    await connection.rollback(); // Rollback transaction on error
    // Create a more specific error object to be caught by controller
    const appError = new Error(err.message || "Failed to create order due to an internal error.");
    appError.details = err; // Attach original error for logging or internal use
    throw appError; // Rethrow the application-specific error
  } finally {
    connection.release(); // Always release the connection back to the pool
  }
};

// Retrieve a single order with line items.
Order.findById = async (orderId) => {
    const normalizedOrderId = parsePositiveInteger(orderId);
    if (normalizedOrderId === null) {
        return null;
    }

    const connection = await sql.getConnection();
    try {
        const [rows] = await connection.execute(
            `SELECT
                o.id,
                o.total_price,
                o.status,
                o.created_at,
                o.updated_at,
                oi.id as order_item_id,
                oi.menu_id,
                oi.quantity,
                oi.price_per_item,
                m.name as menu_name
            FROM Orders o
            LEFT JOIN OrderItems oi ON o.id = oi.order_id
            LEFT JOIN Menus m ON oi.menu_id = m.id
            WHERE o.id = ?
            ORDER BY oi.id ASC`,
            [normalizedOrderId]
        );

        if (!rows.length) {
            return null;
        }

        const order = {
            id: rows[0].id,
            total_price: rows[0].total_price,
            status: rows[0].status,
            created_at: rows[0].created_at,
            updated_at: rows[0].updated_at,
            items: rows
                .filter(row => row.order_item_id !== null)
                .map(row => ({
                    id: row.order_item_id,
                    menu_id: row.menu_id,
                    menu_name: row.menu_name,
                    quantity: row.quantity,
                    price_per_item: row.price_per_item
                }))
        };

        return order;
    } catch (err) {
        throw new Error("주문 상세 조회 중 오류가 발생했습니다.", { cause: err });
    } finally {
        connection.release();
    }
};

// 주문 취소 기능
Order.cancel = async (orderId) => {
    const normalizedOrderId = parsePositiveInteger(orderId);
    if (normalizedOrderId === null) {
        return { success: false, message: "주문을 찾을 수 없습니다." };
    }

    const connection = await sql.getConnection();
    try {
        // 먼저 주문이 존재하는지 확인
        const [orderRows] = await connection.execute(
            "SELECT id, status FROM Orders WHERE id = ?",
            [normalizedOrderId]
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
            [normalizedOrderId]
        );

        if (updateResult.affectedRows === 0) {
            return { success: false, message: "주문 상태 변경에 실패했습니다." };
        }

        return {
            success: true,
            message: "주문이 성공적으로 취소되었습니다.",
            orderId: currentOrder.id,
            previousStatus: currentOrder.status,
            status: 'CANCELLED'
        };

    } catch (err) {
        throw new Error("주문 취소 중 오류가 발생했습니다.", { cause: err });
    } finally {
        connection.release();
    }
};

// 주문 상태 업데이트 (일반적인 상태 변경용)
Order.updateStatus = async (orderId, newStatus) => {
    const upperStatus = typeof newStatus === 'string' ? newStatus.trim().toUpperCase() : '';
    if (!ORDER_STATUSES.includes(upperStatus)) {
        return {
            success: false,
            message: `유효하지 않은 상태입니다. 가능한 상태: ${ORDER_STATUSES.join(', ')}`
        };
    }

    const normalizedOrderId = parsePositiveInteger(orderId);
    if (normalizedOrderId === null) {
        return { success: false, message: "주문을 찾을 수 없습니다." };
    }

    const connection = await sql.getConnection();
    try {
        // 주문이 존재하는지 확인
        const [orderRows] = await connection.execute(
            "SELECT id, status FROM Orders WHERE id = ?",
            [normalizedOrderId]
        );

        if (!orderRows.length) {
            return { success: false, message: "주문을 찾을 수 없습니다." };
        }

        const currentOrder = orderRows[0];

        // 이미 같은 상태인 경우
        if (currentOrder.status === upperStatus) {
            return {
                success: true,
                message: "이미 해당 상태입니다.",
                orderId: currentOrder.id,
                previousStatus: currentOrder.status,
                status: upperStatus
            };
        }

        // 상태 변경
        const [updateResult] = await connection.execute(
            "UPDATE Orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [upperStatus, normalizedOrderId]
        );

        if (updateResult.affectedRows === 0) {
            return { success: false, message: "주문 상태 변경에 실패했습니다." };
        }

        return {
            success: true,
            message: "주문 상태가 성공적으로 변경되었습니다.",
            orderId: currentOrder.id,
            previousStatus: currentOrder.status,
            status: upperStatus
        };

    } catch (err) {
        throw new Error("주문 상태 업데이트 중 오류가 발생했습니다.", { cause: err });
    } finally {
        connection.release();
    }
};

// 주문 목록 조회 (관리자용 - 필터링 및 페이지네이션 지원)
Order.getAll = async (filters = {}) => {
    const startDate = parseDateFilter(filters.startDate, 'startDate');
    const endDate = parseDateFilter(filters.endDate, 'endDate');
    if (startDate && endDate && startDate > endDate) {
        throw new Error('endDate must not be before startDate.');
    }
    const normalizedStatus = typeof filters.status === 'string' ? filters.status.trim().toUpperCase() : '';
    if (normalizedStatus && !ORDER_STATUSES.includes(normalizedStatus)) {
        throw new Error(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
    }

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
        if (normalizedStatus) {
            conditions.push("o.status = ?");
            params.push(normalizedStatus);
        }

        if (startDate) {
            conditions.push("o.created_at >= ?");
            params.push(startDate);
        }

        if (endDate) {
            conditions.push("o.created_at <= ?");
            params.push(endDate);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " GROUP BY o.id ORDER BY o.created_at DESC";

        // 페이지네이션 지원. MySQL prepared statements can reject LIMIT placeholders,
        // so validate and inline only safe integers.
        const rawLimit = typeof filters.limit === 'string' ? filters.limit.trim() : '';
        const normalizedLimit = typeof filters.limit === 'number'
            ? filters.limit
            : (/^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null);

        if (Number.isSafeInteger(normalizedLimit) && normalizedLimit > 0) {
            query += ` LIMIT ${Math.min(normalizedLimit, MAX_ORDER_LIST_LIMIT)}`;

            const rawOffset = typeof filters.offset === 'string' ? filters.offset.trim() : '';
            const normalizedOffset = typeof filters.offset === 'number'
                ? filters.offset
                : (/^(0|[1-9][0-9]*)$/.test(rawOffset) ? Number(rawOffset) : null);

            if (Number.isSafeInteger(normalizedOffset) && normalizedOffset >= 0) {
                query += ` OFFSET ${Math.min(normalizedOffset, MAX_ORDER_LIST_OFFSET)}`;
            }
        }

        const [orders] = await connection.execute(query, params);
        return orders;

    } catch (err) {
        throw new Error("주문 목록 조회 중 오류가 발생했습니다.", { cause: err });
    } finally {
        connection.release();
    }
};

module.exports = Order;
