// src/routes/admin/statistics.routes.js

/**
 * @swagger
 * /api/admin/statistics:
 *   get:
 *     summary: 종합 대시보드 통계 조회
 *     description: "관리자가 사용할 대시보드의 전체 통계 정보를 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *         example: "2025-06-15"
 *     responses:
 *       200:
 *         description: "대시보드 통계 조회 성공"
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
 *         description: "인증 실패"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: "잘못된 날짜 형식"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: "서버 오류"
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
 *     description: "지정된 기간의 매출 통계를 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *         example: "2025-06-15"
 *     responses:
 *       200:
 *         description: "매출 통계 조회 성공"
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
 *                     total_orders:
 *                       type: integer
 *                       example: 125
 *                     total_sales:
 *                       type: number
 *                       format: decimal
 *                       example: 450000.00
 *                     average_order_value:
 *                       type: number
 *                       format: decimal
 *                       example: 3600.00
 *                     completed_orders:
 *                       type: integer
 *                       example: 110
 *                     cancelled_orders:
 *                       type: integer
 *                       example: 5
 *                     pending_orders:
 *                       type: integer
 *                       example: 6
 *                     preparing_orders:
 *                       type: integer
 *                       example: 4
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           nullable: true
 *                           example: "2025-06-01"
 *                         endDate:
 *                           type: string
 *                           nullable: true
 *                           example: "2025-06-15"
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: "인증 실패"
 *       500:
 *         description: "서버 오류"
 */

/**
 * @swagger
 * /api/admin/statistics/top-menus:
 *   get:
 *     summary: 인기 메뉴 순위 조회
 *     description: "판매량 기준 인기 메뉴 순위를 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: "조회할 메뉴 개수 (기본값: 10)"
 *         example: 10
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *     responses:
 *       200:
 *         description: "인기 메뉴 순위 조회 성공"
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
 *                     menus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           menu_id:
 *                             type: integer
 *                             example: 1
 *                           menu_name:
 *                             type: string
 *                             example: "아메리카노"
 *                           category_name:
 *                             type: string
 *                             nullable: true
 *                             example: "음료"
 *                           total_quantity:
 *                             type: integer
 *                             example: 45
 *                           order_count:
 *                             type: integer
 *                             example: 32
 *                           total_revenue:
 *                             type: number
 *                             format: decimal
 *                             example: 202500.00
 *                           average_price:
 *                             type: number
 *                             format: decimal
 *                             example: 4500.00
 *                     count:
 *                       type: integer
 *                       example: 10
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           nullable: true
 *                         endDate:
 *                           type: string
 *                           nullable: true
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: "인증 실패"
 *       400:
 *         description: "잘못된 조회 개수"
 *       500:
 *         description: "서버 오류"
 */

/**
 * @swagger
 * /api/admin/statistics/daily-sales:
 *   get:
 *     summary: 일별 매출 현황 조회
 *     description: "지정된 기간의 일별 매출 현황을 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *     responses:
 *       200:
 *         description: "일별 매출 조회 성공"
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
 *                     sales:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sale_date:
 *                             type: string
 *                             format: date
 *                             example: "2025-06-15"
 *                           order_count:
 *                             type: integer
 *                             example: 12
 *                           daily_sales:
 *                             type: number
 *                             format: decimal
 *                             example: 54000.00
 *                           completed_orders:
 *                             type: integer
 *                             example: 10
 *                           cancelled_orders:
 *                             type: integer
 *                             example: 1
 *                     count:
 *                       type: integer
 *                       example: 7
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           nullable: true
 *                         endDate:
 *                           type: string
 *                           nullable: true
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: "인증 실패"
 *       500:
 *         description: "서버 오류"
 */

/**
 * @swagger
 * /api/admin/statistics/hourly-analysis:
 *   get:
 *     summary: 시간대별 주문 분석 조회
 *     description: "지정된 기간의 시간대별 주문과 매출을 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *     responses:
 *       200:
 *         description: "시간대별 주문 분석 조회 성공"
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
 *                     hourlyStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           order_hour:
 *                             type: integer
 *                             minimum: 0
 *                             maximum: 23
 *                             example: 12
 *                           order_count:
 *                             type: integer
 *                             example: 8
 *                           hourly_sales:
 *                             type: number
 *                             format: decimal
 *                             example: 36000.00
 *                           average_order_value:
 *                             type: number
 *                             format: decimal
 *                             example: 4500.00
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           nullable: true
 *                         endDate:
 *                           type: string
 *                           nullable: true
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: "인증 실패"
 *       500:
 *         description: "서버 오류"
 */

/**
 * @swagger
 * /api/admin/statistics/category-analysis:
 *   get:
 *     summary: 카테고리별 매출 분석 조회
 *     description: "지정된 기간의 카테고리별 매출과 주문량을 조회합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
 *     responses:
 *       200:
 *         description: "카테고리별 매출 분석 조회 성공"
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
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category_id:
 *                             type: integer
 *                             example: 1
 *                           category_name:
 *                             type: string
 *                             example: "음료"
 *                           order_count:
 *                             type: integer
 *                             example: 20
 *                           total_quantity:
 *                             type: integer
 *                             example: 34
 *                           category_revenue:
 *                             type: number
 *                             format: decimal
 *                             example: 153000.00
 *                           menu_count:
 *                             type: integer
 *                             example: 6
 *                     count:
 *                       type: integer
 *                       example: 5
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           nullable: true
 *                         endDate:
 *                           type: string
 *                           nullable: true
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: "인증 실패"
 *       500:
 *         description: "서버 오류"
 */

/**
 * @swagger
 * /api/admin/statistics/report:
 *   get:
 *     summary: 매출 리포트 생성 및 다운로드
 *     description: "지정된 기간의 매출 리포트를 JSON 또는 CSV 형식으로 생성합니다."
 *     tags: [📊 Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 시작 날짜 (YYYY-MM-DD)"
 *         example: "2025-06-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: "조회 종료 날짜 (YYYY-MM-DD)"
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
 *         description: "리포트 생성 성공"
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
 *                     report:
 *                       $ref: '#/components/schemas/Statistics'
 *                     reportType:
 *                       type: string
 *                       example: "comprehensive"
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *           text/csv:
 *             schema:
 *               type: string
 *               example: "매출 개요\n항목,값\n총 주문 수,5\n총 매출,15000.00"
 *       401:
 *         description: "인증 실패"
 *       500:
 *         description: "서버 오류"
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
