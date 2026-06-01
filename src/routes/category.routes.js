// src/routes/category.routes.js

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: 카테고리 생성
 *     description: 관리자 인증 후 새 카테고리를 생성합니다.
 *     tags: [🏷️ Admin - Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "음료"
 *               sort_order:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       201:
 *         description: 카테고리 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: "음료"
 *                 sort_order:
 *                   type: integer
 *                   example: 10
 *       400:
 *         description: 카테고리 이름 누락
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 *   get:
 *     summary: 카테고리 목록 조회
 *     description: 관리자 인증 후 카테고리 목록을 조회합니다.
 *     tags: [🏷️ Admin - Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: 카테고리 이름 부분 검색어
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
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: "음료"
 *                   sort_order:
 *                     type: integer
 *                     example: 10
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: 카테고리 상세 조회
 *     description: 관리자 인증 후 카테고리 ID로 상세 정보를 조회합니다.
 *     tags: [🏷️ Admin - Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 카테고리 ID
 *     responses:
 *       200:
 *         description: 카테고리 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: "음료"
 *                 sort_order:
 *                   type: integer
 *                   example: 10
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 카테고리를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 *   put:
 *     summary: 카테고리 수정
 *     description: 관리자 인증 후 카테고리 이름 또는 정렬 순서를 수정합니다.
 *     tags: [🏷️ Admin - Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 카테고리 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "커피"
 *               sort_order:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       200:
 *         description: 카테고리 수정 성공
 *       400:
 *         description: 잘못된 요청 데이터
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 카테고리를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 *   delete:
 *     summary: 카테고리 삭제
 *     description: 관리자 인증 후 카테고리를 삭제합니다.
 *     tags: [🏷️ Admin - Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 카테고리 ID
 *     responses:
 *       200:
 *         description: 카테고리 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Category was deleted successfully!"
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 카테고리를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

const authMiddleware = require("../middleware/auth.middleware.js");

module.exports = app => {
  const categories = require("../controllers/category.controller.js");
  const router = require("express").Router();

  router.post("/", authMiddleware, categories.create);
  router.get("/", authMiddleware, categories.findAll);
  router.get("/:id", authMiddleware, categories.findOne);
  router.put("/:id", authMiddleware, categories.update);
  router.delete("/:id", authMiddleware, categories.delete);

  app.use('/api/categories', router);
};
