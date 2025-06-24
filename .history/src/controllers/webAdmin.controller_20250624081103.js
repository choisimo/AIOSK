// 웹 관리자 인터페이스 컨트롤러
const path = require('path');
const fs = require('fs').promises;

// 임시 세션 저장소 (실제 운영 환경에서는 Redis 등 사용 권장)
const sessions = new Map();

// 관리자 인증 미들웨어
const requireAuth = (req, res, next) => {
  console.log('인증 체크:', req.session);
  const sessionId = req.session?.adminId;
  if (!sessionId || !sessions.has(sessionId)) {
    console.log('인증 실패 - 로그인 페이지로 리다이렉트');
    return res.redirect('/admin/login');
  }
  req.admin = sessions.get(sessionId);
  console.log('인증 성공:', req.admin);
  next();
};

// 대시보드 페이지
const getDashboard = async (req, res) => {
  try {
    // 임시 데이터 (실제로는 데이터베이스에서 조회)
    const todayStatistics = {
      totalSales: 150000,
      orderCount: 12,
      averageOrderValue: 12500
    };

    const pendingOrdersCount = 3;
    
    const recentOrders = [
      {
        id: 1,
        totalPrice: 15000,
        status: 'RECEIVED',
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        totalPrice: 23000,
        status: 'PREPARING',
        createdAt: new Date(Date.now() - 300000).toISOString()
      }
    ];

    const salesChartData = [
      { date: '06-18', sales: 125000 },
      { date: '06-19', sales: 140000 },
      { date: '06-20', sales: 135000 },
      { date: '06-21', sales: 160000 },
      { date: '06-22', sales: 155000 },
      { date: '06-23', sales: 170000 },
      { date: '06-24', sales: 150000 }
    ];

    const popularMenuData = [
      { menuName: '불고기버거', count: 15 },
      { menuName: '치킨버거', count: 12 },
      { menuName: '새우버거', count: 8 },
      { menuName: '감자튀김', count: 20 },
      { menuName: '콜라', count: 25 }
    ];

    const kioskStatus = 'online';

    res.render('admin/dashboard', {
      title: '대시보드',
      currentPage: 'dashboard',
      todayStatistics,
      pendingOrdersCount,
      recentOrders,
      salesChartData,
      popularMenuData,
      kioskStatus
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

// 주문 관리 페이지
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || '';

    // 임시 주문 데이터
    const orders = [
      {
        id: 1,
        totalPrice: 15000,
        status: 'RECEIVED',
        items: [
          { menuName: '불고기버거', quantity: 1, price: 8000 },
          { menuName: '감자튀김', quantity: 1, price: 3000 },
          { menuName: '콜라', quantity: 1, price: 2000 }
        ],
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        totalPrice: 23000,
        status: 'PREPARING',
        items: [
          { menuName: '치킨버거', quantity: 2, price: 18000 },
          { menuName: '콜라', quantity: 2, price: 4000 }
        ],
        createdAt: new Date(Date.now() - 300000).toISOString()
      }
    ];

    const totalOrders = orders.length;
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('admin/orders', {
      title: '주문 관리',
      currentPage: 'orders',
      orders,
      currentPage: page,
      totalPages,
      limit,
      status
    });
  } catch (error) {
    console.error('Orders page error:', error);
    res.status(500).render('error', { 
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

// 메뉴 관리 페이지
const getMenus = async (req, res) => {
  try {
    // 임시 메뉴 데이터
    const menus = [
      {
        id: 1,
        name: '불고기버거',
        description: '육즙 가득한 불고기 패티',
        price: 8000,
        categoryId: 1,
        categoryName: '버거',
        isAvailable: true,
        imageUrl: '/uploads/bulgogi-burger.jpg'
      },
      {
        id: 2,
        name: '치킨버거',
        description: '바삭한 치킨 패티',
        price: 9000,
        categoryId: 1,
        categoryName: '버거',
        isAvailable: true,
        imageUrl: '/uploads/chicken-burger.jpg'
      }
    ];

    const categories = [
      { id: 1, name: '버거' },
      { id: 2, name: '사이드' },
      { id: 3, name: '음료' }
    ];

    res.render('admin/menus', {
      title: '메뉴 관리',
      currentPage: 'menus',
      menus,
      categories
    });
  } catch (error) {
    console.error('Menus page error:', error);
    res.status(500).render('error', { 
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

// 로그인 페이지
const getLogin = (req, res) => {
  if (req.session?.adminId && sessions.has(req.session.adminId)) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { 
    title: '로그인',
    layout: false // 로그인 페이지는 별도 레이아웃 사용
  });
};

// 로그인 처리
const postLogin = (req, res) => {
  const { username, password } = req.body;
  
  // 임시 인증 (실제로는 데이터베이스 확인)
  if (username === 'admin' && password === 'admin123') {
    const sessionId = Date.now().toString();
    sessions.set(sessionId, { id: 1, username: 'admin' });
    req.session.adminId = sessionId;
    
    req.flash('success', '성공적으로 로그인되었습니다.');
    res.redirect('/admin');
  } else {
    req.flash('error', '아이디 또는 비밀번호가 올바르지 않습니다.');
    res.redirect('/admin/login');
  }
};

// 로그아웃 처리
const logout = (req, res) => {
  if (req.session?.adminId) {
    sessions.delete(req.session.adminId);
    req.session.destroy();
  }
  res.redirect('/admin/login');
};

module.exports = {
  requireAuth,
  getDashboard,
  getOrders,
  getMenus,
  getLogin,
  postLogin,
  logout
};
