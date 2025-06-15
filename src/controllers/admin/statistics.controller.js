// src/controllers/admin/statistics.controller.js
const Statistics = require("../../models/statistics.model.js");

// 종합 대시보드 통계 조회
exports.getDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // 날짜 유효성 검증
    if (startDate && isNaN(Date.parse(startDate))) {
      return res.status(400).json({
        success: false,
        message: "시작 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)"
      });
    }
    
    if (endDate && isNaN(Date.parse(endDate))) {
      return res.status(400).json({
        success: false,
        message: "종료 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)"
      });
    }
    
    const dashboardStats = await Statistics.getDashboardStats(startDate, endDate);
    
    res.json({
      success: true,
      data: dashboardStats
    });
    
  } catch (err) {
    console.error('대시보드 통계 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "대시보드 통계 조회 중 오류가 발생했습니다."
    });
  }
};

// 매출 통계 조회
exports.getSalesStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
    console.error('매출 통계 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "매출 통계 조회 중 오류가 발생했습니다."
    });
  }
};

// 인기 메뉴 순위 조회
exports.getTopSellingMenus = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
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
    console.error('인기 메뉴 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "인기 메뉴 조회 중 오류가 발생했습니다."
    });
  }
};

// 일별 매출 현황 조회
exports.getDailySales = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
    console.error('일별 매출 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "일별 매출 조회 중 오류가 발생했습니다."
    });
  }
};

// 시간대별 주문 분석 조회
exports.getHourlyAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
    console.error('시간대별 분석 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "시간대별 분석 조회 중 오류가 발생했습니다."
    });
  }
};

// 카테고리별 매출 분석 조회
exports.getCategoryAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
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
    console.error('카테고리별 분석 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "카테고리별 분석 조회 중 오류가 발생했습니다."
    });
  }
};

// 매출 리포트 생성 (CSV 형태)
exports.generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const dashboardStats = await Statistics.getDashboardStats(startDate, endDate);
    
    if (format === 'csv') {
      // CSV 형태로 응답
      const csvData = generateCSVReport(dashboardStats);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales_report_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } else {
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
    console.error('매출 리포트 생성 오류:', err);
    res.status(500).json({
      success: false,
      message: "매출 리포트 생성 중 오류가 발생했습니다."
    });
  }
};

// CSV 리포트 생성 헬퍼 함수
function generateCSVReport(data) {
  let csv = '';
  
  // 매출 개요
  csv += '=== 매출 개요 ===\n';
  csv += '항목,값\n';
  csv += `총 주문 수,${data.overview.total_orders}\n`;
  csv += `총 매출,${data.overview.total_sales}\n`;
  csv += `평균 주문액,${data.overview.average_order_value}\n`;
  csv += `완료된 주문,${data.overview.completed_orders}\n`;
  csv += `취소된 주문,${data.overview.cancelled_orders}\n\n`;
  
  // 인기 메뉴
  csv += '=== 인기 메뉴 TOP 5 ===\n';
  csv += '순위,메뉴명,카테고리,판매량,매출\n';
  data.topSellingMenus.forEach((menu, index) => {
    csv += `${index + 1},${menu.menu_name},${menu.category_name || '미분류'},${menu.total_quantity},${menu.total_revenue}\n`;
  });
  
  csv += '\n';
  
  // 카테고리별 매출
  csv += '=== 카테고리별 매출 ===\n';
  csv += '카테고리,주문수,총 판매량,매출\n';
  data.categoryStats.forEach(category => {
    csv += `${category.category_name},${category.order_count || 0},${category.total_quantity || 0},${category.category_revenue || 0}\n`;
  });
  
  return csv;
}

module.exports = {
  getDashboard: exports.getDashboard,
  getSalesStatistics: exports.getSalesStatistics,
  getTopSellingMenus: exports.getTopSellingMenus,
  getDailySales: exports.getDailySales,
  getHourlyAnalysis: exports.getHourlyAnalysis,
  getCategoryAnalysis: exports.getCategoryAnalysis,
  generateSalesReport: exports.generateSalesReport
};
