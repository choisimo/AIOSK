// src/routes/menu.routes.js

/**
 * @swagger
 * /api/menus/{menuId}/image:
 *   post:
 *     summary: 메뉴 이미지 업로드
 *     description: 특정 메뉴에 이미지를 업로드합니다.
 *     tags: [📁 File Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 메뉴 ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: 업로드할 이미지 파일 (jpg, jpeg, png, gif 지원, 최대 5MB)
 *     responses:
 *       200:
 *         description: 이미지 업로드 성공
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
 *                   example: "메뉴 이미지가 성공적으로 업로드되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     menuId:
 *                       type: integer
 *                       example: 1
 *                     imageUrl:
 *                       type: string
 *                       example: "/uploads/menus/1672812345_americano.jpg"
 *                     originalName:
 *                       type: string
 *                       example: "americano.jpg"
 *                     fileSize:
 *                       type: integer
 *                       example: 245760
 *       400:
 *         description: 잘못된 요청 (파일 없음, 잘못된 형식, 크기 초과 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               no_file:
 *                 summary: 파일 누락
 *                 value:
 *                   success: false
 *                   message: "업로드할 이미지 파일을 선택해주세요."
 *               file_too_large:
 *                 summary: 파일 크기 초과
 *                 value:
 *                   success: false
 *                   message: "파일 크기가 너무 큽니다. 5MB 이하의 파일만 업로드 가능합니다."
 *               invalid_format:
 *                 summary: 잘못된 파일 형식
 *                 value:
 *                   success: false
 *                   message: "지원하지 않는 파일 형식입니다. jpg, jpeg, png, gif 파일만 업로드 가능합니다."
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 메뉴를 찾을 수 없음
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

/**
 * @swagger
 * /api/menus:
 *   post:
 *     summary: 새 메뉴 생성
 *     description: 새로운 메뉴를 생성합니다.
 *     tags: [🍔 Admin - Menus]
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
 *               - price
 *               - category_id
 *             properties:
 *               name:
 *                 type: string
 *                 description: 메뉴 이름
 *                 example: "아메리카노"
 *               description:
 *                 type: string
 *                 description: 메뉴 설명
 *                 example: "진한 에스프레소와 뜨거운 물"
 *               price:
 *                 type: number
 *                 format: decimal
 *                 description: 메뉴 가격
 *                 example: 4500.00
 *               category_id:
 *                 type: integer
 *                 description: 카테고리 ID
 *                 example: 1
 *               is_available:
 *                 type: boolean
 *                 description: 판매 가능 여부
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: 메뉴 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Menu'
 *       400:
 *         description: 잘못된 요청 데이터
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 *   get:
 *     summary: 메뉴 목록 조회 (관리자용)
 *     description: 모든 메뉴 목록을 조회합니다.
 *     tags: [🍔 Admin - Menus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 메뉴 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Menu'
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

const authMiddleware = require("../middleware/auth.middleware.js"); // Import the middleware
const { uploadSingle, handleUploadError } = require("../middleware/upload.middleware.js"); // Import upload middleware

module.exports = app => {
  const menus = require("../controllers/menu.controller.js");
  var router = require("express").Router();

  // Apply middleware to all menu routes that need protection
  // Create a new Menu
  router.post("/", authMiddleware, menus.create);

  // Retrieve all Menus (typically public for a kiosk, but admin might need auth for management)
  // For this exercise, let's assume menu listing for admin management is protected.
  // If kiosk needs public menu listing, a separate public route or logic would be needed.
  router.get("/", authMiddleware, menus.findAll);

  // Retrieve a single Menu with id (similar to findAll, protect for admin management)
  router.get("/:id", authMiddleware, menus.findOne);

  // Update a Menu with id
  router.put("/:id", authMiddleware, menus.update);

  // Upload image for a specific menu
  router.post("/:menuId/image", authMiddleware, uploadSingle, handleUploadError, menus.uploadImage);

  // Delete a Menu with id
  router.delete("/:id", authMiddleware, menus.delete);

  // Delete all Menus (if exposed, definitely protect)
  // router.delete("/", authMiddleware, menus.deleteAll);

  app.use('/api/menus', router);
};
