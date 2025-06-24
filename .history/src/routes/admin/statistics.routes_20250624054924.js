// src/routes/admin/statistics.routes.js

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/admin/statistics:
 *   get:
 *     summary: 종합 대시보드 통계 조회
 *     description: 관리자가 사용할 대시보드의 전체 통계 정보를 조회합니다.
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜 (YYYY-MM-DD)
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜 (YYYY-MM-DD)
 *         example: "2025-06-15"
 *     responses:
 *       200:
 *         description: 대시보드 통계 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Statistics'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: 잘못된 날짜 형식
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
 * /api/admin/statistics/sales:
 *   get:
 *     summary: 매출 통계 조회
 *     description: 지정된 기간의 매출 통계를 조회합니다.
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜 (YYYY-MM-DD)
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜 (YYYY-MM-DD)
 *         example: "2025-06-15"
 *     responses:
 *       200:
 *         description: 매출 통계 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                       example: "2025-06-01 ~ 2025-06-15"
 *                     totalSales:
 *                       type: number
 *                       format: decimal
 *                       example: 450000.00
 *                     totalOrders:
 *                       type: integer
 *                       example: 125
 *                     averageOrderValue:
 *                       type: number
 *                       format: decimal
 *                       example: 3600.00
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/admin/statistics/top-menus:
 *   get:
 *     summary: 인기 메뉴 순위 조회
 *     description: 판매량 기준 인기 메뉴 순위를 조회합니다.
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: "조회할 메뉴 개수 (기본값: 10)"
 *         example: 10
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜 (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜 (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: 인기 메뉴 순위 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                         example: 1
 *                       menu_name:
 *                         type: string
 *                         example: "아메리카노"
 *                       total_quantity:
 *                         type: integer
 *                         example: 45
 *                       total_sales:
 *                         type: number
 *                         format: decimal
 *                         example: 202500.00
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /api/admin/statistics/report:
 *   get:
 *     summary: 매출 리포트 생성 및 다운로드
 *     description: 지정된 기간의 매출 리포트를 JSON 또는 CSV 형식으로 생성합니다.
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜 (YYYY-MM-DD)
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜 (YYYY-MM-DD)
 *         example: "2025-06-15"
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *         description: "리포트 형식 (기본값: json)"
 *         example: "csv"
 *     responses:
 *       200:
 *         description: 리포트 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: 매출 리포트 데이터
 *           text/csv:
 *             schema:
 *               type: string
 *               example: "Date,Sales,Orders,Average Order Value\n2025-06-01,15000.00,5,3000.00"
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth.middleware'); // 관리자 인증 미들웨어
const statisticsController = require('../../controllers/admin/statistics.controller.js'); // 통계 컨트롤러

// 모든 라우트에 관리자 인증 미들웨어 적용
router.use(authMiddleware);

// [GET] /api/admin/statistics - 종합 대시보드 통계 조회
// 쿼리 파라미터: startDate, endDate (선택사항)
router.get('/', statisticsController.getDashboard);

// [GET] /api/admin/statistics/sales - 매출 통계 조회
// 쿼리 파라미터: startDate, endDate (선택사항)
router.get('/sales', statisticsController.getSalesStatistics);

// [GET] /api/admin/statistics/top-menus - 인기 메뉴 순위 조회
// 쿼리 파라미터: limit (기본값: 10), startDate, endDate (선택사항)
router.get('/top-menus', statisticsController.getTopSellingMenus);

// [GET] /api/admin/statistics/daily-sales - 일별 매출 현황 조회
// 쿼리 파라미터: startDate, endDate (선택사항)
router.get('/daily-sales', statisticsController.getDailySales);

// [GET] /api/admin/statistics/hourly-analysis - 시간대별 주문 분석 조회
// 쿼리 파라미터: startDate, endDate (선택사항)
router.get('/hourly-analysis', statisticsController.getHourlyAnalysis);

// [GET] /api/admin/statistics/category-analysis - 카테고리별 매출 분석 조회
// 쿼리 파라미터: startDate, endDate (선택사항)
router.get('/category-analysis', statisticsController.getCategoryAnalysis);

// [GET] /api/admin/statistics/report - 매출 리포트 생성
// 쿼리 파라미터: startDate, endDate, format (json|csv, 기본값: json)
router.get('/report', statisticsController.generateSalesReport);

module.exports = router;
