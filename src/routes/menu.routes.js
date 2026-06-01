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
 *                 description: 업로드할 이미지 파일 (jpg, jpeg, png, gif, webp 지원, 최대 5MB)
 *     responses:
 *       200:
 *         description: 이미지 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "이미지가 성공적으로 업로드되었습니다."
 *                 imageUrl:
 *                   type: string
 *                   example: "/uploads/menus/menu-1-1700000000000.jpg"
 *                 filename:
 *                   type: string
 *                   example: "menu-1-1700000000000.jpg"
 *                 menuId:
 *                   type: integer
 *                   example: 1
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
 *                   message: "업로드할 이미지 파일을 선택해주세요."
 *               file_too_large:
 *                 summary: 파일 크기 초과
 *                 value:
 *                   message: "파일 크기가 너무 큽니다. 5MB 이하의 파일만 업로드 가능합니다."
 *               invalid_format:
 *                 summary: 잘못된 파일 형식
 *                 value:
 *                   message: "이미지 파일만 업로드 가능합니다. (JPEG, PNG, GIF, WebP)"
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
 *               image_url:
 *                 type: string
 *                 nullable: true
 *                 description: 메뉴 이미지 URL
 *                 example: "/uploads/menus/menu-1-1700000000000.jpg"
 *               status:
 *                 type: string
 *                 enum: [FOR_SALE, SOLD_OUT]
 *                 description: 판매 상태
 *                 default: FOR_SALE
 *                 example: "FOR_SALE"
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
 *     parameters:
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *         description: 카테고리 ID 필터
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: 메뉴 이름 부분 검색어
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [FOR_SALE, SOLD_OUT]
 *         description: 판매 상태 필터
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

/**
 * @swagger
 * /api/menus/{id}:
 *   get:
 *     summary: 메뉴 상세 조회
 *     description: 관리자 인증 후 메뉴 ID로 상세 정보를 조회합니다.
 *     tags: [🍔 Admin - Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 메뉴 ID
 *     responses:
 *       200:
 *         description: 메뉴 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Menu'
 *       400:
 *         description: 잘못된 메뉴 ID
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 메뉴를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 *   put:
 *     summary: 메뉴 수정
 *     description: 관리자 인증 후 메뉴 정보를 수정합니다.
 *     tags: [🍔 Admin - Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 메뉴 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "아이스 아메리카노"
 *               description:
 *                 type: string
 *                 example: "차가운 아메리카노"
 *               price:
 *                 type: number
 *                 format: decimal
 *                 example: 5000.00
 *               category_id:
 *                 type: integer
 *                 example: 1
 *               image_url:
 *                 type: string
 *                 nullable: true
 *                 example: "/uploads/menus/menu-1-1700000000000.jpg"
 *               status:
 *                 type: string
 *                 enum: [FOR_SALE, SOLD_OUT]
 *                 example: "FOR_SALE"
 *     responses:
 *       200:
 *         description: 메뉴 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Menu'
 *       400:
 *         description: 잘못된 요청 데이터
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 메뉴를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 *   delete:
 *     summary: 메뉴 삭제
 *     description: 관리자 인증 후 메뉴를 삭제합니다.
 *     tags: [🍔 Admin - Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 메뉴 ID
 *     responses:
 *       200:
 *         description: 메뉴 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Menu item was deleted successfully!"
 *       400:
 *         description: 잘못된 메뉴 ID
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 메뉴를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

const authMiddleware = require("../middleware/auth.middleware.js");
const { uploadSingle, handleUploadError } = require("../middleware/upload.middleware.js");

module.exports = app => {
  const menus = require("../controllers/menu.controller.js");
  const router = require("express").Router();

  router.post("/", authMiddleware, menus.create);
  router.get("/", authMiddleware, menus.findAll);
  router.get("/:id", authMiddleware, menus.findOne);
  router.put("/:id", authMiddleware, menus.update);
  router.post("/:menuId/image", authMiddleware, uploadSingle, handleUploadError, menus.uploadImage);
  router.delete("/:id", authMiddleware, menus.delete);

  app.use('/api/menus', router);
};
