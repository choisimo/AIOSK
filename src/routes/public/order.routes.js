// src/routes/public/order.routes.js

/**
 * @swagger
 * /api/public/orders:
 *   post:
 *     summary: 새 주문 생성 (공개 API)
 *     description: 키오스크에서 새로운 주문을 생성합니다. 인증이 필요하지 않습니다.
 *     tags: [🔓 Public API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required:
 *                     - menuId
 *                     - quantity
 *                   properties:
 *                     menuId:
 *                       type: integer
 *                       description: 메뉴 ID
 *                       example: 1
 *                     quantity:
 *                       type: integer
 *                       description: 주문 수량 (품목당 1-99개)
 *                       minimum: 1
 *                       maximum: 99
 *                       example: 2
 *           example:
 *             items:
 *               - menuId: 1
 *                 quantity: 2
 *               - menuId: 3
 *                 quantity: 1
 *     responses:
 *       201:
 *         description: 주문 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: integer
 *                   example: 1
 *                 totalPrice:
 *                   type: number
 *                   format: decimal
 *                   example: 13500.00
 *                 status:
 *                   type: string
 *                   enum: [RECEIVED]
 *                   example: "RECEIVED"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-06-15T10:30:00Z"
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       menuId:
 *                         type: integer
 *                         example: 1
 *                       menuName:
 *                         type: string
 *                         example: "아메리카노"
 *                       quantity:
 *                         type: integer
 *                         example: 2
 *                       pricePerItem:
 *                         type: number
 *                         format: decimal
 *                         example: 4500.00
 *                       price:
 *                         type: number
 *                         format: decimal
 *                         example: 9000.00
 *       400:
 *         description: 잘못된 요청 데이터
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing_items:
 *                 summary: 주문 항목 누락
 *                 value:
 *                   success: false
 *                   message: "주문 항목이 필요합니다. 'items' 배열에 최소 하나의 항목을 포함해야 합니다."
 *               invalid_menu_id:
 *                 summary: 유효하지 않은 메뉴 ID
 *                 value:
 *                   success: false
 *                   message: "유효하지 않은 메뉴 ID입니다: 0. 양의 정수여야 합니다."
 *               invalid_quantity:
 *                 summary: 유효하지 않은 수량
 *                 value:
 *                   success: false
 *                   message: "유효하지 않은 수량입니다: 100. 1 이상 99 이하의 정수여야 합니다."
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = app => {
  const publicOrders = require("../../controllers/public/order.controller.js");
  const router = require("express").Router();

  router.post("/", publicOrders.create);

  app.use('/api/public/orders', router);
};
