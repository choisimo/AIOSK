/**
 * @swagger
 * /api/public/kiosk/status:
 *   post:
 *     summary: 키오스크 상태 보고
 *     description: 키오스크 클라이언트가 heartbeat/status를 서버에 저장합니다.
 *     tags: [🔓 Public API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kioskId
 *             properties:
 *               kioskId:
 *                 type: string
 *                 example: kiosk-01
 *               label:
 *                 type: string
 *                 example: Front Counter
 *               status:
 *                 type: string
 *                 enum: [ONLINE, DEGRADED, MAINTENANCE, OFFLINE]
 *                 example: ONLINE
 *               appVersion:
 *                 type: string
 *                 example: local
 *     responses:
 *       200:
 *         description: 상태 저장 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: KIOSK_STATUS_TOKEN 검증 실패
 */
module.exports = app => {
  const kioskStatus = require('../../controllers/public/kioskStatus.controller.js');
  const router = require('express').Router();

  router.post('/status', kioskStatus.report);

  app.use('/api/public/kiosk', router);
};
