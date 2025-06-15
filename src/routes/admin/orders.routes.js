// src/routes/admin/orders.routes.js
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

// [PATCH] /api/admin/orders/:orderId/cancel - 특정 주문 취소하기 (새로 추가!)
router.patch('/:orderId/cancel', adminOrderController.cancel);

module.exports = router;
