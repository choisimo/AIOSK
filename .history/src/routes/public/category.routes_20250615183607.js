// src/routes/public/category.routes.js

/**
 * @swagger
 * /api/public/categories:
 *   get:
 *     summary: 활성화된 카테고리 목록 조회 (공개 API)
 *     description: 키오스크에서 사용할 활성화된 카테고리 목록을 조회합니다. 인증이 필요하지 않습니다.
 *     tags: [🔓 Public API]
 *     responses:
 *       200:
 *         description: 카테고리 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Category'
 *             example:
 *               - id: 1
 *                 name: "음료"
 *                 description: "다양한 음료 메뉴"
 *                 is_active: true
 *                 created_at: "2025-06-15T10:30:00Z"
 *                 updated_at: "2025-06-15T10:30:00Z"
 *               - id: 2
 *                 name: "디저트"
 *                 description: "달콤한 디저트 메뉴"
 *                 is_active: true
 *                 created_at: "2025-06-15T10:30:00Z"
 *                 updated_at: "2025-06-15T10:30:00Z"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = app => {
  const publicCategories = require("../../controllers/public/category.controller.js");
  var router = require("express").Router();

  // 공개 카테고리 목록 조회 (인증 불필요)
  router.get("/", publicCategories.findAll);

  app.use('/api/public/categories', router);
};
