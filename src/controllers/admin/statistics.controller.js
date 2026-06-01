// src/controllers/admin/statistics.controller.js
const Statistics = require("../../models/statistics.model.js");
const logger = require("../../utils/logger.js");

const DATE_MESSAGES = {
  startDate: "시작 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)",
  endDate: "종료 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)"
};

const parseDateParam = (value, message) => {
  if (value === undefined || value === '') {
    return { value: null };
  }
  if (typeof value !== 'string') {
    return { error: message };
  }

  const text = value.trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) {
    return { error: message };
  }

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { error: message };
  }

  return { value: text };
};

const normalizeDateRange = (query) => {
  const start = parseDateParam(query.startDate, DATE_MESSAGES.startDate);
  if (start.error) return { error: start.error };

  const end = parseDateParam(query.endDate, DATE_MESSAGES.endDate);
  if (end.error) return { error: end.error };

  if (start.value && end.value && start.value > end.value) {
    return { error: "종료 날짜는 시작 날짜보다 빠를 수 없습니다." };
  }

  return {
    startDate: start.value,
    endDate: end.value
  };
};

const sendDateRangeError = (res, message) => res.status(400).json({
  success: false,
  message
});

// 종합 대시보드 통계 조회
const getDashboard = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    
    const dashboardStats = await Statistics.getDashboardStats(startDate, endDate);
    
    res.json({
      success: true,
      data: dashboardStats
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin statistics dashboard' });
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다."
    });
  }
};

// 매출 통계 조회
const getSalesStatistics = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    
    const salesStats = await Statistics.getSalesStatistics(startDate, endDate);
    
    res.json({
      success: true,
      data: {
        ...salesStats,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin sales statistics' });
    res.status(500).json({
      success: false,
      message: "매출 통계 조회 중 오류가 발생했습니다."
    });
  }
};

// 인기 메뉴 순위 조회
const getTopSellingMenus = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    const rawLimit = req.query.limit === undefined
      ? '10'
      : (typeof req.query.limit === 'string' ? req.query.limit.trim() : '');
    const limitNum = /^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null;
    
    if (!Number.isSafeInteger(limitNum) || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: "조회 개수는 1-100 사이의 숫자여야 합니다."
      });
    }
    
    const topMenus = await Statistics.getTopSellingMenus(limitNum, startDate, endDate);
    
    res.json({
      success: true,
      data: {
        menus: topMenus,
        count: topMenus.length,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin top selling menus' });
    res.status(500).json({
      success: false,
      message: "인기 메뉴 조회 중 오류가 발생했습니다."
    });
  }
};

// 일별 매출 현황 조회
const getDailySales = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    
    const dailySales = await Statistics.getDailySales(startDate, endDate);
    
    res.json({
      success: true,
      data: {
        sales: dailySales,
        count: dailySales.length,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin daily sales' });
    res.status(500).json({
      success: false,
      message: "일별 매출 조회 중 오류가 발생했습니다."
    });
  }
};

// 시간대별 주문 분석 조회
const getHourlyAnalysis = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    
    const hourlyData = await Statistics.getHourlyOrderAnalysis(startDate, endDate);
    
    res.json({
      success: true,
      data: {
        hourlyStats: hourlyData,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin hourly analysis' });
    res.status(500).json({
      success: false,
      message: "시간대별 분석 조회 중 오류가 발생했습니다."
    });
  }
};

// 카테고리별 매출 분석 조회
const getCategoryAnalysis = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    
    const categoryStats = await Statistics.getCategorySales(startDate, endDate);
    
    res.json({
      success: true,
      data: {
        categories: categoryStats,
        count: categoryStats.length,
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin category analysis' });
    res.status(500).json({
      success: false,
      message: "카테고리별 분석 조회 중 오류가 발생했습니다."
    });
  }
};

// 매출 리포트 생성 (CSV 형태)
const generateSalesReport = async (req, res) => {
  try {
    const dateRange = normalizeDateRange(req.query);
    if (dateRange.error) return sendDateRangeError(res, dateRange.error);
    const { startDate, endDate } = dateRange;
    const { format = 'json' } = req.query;
    
    if (format === 'csv') {
      const [overview, topSellingMenus, categoryStats] = await Promise.all([
        Statistics.getSalesStatistics(startDate, endDate),
        Statistics.getTopSellingMenus(5, startDate, endDate),
        Statistics.getCategorySales(startDate, endDate)
      ]);
      // CSV 형태로 응답
      const csvData = generateCSVReport({
        overview,
        topSellingMenus,
        categoryStats
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
      const dashboardStats = await Statistics.getDashboardStats(startDate, endDate);
      // JSON 형태로 응답
      res.json({
        success: true,
        data: {
          report: dashboardStats,
          reportType: 'comprehensive',
          generatedAt: new Date().toISOString()
        }
      });
    }
    
  } catch (err) {
    logger.logError(err, req, { context: 'Admin sales report' });
    res.status(500).json({
      success: false,
      message: "매출 리포트 생성 중 오류가 발생했습니다."
    });
  }
};

const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

const escapeCsvValue = (value) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const formulaSafeValue = CSV_FORMULA_PREFIX_PATTERN.test(stringValue)
    ? `'${stringValue}`
    : stringValue;

  if (/[",\r\n]/.test(formulaSafeValue)) {
    return `"${formulaSafeValue.replace(/"/g, '""')}"`;
  }

  return formulaSafeValue;
};

const csvRow = (values) => `${values.map(escapeCsvValue).join(',')}\n`;

// CSV 리포트 생성 헬퍼 함수
function generateCSVReport(data) {
  let csv = '';
  
  // 매출 개요
  csv += csvRow(['매출 개요']);
  csv += csvRow(['항목', '값']);
  csv += csvRow(['총 주문 수', data.overview.total_orders]);
  csv += csvRow(['총 매출', data.overview.total_sales]);
  csv += csvRow(['평균 주문액', data.overview.average_order_value]);
  csv += csvRow(['완료된 주문', data.overview.completed_orders]);
  csv += csvRow(['취소된 주문', data.overview.cancelled_orders]);
  csv += '\n';
  
  // 인기 메뉴
  csv += csvRow(['인기 메뉴 TOP 5']);
  csv += csvRow(['순위', '메뉴명', '카테고리', '판매량', '매출']);
  data.topSellingMenus.forEach((menu, index) => {
    csv += csvRow([
      index + 1,
      menu.menu_name,
      menu.category_name || '미분류',
      menu.total_quantity,
      menu.total_revenue
    ]);
  });
  
  csv += '\n';
  
  // 카테고리별 매출
  csv += csvRow(['카테고리별 매출']);
  csv += csvRow(['카테고리', '주문수', '총 판매량', '매출']);
  data.categoryStats.forEach(category => {
    csv += csvRow([
      category.category_name,
      category.order_count,
      category.total_quantity,
      category.category_revenue
    ]);
  });
  
  return csv;
}

module.exports = {
  getDashboard,
  getSalesStatistics,
  getTopSellingMenus,
  getDailySales,
  getHourlyAnalysis,
  getCategoryAnalysis,
  generateSalesReport
};
