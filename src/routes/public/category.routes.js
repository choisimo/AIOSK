// src/routes/public/category.routes.js

/**
 * @swagger
 * /api/public/categories:
 *   get:
 *     summary: 카테고리 목록 조회 (공개 API)
 *     description: 키오스크에서 사용할 카테고리 목록을 sortOrder 순서로 조회합니다. 인증이 필요하지 않습니다.
 *     tags: [🔓 Public API]
 *     responses:
 *       200:
 *         description: 카테고리 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   categoryId:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: "음료"
 *                   sortOrder:
 *                     type: integer
 *                     example: 1
 *             example:
 *               - categoryId: 1
 *                 name: "음료"
 *                 sortOrder: 1
 *               - categoryId: 2
 *                 name: "디저트"
 *                 sortOrder: 2
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

module.exports = app => {
  const publicCategories = require("../../controllers/public/category.controller.js");
  const router = require("express").Router();

  router.get("/", publicCategories.findAll);

  app.use('/api/public/categories', router);
};
