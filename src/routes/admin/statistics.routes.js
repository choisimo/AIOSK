// src/routes/admin/statistics.routes.js
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
