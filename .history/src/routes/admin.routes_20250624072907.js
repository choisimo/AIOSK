// src/routes/admin.routes.js

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: 관리자 로그인
 *     description: 관리자 계정으로 로그인하여 JWT 토큰을 발급받습니다.
 *     tags: [🔐 Admin - Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 관리자 사용자명
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 관리자 비밀번호
 *                 example: "admin123"
 *     responses:
 *       200:
 *         description: 로그인 성공
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
 *                   example: "로그인 성공"
 *                 token:
 *                   type: string
 *                   description: JWT 인증 토큰
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: "admin"
 *       400:
 *         description: 잘못된 요청 (필수 필드 누락)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "사용자명과 비밀번호를 입력해주세요."
 *       401:
 *         description: 인증 실패 (잘못된 자격증명)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "사용자명 또는 비밀번호가 올바르지 않습니다."
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = app => {
  const adminController = require("../controllers/admin.controller.js");
  var router = require("express").Router();

  // Admin Login
  router.post("/login", adminController.login);

  // Admin Registration (optional, for initial setup - secure appropriately in production)
  // router.post("/register", adminController.register);

  app.use('/api/admin', router);
};
