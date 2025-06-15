// src/models/statistics.model.js
const sql = require('./db.js');

// Statistics Model
const Statistics = function() {};

// 기본 매출 통계 조회
Statistics.getSalesStatistics = async (startDate, endDate) => {
  const connection = await sql.getConnection();
  try {
    let query = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_sales,
        COALESCE(AVG(o.total_price), 0) as average_order_value,
        COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN o.status = 'RECEIVED' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN o.status = 'PREPARING' THEN 1 END) as preparing_orders
      FROM Orders o
    `;
    
    const params = [];
    const conditions = [];
    
    if (startDate) {
      conditions.push("o.created_at >= ?");
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push("o.created_at <= ?");
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    const [results] = await connection.execute(query, params);
    return results[0];
    
  } catch (err) {
    console.error("매출 통계 조회 오류:", err);
    throw new Error("매출 통계 조회 중 오류가 발생했습니다.");
  } finally {
    connection.release();
  }
};

// 인기 메뉴 순위 (Top N)
Statistics.getTopSellingMenus = async (limit = 10, startDate, endDate) => {
  const connection = await sql.getConnection();
  try {
    let query = `
      SELECT 
        m.id as menu_id,
        m.name as menu_name,
        c.name as category_name,
        SUM(oi.quantity) as total_quantity,
        COUNT(DISTINCT oi.order_id) as order_count,
        COALESCE(SUM(oi.quantity * oi.price_per_item), 0) as total_revenue,
        COALESCE(AVG(oi.price_per_item), 0) as average_price
      FROM OrderItems oi
      JOIN Menus m ON oi.menu_id = m.id
      LEFT JOIN Categories c ON m.category_id = c.id
      JOIN Orders o ON oi.order_id = o.id
    `;
    
    const params = [];
    const conditions = ["o.status != 'CANCELLED'"]; // 취소된 주문은 제외
    
    if (startDate) {
      conditions.push("o.created_at >= ?");
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push("o.created_at <= ?");
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += `
      GROUP BY m.id, m.name, c.name
      ORDER BY total_quantity DESC
      LIMIT ?
    `;
    
    params.push(parseInt(limit));
    
    const [results] = await connection.execute(query, params);
    return results;
    
  } catch (err) {
    console.error("인기 메뉴 조회 오류:", err);
    throw new Error("인기 메뉴 조회 중 오류가 발생했습니다.");
  } finally {
    connection.release();
  }
};

// 일별 매출 현황
Statistics.getDailySales = async (startDate, endDate) => {
  const connection = await sql.getConnection();
  try {
    let query = `
      SELECT 
        DATE(o.created_at) as sale_date,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.total_price), 0) as daily_sales,
        COUNT(CASE WHEN o.status = 'COMPLETED' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END) as cancelled_orders
      FROM Orders o
    `;
    
    const params = [];
    const conditions = [];
    
    if (startDate) {
      conditions.push("o.created_at >= ?");
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push("o.created_at <= ?");
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += `
      GROUP BY DATE(o.created_at)
      ORDER BY sale_date DESC
    `;
    
    const [results] = await connection.execute(query, params);
    return results;
    
  } catch (err) {
    console.error("일별 매출 조회 오류:", err);
    throw new Error("일별 매출 조회 중 오류가 발생했습니다.");
  } finally {
    connection.release();
  }
};

// 시간대별 주문 분석
Statistics.getHourlyOrderAnalysis = async (startDate, endDate) => {
  const connection = await sql.getConnection();
  try {
    let query = `
      SELECT 
        HOUR(o.created_at) as order_hour,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.total_price), 0) as hourly_sales,
        COALESCE(AVG(o.total_price), 0) as average_order_value
      FROM Orders o
    `;
    
    const params = [];
    const conditions = ["o.status != 'CANCELLED'"]; // 취소된 주문은 제외
    
    if (startDate) {
      conditions.push("o.created_at >= ?");
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push("o.created_at <= ?");
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += `
      GROUP BY HOUR(o.created_at)
      ORDER BY order_hour ASC
    `;
    
    const [results] = await connection.execute(query, params);
    return results;
    
  } catch (err) {
    console.error("시간대별 주문 분석 오류:", err);
    throw new Error("시간대별 주문 분석 중 오류가 발생했습니다.");
  } finally {
    connection.release();
  }
};

// 카테고리별 매출 분석
Statistics.getCategorySales = async (startDate, endDate) => {
  const connection = await sql.getConnection();
  try {
    let query = `
      SELECT 
        c.id as category_id,
        c.name as category_name,
        COUNT(DISTINCT oi.order_id) as order_count,
        SUM(oi.quantity) as total_quantity,
        COALESCE(SUM(oi.quantity * oi.price_per_item), 0) as category_revenue,
        COUNT(DISTINCT m.id) as menu_count
      FROM Categories c
      LEFT JOIN Menus m ON c.id = m.category_id
      LEFT JOIN OrderItems oi ON m.id = oi.menu_id
      LEFT JOIN Orders o ON oi.order_id = o.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (startDate || endDate) {
      conditions.push("(o.id IS NULL OR o.status != 'CANCELLED')");
    }
    
    if (startDate) {
      conditions.push("(o.id IS NULL OR o.created_at >= ?)");
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push("(o.id IS NULL OR o.created_at <= ?)");
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += `
      GROUP BY c.id, c.name
      ORDER BY category_revenue DESC
    `;
    
    const [results] = await connection.execute(query, params);
    return results;
    
  } catch (err) {
    console.error("카테고리별 매출 분석 오류:", err);
    throw new Error("카테고리별 매출 분석 중 오류가 발생했습니다.");
  } finally {
    connection.release();
  }
};

// 종합 대시보드 통계
Statistics.getDashboardStats = async (startDate, endDate) => {
  try {
    const [salesStats, topMenus, dailySales, hourlyAnalysis, categoryStats] = await Promise.all([
      Statistics.getSalesStatistics(startDate, endDate),
      Statistics.getTopSellingMenus(5, startDate, endDate),
      Statistics.getDailySales(startDate, endDate),
      Statistics.getHourlyOrderAnalysis(startDate, endDate),
      Statistics.getCategorySales(startDate, endDate)
    ]);
    
    return {
      overview: salesStats,
      topSellingMenus: topMenus,
      dailySales: dailySales.slice(0, 7), // 최근 7일
      hourlyAnalysis: hourlyAnalysis,
      categoryStats: categoryStats,
      generatedAt: new Date().toISOString(),
      period: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    };
    
  } catch (err) {
    console.error("대시보드 통계 조회 오류:", err);
    throw new Error("대시보드 통계 조회 중 오류가 발생했습니다.");
  }
};

module.exports = Statistics;
