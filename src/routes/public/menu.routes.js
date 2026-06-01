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
 *                 type: object
 *                 properties:
 *                   menuId:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: "아메리카노"
 *                   description:
 *                     type: string
 *                     nullable: true
 *                     example: "진한 에스프레소와 뜨거운 물"
 *                   price:
 *                     type: number
 *                     format: decimal
 *                     example: 4500.00
 *                   imageUrl:
 *                     type: string
 *                     nullable: true
 *                     example: "/uploads/menus/menu-1-1700000000000.png"
 *                   status:
 *                     type: string
 *                     enum: [FOR_SALE]
 *                     example: "FOR_SALE"
 *                   categoryId:
 *                     type: integer
 *                     example: 1
 *             example:
 *               - menuId: 1
 *                 name: "아메리카노"
 *                 description: "진한 에스프레소와 뜨거운 물"
 *                 price: 4500.00
 *                 imageUrl: "/uploads/menus/menu-1-1700000000000.png"
 *                 status: "FOR_SALE"
 *                 categoryId: 1
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
  const router = require("express").Router();

  router.get("/", publicMenus.findAll);

  app.use('/api/public/menus', router);
};
