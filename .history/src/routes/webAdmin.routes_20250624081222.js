// 웹 관리자 인터페이스 라우트
const express = require('express');
const router = express.Router();
const webAdminController = require('../controllers/webAdmin.controller');

// 루트 경로 리다이렉트 (인증 체크 후)
router.get('/', (req, res, next) => {
  const sessionId = req.session?.adminId;
  if (!sessionId) {
    return res.redirect('/admin/login');
  }
  next();
}, webAdminController.getDashboard);

// 로그인 페이지 (인증 불필요)
router.get('/login', webAdminController.getLogin);
router.post('/login', webAdminController.postLogin);

// 로그아웃
router.get('/logout', webAdminController.logout);

// 인증이 필요한 모든 라우트에 미들웨어 적용
router.use(webAdminController.requireAuth);

// 대시보드
router.get('/dashboard', (req, res) => res.redirect('/admin'));

// 주문 관리
router.get('/orders', webAdminController.getOrders);

// 메뉴 관리
router.get('/menus', webAdminController.getMenus);

// 카테고리 관리
router.get('/categories', (req, res) => {
  res.render('admin/categories', {
    title: '카테고리 관리',
    currentPage: 'categories'
  });
});

// 통계 및 리포트
router.get('/statistics', (req, res) => {
  res.render('admin/statistics', {
    title: '통계 및 리포트',
    currentPage: 'statistics'
  });
});

// 키오스크 모니터링
router.get('/kiosk-monitor', (req, res) => {
  res.render('admin/kiosk-monitor', {
    title: '키오스크 모니터링',
    currentPage: 'kiosk-monitor'
  });
});

// 시스템 설정
router.get('/settings', (req, res) => {
  res.render('admin/settings', {
    title: '시스템 설정',
    currentPage: 'settings'
  });
});

module.exports = router;
