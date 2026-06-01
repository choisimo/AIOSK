const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware');
const kioskStatusController = require('../../controllers/admin/kioskStatus.controller.js');

router.use(authMiddleware);

/**
 * @swagger
 * /api/admin/kiosks/status:
 *   get:
 *     summary: 키오스크 상태 목록 조회
 *     description: 관리자 토큰으로 수집된 키오스크 상태와 요약을 조회합니다.
 *     tags: [🔐 Admin - Kiosks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 키오스크 상태 조회 성공
 *       401:
 *         description: 인증 실패
 */
router.get('/status', kioskStatusController.findAll);

module.exports = router;
