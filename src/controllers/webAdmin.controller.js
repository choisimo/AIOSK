const bcrypt = require('bcrypt');
const Admin = require('../models/admin.model');
const Category = require('../models/category.model');
const Menu = require('../models/menu.model');
const Order = require('../models/order.model');
const Statistics = require('../models/statistics.model');
const KioskStatus = require('../models/kioskStatus.model');
const logger = require('../utils/logger');

const MENU_STATUSES = ['FOR_SALE', 'SOLD_OUT'];
const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
const MAX_ORDER_LIST_LIMIT = 200;
const MAX_ORDER_LIST_OFFSET = 10000;
const INVALID_FORM_VALUE = Symbol('invalid_form_value');

const parseId = (value) => {
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const id = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(id) ? id : null;
};

const parseSortOrder = (value) => {
  if (value === undefined || value === '') return 0;
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const order = /^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(order) ? order : null;
};

const parseDateFilter = (value) => {
  if (value === undefined || value === '') return { value: null };
  if (typeof value !== 'string') return { value: null, error: true };

  const text = value.trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) return { value: null, error: true };

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { value: null, error: true };
  }

  return { value: text };
};

const parseDateRange = (query, startKey, endKey) => {
  const start = parseDateFilter(query[startKey]);
  if (start.error) return { error: '시작 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)' };

  const end = parseDateFilter(query[endKey]);
  if (end.error) return { error: '종료 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)' };

  if (start.value && end.value && start.value > end.value) {
    return { error: '종료 날짜는 시작 날짜보다 빠를 수 없습니다.' };
  }

  return {
    startDate: start.value,
    endDate: end.value
  };
};

const parseOrderStatusFilter = (value) => {
  if (value === undefined || value === '') return { value: '' };
  if (typeof value !== 'string') {
    return { error: '주문 상태 필터가 올바르지 않습니다.' };
  }

  const status = value.trim().toUpperCase();
  if (!ORDER_STATUSES.includes(status)) {
    return { error: '주문 상태 필터가 올바르지 않습니다.' };
  }

  return { value: status };
};

const getRequestBody = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
const normalizeRequiredFormText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
};
const normalizeOptionalFormText = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return INVALID_FORM_VALUE;
  const text = value.trim();
  return text || null;
};

const formatOrder = (order) => {
  const parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  const items = parsedItems.map(item => {
    const pricePerItem = item.pricePerItem ?? item.price_per_item;

    return {
      menuName: item.menuName ?? item.menu_name ?? '삭제된 메뉴',
      quantity: item.quantity,
      price: Number(pricePerItem * item.quantity)
    };
  });

  return {
    id: order.id,
    totalPrice: Number(order.total_price),
    status: order.status,
    createdAt: order.created_at,
    items
  };
};

const toDateString = (date) => date.toISOString().slice(0, 10);

// 관리자 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session?.admin) {
    req.flash('error', '로그인이 필요합니다.');
    return res.redirect('/admin/login');
  }

  req.admin = req.session.admin;
  next();
};

// 대시보드 페이지
const getDashboard = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const startDate = toDateString(start);
    const endDate = toDateString(end);
    const [todayStats, dailySales, topSellingMenus, recentOrderRows, kioskStatusSummary] = await Promise.all([
      Statistics.getSalesStatistics(startDate, endDate),
      Statistics.getDailySales(),
      Statistics.getTopSellingMenus(5),
      Order.getAll({ limit: 5 }),
      KioskStatus.getSummary()
    ]);

    const todayStatistics = {
      totalSales: Number(todayStats.total_sales),
      orderCount: Number(todayStats.total_orders),
      averageOrderValue: Number(todayStats.average_order_value)
    };

    const pendingOrdersCount = Number(todayStats.pending_orders);
    const recentOrders = recentOrderRows.map(formatOrder);
    const salesChartData = dailySales
      .slice(0, 7)
      .slice()
      .reverse()
      .map(day => ({
        date: day.sale_date ? toDateString(new Date(day.sale_date)).slice(5) : '-',
        sales: Number(day.daily_sales)
      }));
    const popularMenuData = topSellingMenus.map(menu => ({
      menuName: menu.menu_name,
      count: Number(menu.total_quantity)
    }));

    res.render('admin/dashboard', {
      title: '대시보드',
      currentPage: 'dashboard',
      todayStatistics,
      pendingOrdersCount,
      recentOrders,
      salesChartData,
      popularMenuData,
      kioskStatusSummary
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin dashboard' });
    res.status(500).render('error', {
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

// 주문 관리 페이지
const getOrders = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query, 'dateFrom', 'dateTo');
    if (dateRange.error) {
      req.flash('error', dateRange.error);
      return res.redirect('/admin/orders');
    }

    const statusFilter = parseOrderStatusFilter(req.query.status);
    if (statusFilter.error) {
      req.flash('error', statusFilter.error);
      return res.redirect('/admin/orders');
    }

    const rawPage = typeof req.query.page === 'string' ? req.query.page.trim() : '';
    const parsedPage = /^[1-9][0-9]*$/.test(rawPage) ? Number(rawPage) : null;
    const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const rawLimit = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = /^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null;
    const limit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_ORDER_LIST_LIMIT) : 20;
    const status = statusFilter.value;
    const offset = Math.min((page - 1) * limit, MAX_ORDER_LIST_OFFSET);

    const orderRows = await Order.getAll({
      status,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit,
      offset
    });
    const orders = orderRows.map(formatOrder);

    res.render('admin/orders', {
      title: '주문 관리',
      currentPage: 'orders',
      orders,
      status,
      dateFrom: dateRange.startDate || '',
      dateTo: dateRange.endDate || ''
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin orders page' });
    res.status(500).render('error', {
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

// 메뉴 관리 페이지
const getMenus = async (req, res) => {
  try {
    const [menuRows, categories] = await Promise.all([
      Menu.getAll({}),
      Category.getAll()
    ]);
    const menus = menuRows.map(menu => ({
      id: menu.id,
      name: menu.name,
      description: menu.description || '',
      price: Number(menu.price),
      categoryId: menu.category_id,
      categoryName: menu.category_name || '미분류',
      status: menu.status,
      imageUrl: menu.image_url || ''
    }));

    res.render('admin/menus', {
      title: '메뉴 관리',
      currentPage: 'menus',
      menus,
      categories
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin menus page' });
    res.status(500).render('error', {
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

const getCategories = async (req, res) => {
  try {
    const [categories, menus] = await Promise.all([
      Category.getAll(),
      Menu.getAll({})
    ]);
    const menuCountByCategory = menus.reduce((acc, menu) => {
      if (menu.category_id === null || menu.category_id === undefined) {
        return acc;
      }
      acc[menu.category_id] = (acc[menu.category_id] || 0) + 1;
      return acc;
    }, {});

    res.render('admin/categories', {
      title: '카테고리 관리',
      currentPage: 'categories',
      categories: categories.map(category => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sort_order,
        createdAt: category.created_at,
        menuCount: menuCountByCategory[category.id] || 0
      }))
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin categories page' });
    res.status(500).render('error', {
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

const getStatistics = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query, 'startDate', 'endDate');
    if (dateRange.error) {
      req.flash('error', dateRange.error);
      return res.redirect('/admin/statistics');
    }
    const { startDate, endDate } = dateRange;

    const [overview, topSellingMenus, dailySales, categoryStats] = await Promise.all([
      Statistics.getSalesStatistics(startDate, endDate),
      Statistics.getTopSellingMenus(5, startDate, endDate),
      Statistics.getDailySales(startDate, endDate),
      Statistics.getCategorySales(startDate, endDate)
    ]);

    const statisticsOverview = {
      total_sales: Number(overview.total_sales),
      total_orders: Number(overview.total_orders),
      average_order_value: Number(overview.average_order_value),
      pending_orders: Number(overview.pending_orders),
      preparing_orders: Number(overview.preparing_orders)
    };
    const statisticsDailySales = dailySales.slice(0, 7).map(day => ({
      sale_date: day.sale_date,
      daily_sales: Number(day.daily_sales)
    }));
    const statisticsTopSellingMenus = topSellingMenus.map(menu => ({
      menu_name: menu.menu_name,
      total_quantity: Number(menu.total_quantity)
    }));
    const statisticsCategoryStats = categoryStats.map(category => ({
      category_name: category.category_name,
      order_count: Number(category.order_count),
      total_quantity: Number(category.total_quantity),
      category_revenue: Number(category.category_revenue)
    }));

    res.render('admin/statistics', {
      title: '통계 및 리포트',
      currentPage: 'statistics',
      overview: statisticsOverview,
      dailySales: statisticsDailySales,
      topSellingMenus: statisticsTopSellingMenus,
      categoryStats: statisticsCategoryStats,
      startDate: startDate || '',
      endDate: endDate || ''
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin statistics page' });
    res.status(500).render('error', {
      title: 'Error',
      error: { message: 'Internal Server Error' }
    });
  }
};

const postCategoryCreate = async (req, res) => {
  try {
    const body = getRequestBody(req);
    const name = normalizeRequiredFormText(body.name);
    const sortOrder = parseSortOrder(body.sortOrder ?? body.sort_order);
    if (!name || sortOrder === null) {
      req.flash('error', '카테고리명과 0 이상의 정렬 순서가 필요합니다.');
      return res.redirect('/admin/categories');
    }

    await Category.create({
      name,
      sort_order: sortOrder
    });
    req.flash('success', '카테고리가 생성되었습니다.');
    res.redirect('/admin/categories');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin category create' });
    req.flash('error', '카테고리 생성 중 오류가 발생했습니다.');
    res.redirect('/admin/categories');
  }
};

const postCategoryUpdate = async (req, res) => {
  try {
    const body = getRequestBody(req);
    const id = parseId(req.params.categoryId);
    const name = normalizeRequiredFormText(body.name);
    const sortOrder = parseSortOrder(body.sortOrder ?? body.sort_order);
    if (!id || !name || sortOrder === null) {
      req.flash('error', '유효한 카테고리 ID, 이름, 0 이상의 정렬 순서가 필요합니다.');
      return res.redirect('/admin/categories');
    }

    const result = await Category.updateById(id, {
      name,
      sort_order: sortOrder
    });

    req.flash(result ? 'success' : 'error', result ? '카테고리가 수정되었습니다.' : '카테고리를 찾을 수 없습니다.');
    res.redirect('/admin/categories');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin category update' });
    req.flash('error', '카테고리 수정 중 오류가 발생했습니다.');
    res.redirect('/admin/categories');
  }
};

const postCategoryDelete = async (req, res) => {
  try {
    const id = parseId(req.params.categoryId);
    if (!id) {
      req.flash('error', '유효한 카테고리 ID가 필요합니다.');
      return res.redirect('/admin/categories');
    }

    const result = await Category.remove(id);
    req.flash(result ? 'success' : 'error', result ? '카테고리가 삭제되었습니다.' : '카테고리를 찾을 수 없습니다.');
    res.redirect('/admin/categories');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin category delete' });
    req.flash('error', '카테고리 삭제 중 오류가 발생했습니다.');
    res.redirect('/admin/categories');
  }
};

const getMenuPayload = (body) => {
  const categoryId = parseId(body.categoryId ?? body.category_id);
  const name = normalizeRequiredFormText(body.name);
  const priceText = typeof body.price === 'number'
    ? String(body.price)
    : (typeof body.price === 'string' ? body.price.trim() : '');
  const matchedPrice = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(priceText) ? Number(priceText) : null;
  const price = Number.isFinite(matchedPrice) ? matchedPrice : null;
  const statusValue = body.status;
  let status = 'FOR_SALE';
  if (statusValue !== undefined && statusValue !== '') {
    status = typeof statusValue === 'string' ? statusValue.trim() : null;
  }
  const imageUrl = normalizeOptionalFormText(body.imageUrl ?? body.image_url);
  const description = normalizeOptionalFormText(body.description);

  if (
    !categoryId ||
    !name ||
    price === null ||
    !MENU_STATUSES.includes(status) ||
    imageUrl === INVALID_FORM_VALUE ||
    description === INVALID_FORM_VALUE
  ) {
    return null;
  }

  return {
    category_id: categoryId,
    name,
    price,
    image_url: imageUrl,
    description,
    status
  };
};

const postMenuCreate = async (req, res) => {
  try {
    const payload = getMenuPayload(getRequestBody(req));
    if (!payload) {
      req.flash('error', '메뉴명, 카테고리, 0 이상의 가격, 유효한 상태가 필요합니다.');
      return res.redirect('/admin/menus');
    }

    await Menu.create(payload);
    req.flash('success', '메뉴가 생성되었습니다.');
    res.redirect('/admin/menus');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin menu create' });
    req.flash('error', '메뉴 생성 중 오류가 발생했습니다.');
    res.redirect('/admin/menus');
  }
};

const postMenuUpdate = async (req, res) => {
  try {
    const id = parseId(req.params.menuId);
    const payload = getMenuPayload(getRequestBody(req));
    if (!id || !payload) {
      req.flash('error', '유효한 메뉴 ID와 메뉴 정보가 필요합니다.');
      return res.redirect('/admin/menus');
    }

    const result = await Menu.updateById(id, payload);
    req.flash(result ? 'success' : 'error', result ? '메뉴가 수정되었습니다.' : '메뉴를 찾을 수 없습니다.');
    res.redirect('/admin/menus');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin menu update' });
    req.flash('error', '메뉴 수정 중 오류가 발생했습니다.');
    res.redirect('/admin/menus');
  }
};

const postMenuDelete = async (req, res) => {
  try {
    const id = parseId(req.params.menuId);
    if (!id) {
      req.flash('error', '유효한 메뉴 ID가 필요합니다.');
      return res.redirect('/admin/menus');
    }

    const result = await Menu.remove(id);
    req.flash(result ? 'success' : 'error', result ? '메뉴가 삭제되었습니다.' : '메뉴를 찾을 수 없습니다.');
    res.redirect('/admin/menus');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin menu delete' });
    req.flash('error', '메뉴 삭제 중 오류가 발생했습니다.');
    res.redirect('/admin/menus');
  }
};

// 로그인 페이지
const getLogin = (req, res) => {
  if (req.session?.admin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    title: '로그인',
    layout: false // 로그인 페이지는 별도 레이아웃 사용
  });
};

// 로그인 처리
const postLogin = async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    logger.logWarning('Web admin login failed', {
      context: 'Web admin login',
      reason: 'missing_credentials',
      username: username.slice(0, 100),
      ip: req.ip,
      requestId: req.id
    });
    req.flash('error', '아이디 또는 비밀번호가 올바르지 않습니다.');
    return res.redirect('/admin/login');
  }

  try {
    const admin = await Admin.findByUsername(username);
    const passwordMatches = admin ? await bcrypt.compare(password, admin.password) : false;

    if (!admin || !passwordMatches) {
      logger.logWarning('Web admin login failed', {
        context: 'Web admin login',
        reason: 'invalid_credentials',
        username: username.slice(0, 100),
        ip: req.ip,
        requestId: req.id
      });
      req.flash('error', '아이디 또는 비밀번호가 올바르지 않습니다.');
      return res.redirect('/admin/login');
    }

    req.session.admin = { id: admin.id, username: admin.username };
    req.flash('success', '성공적으로 로그인되었습니다.');
    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    res.redirect('/admin');
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin login' });
    req.flash('error', '로그인 처리 중 오류가 발생했습니다.');
    res.redirect('/admin/login');
  }
};

// 로그아웃 처리
const logout = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      logger.logError(error, req, { context: 'Web admin logout' });
    }

    res.redirect('/admin/login');
  });
};

const getOrderJson = async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (orderId === null) {
    return res.status(400).json({ success: false, message: '유효하지 않은 주문 ID입니다.' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: formatOrder(order) });
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin order detail JSON' });
    res.status(500).json({ success: false, message: '주문 조회 중 오류가 발생했습니다.' });
  }
};

const postOrderStatus = async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (orderId === null) {
    return res.status(400).json({ success: false, message: '유효하지 않은 주문 ID입니다.' });
  }

  try {
    const result = await Order.updateStatus(orderId, req.body.status);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin order status update' });
    res.status(500).json({ success: false, message: '주문 상태 변경 중 오류가 발생했습니다.' });
  }
};

const postOrderCancel = async (req, res) => {
  const orderId = parseId(req.params.orderId);
  if (orderId === null) {
    return res.status(400).json({ success: false, message: '유효하지 않은 주문 ID입니다.' });
  }

  try {
    const result = await Order.cancel(orderId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.logError(error, req, { context: 'Web admin order cancel' });
    res.status(500).json({ success: false, message: '주문 취소 중 오류가 발생했습니다.' });
  }
};

module.exports = {
  requireAuth,
  getDashboard,
  getOrders,
  getMenus,
  getCategories,
  getStatistics,
  postCategoryCreate,
  postCategoryUpdate,
  postCategoryDelete,
  postMenuCreate,
  postMenuUpdate,
  postMenuDelete,
  getLogin,
  postLogin,
  logout,
  getOrderJson,
  postOrderStatus,
  postOrderCancel
};
