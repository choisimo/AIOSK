// src/routes/public/menu.routes.js

/**
 * @swagger
 * /api/public/menus:
 *   get:
 *     summary: 판매 가능한 메뉴 목록 조회 (공개 API)
 *     description: 키오스크에서 사용할 판매 가능한 메뉴 목록을 조회합니다. 카테고리별 필터링이 가능합니다.
 *     tags: [🔓 Public API]
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: 특정 카테고리의 메뉴만 조회 (선택사항)
 *         example: 1
 *     responses:
 *       200:
 *         description: 메뉴 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Menu'
 *             example:
 *               - id: 1
 *                 name: "아메리카노"
 *                 description: "진한 에스프레소와 뜨거운 물"
 *                 price: 4500.00
 *                 category_id: 1
 *                 category_name: "음료"
 *                 image_url: "/uploads/menus/americano.jpg"
 *                 is_available: true
 *                 created_at: "2025-06-15T10:30:00Z"
 *                 updated_at: "2025-06-15T10:30:00Z"
 *       400:
 *         description: 잘못된 요청 (유효하지 않은 categoryId)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = app => {
  const publicMenus = require("../../controllers/public/menu.controller.js");
  var router = require("express").Router();

  // 공개 메뉴 목록 조회 (인증 불필요)
  // 쿼리 파라미터: categoryId (선택사항)
  router.get("/", publicMenus.findAll);

  app.use('/api/public/menus', router);
};
