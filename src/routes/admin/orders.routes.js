// src/routes/admin/orders.routes.js

/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: 관리자 주문 목록 조회
 *     description: 관리자 인증 후 주문 목록을 필터와 페이지네이션 옵션으로 조회합니다.
 *     tags: [📋 Admin - Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [RECEIVED, PREPARING, COMPLETED, CANCELLED]
 *         description: 주문 상태 필터
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜
 *       - in: query
 *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *           maximum: 200
   *         description: 조회 개수. 200개를 초과하면 200개로 제한됩니다.
 *       - in: query
 *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *           maximum: 10000
   *         description: 조회 시작 위치. 10000을 초과하면 10000으로 제한됩니다.
 *     responses:
 *       200:
 *         description: 주문 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       total_price:
 *                         type: number
 *                         format: decimal
 *                         example: 9000.00
 *                       status:
 *                         type: string
 *                         example: "RECEIVED"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             menuId:
 *                               type: integer
 *                               example: 1
 *                             menuName:
 *                               type: string
 *                               example: "아메리카노"
 *                             quantity:
 *                               type: integer
 *                               example: 2
 *                             pricePerItem:
 *                               type: number
 *                               format: decimal
 *                               example: 4500.00
 *       401:
 *         description: 인증 실패
 *       400:
 *         description: 잘못된 상태 필터, 날짜 형식 또는 날짜 범위
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/admin/orders/{orderId}:
 *   get:
 *     summary: 관리자 주문 상세 조회
 *     description: 관리자 인증 후 주문 ID로 주문과 주문 항목을 조회합니다.
 *     tags: [📋 Admin - Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 주문 ID
 *     responses:
 *       200:
 *         description: 주문 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     total_price:
 *                       type: number
 *                       format: decimal
 *                       example: 9000.00
 *                     status:
 *                       type: string
 *                       example: "RECEIVED"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 10
 *                           menu_id:
 *                             type: integer
 *                             example: 1
 *                           menu_name:
 *                             type: string
 *                             example: "아메리카노"
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price_per_item:
 *                             type: number
 *                             format: decimal
 *                             example: 4500.00
 *       400:
 *         description: 잘못된 주문 ID
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 주문을 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/admin/orders/{orderId}/status:
 *   patch:
 *     summary: 주문 상태 변경
 *     description: 관리자 인증 후 주문 상태를 변경하고 Socket.IO 이벤트를 발행합니다.
 *     tags: [📋 Admin - Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 주문 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [RECEIVED, PREPARING, COMPLETED, CANCELLED]
 *                 example: "PREPARING"
 *     responses:
 *       200:
 *         description: 주문 상태 변경 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "주문 상태가 성공적으로 변경되었습니다."
 *                 orderId:
 *                   type: integer
 *                   example: 1
 *                 previousStatus:
 *                   type: string
 *                   nullable: true
 *                   example: "RECEIVED"
 *                 status:
 *                   type: string
 *                   example: "PREPARING"
 *       400:
 *         description: 잘못된 주문 ID, 상태 누락, 유효하지 않은 상태, 또는 상태 변경 불가
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/admin/orders/{orderId}/cancel:
 *   patch:
 *     summary: 주문 취소
 *     description: 관리자 인증 후 접수 또는 준비 중인 주문을 취소하고 Socket.IO 이벤트를 발행합니다.
 *     tags: [📋 Admin - Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 주문 ID
 *     responses:
 *       200:
 *         description: 주문 취소 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "주문이 성공적으로 취소되었습니다."
 *                 orderId:
 *                   type: integer
 *                   example: 1
 *                 status:
 *                   type: string
 *                   example: "CANCELLED"
 *       400:
 *         description: 잘못된 주문 ID, 주문 없음, 또는 취소 불가능한 상태
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware'); // 관리자 인증 미들웨어
const adminOrderController = require('../../controllers/admin/order.controller.js'); // 관리자 주문 컨트롤러

// 모든 라우트에 관리자 인증 미들웨어 적용
router.use(authMiddleware);

// [GET] /api/admin/orders - 모든 주문 목록 가져오기
// 쿼리 파라미터: status, startDate, endDate, limit, offset
router.get('/', adminOrderController.findAll);

// [GET] /api/admin/orders/:orderId - 특정 주문 상세 조회
router.get('/:orderId', adminOrderController.findOne);

// [PATCH] /api/admin/orders/:orderId/status - 특정 주문 상태 변경하기
router.patch('/:orderId/status', adminOrderController.updateStatus);

// [PATCH] /api/admin/orders/:orderId/cancel - 특정 주문 취소하기
router.patch('/:orderId/cancel', adminOrderController.cancel);

module.exports = router;
