// 웹 관리자 인터페이스 라우트
const express = require('express');
const router = express.Router();
const webAdminController = require('../controllers/webAdmin.controller');
const { attachCsrfToken, verifyCsrfToken } = require('../middleware/csrf.middleware');

router.use(attachCsrfToken);

// 로그인 페이지 (인증 불필요)
router.get('/login', webAdminController.getLogin);
router.post('/login', verifyCsrfToken, webAdminController.postLogin);

// 인증이 필요한 모든 라우트에 미들웨어 적용
router.use(webAdminController.requireAuth);

// 로그아웃
router.post('/logout', verifyCsrfToken, webAdminController.logout);

// 루트 경로
router.get('/', webAdminController.getDashboard);

// 대시보드
router.get('/dashboard', (req, res) => res.redirect('/admin'));

// 주문 관리
router.get('/orders', webAdminController.getOrders);
router.get('/orders/:orderId.json', webAdminController.getOrderJson);
router.post('/orders/:orderId/status', verifyCsrfToken, webAdminController.postOrderStatus);
router.post('/orders/:orderId/cancel', verifyCsrfToken, webAdminController.postOrderCancel);

// 메뉴 관리
router.get('/menus', webAdminController.getMenus);
router.post('/menus', verifyCsrfToken, webAdminController.postMenuCreate);
router.post('/menus/:menuId/update', verifyCsrfToken, webAdminController.postMenuUpdate);
router.post('/menus/:menuId/delete', verifyCsrfToken, webAdminController.postMenuDelete);

// 카테고리 관리
router.get('/categories', webAdminController.getCategories);
router.post('/categories', verifyCsrfToken, webAdminController.postCategoryCreate);
router.post('/categories/:categoryId/update', verifyCsrfToken, webAdminController.postCategoryUpdate);
router.post('/categories/:categoryId/delete', verifyCsrfToken, webAdminController.postCategoryDelete);

// 통계 및 리포트
router.get('/statistics', webAdminController.getStatistics);

module.exports = router;
