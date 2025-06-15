// src/routes/admin/orders.routes.js
const express = require('express');
const router = express.Router();
const db = require('../../models/db'); // Adjusted path for db
const authMiddleware = require('../../middleware/auth.middleware'); // Assuming admin routes are protected

// [GET] /api/admin/orders - 모든 주문 목록 가져오기 (관리자 인증 추가)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [orders] = await db.query(`
      SELECT o.id, o.total_price, o.status, o.created_at,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'menuName', m.name,
                 'quantity', oi.quantity,
                 'price', oi.price_per_item
               )
             ) as items
      FROM Orders o
      JOIN OrderItems oi ON o.id = oi.order_id
      JOIN Menus m ON oi.menu_id = m.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(orders);
  } catch (err) {
    console.error('Error fetching admin orders:', err);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

// [PATCH] /api/admin/orders/:orderId/status - 특정 주문 상태 변경하기 (관리자 인증 추가)
router.patch('/:orderId/status', authMiddleware, async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "변경할 상태를 입력해주세요." });
  }
  // Basic validation for allowed status values (optional but good practice)
  const allowedStatuses = ['PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED', 'PROCESSING']; // Added 'PROCESSING' as per issue, 'PREPARING' and 'CANCELLED' are common
  if (!allowedStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ message: "유효하지 않은 상태 값입니다." });
  }

  try {
    const [result] = await db.query('UPDATE Orders SET status = ? WHERE id = ?', [status.toUpperCase(), orderId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "주문을 찾을 수 없거나 상태가 변경되지 않았습니다." });
    }
    
    const io = req.app.get('io');
    io.emit('order_status_updated', { orderId: parseInt(orderId), status: status.toUpperCase() });

    res.json({ message: "주문 상태가 성공적으로 변경되었습니다.", orderId: parseInt(orderId), status: status.toUpperCase() });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

module.exports = router;
