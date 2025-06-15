// src/controllers/admin/order.controller.js
const Order = require("../../models/order.model.js");

// 모든 주문 목록 조회 (관리자용)
exports.findAll = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit) : 50, // 기본 50개
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    // 빈 값 제거
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === '') {
        delete filters[key];
      }
    });

    const orders = await Order.getAll(filters);
    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (err) {
    console.error('관리자 주문 목록 조회 오류:', err);
    res.status(500).json({ 
      success: false,
      message: "주문 목록 조회 중 오류가 발생했습니다." 
    });
  }
};

// 특정 주문 상세 조회
exports.findOne = async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  
  if (isNaN(orderId)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 주문 ID입니다."
    });
  }

  try {
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "주문을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error('주문 상세 조회 오류:', err);
    res.status(500).json({
      success: false,
      message: "주문 조회 중 오류가 발생했습니다."
    });
  }
};

// 주문 상태 변경
exports.updateStatus = async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const { status } = req.body;

  if (isNaN(orderId)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 주문 ID입니다."
    });
  }

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "변경할 상태를 입력해주세요."
    });
  }

  try {
    const result = await Order.updateStatus(orderId, status);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Socket.IO를 통한 실시간 상태 업데이트 알림
    const io = req.app.get('io');
    if (io) {
      io.emit('order_status_updated', {
        orderId: result.orderId,
        status: result.status,
        previousStatus: result.previousStatus || null
      });
    }

    res.json(result);
  } catch (err) {
    console.error('주문 상태 변경 오류:', err);
    res.status(500).json({
      success: false,
      message: "주문 상태 변경 중 오류가 발생했습니다."
    });
  }
};

// 주문 취소
exports.cancel = async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  if (isNaN(orderId)) {
    return res.status(400).json({
      success: false,
      message: "유효하지 않은 주문 ID입니다."
    });
  }

  try {
    const result = await Order.cancel(orderId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Socket.IO를 통한 실시간 취소 알림
    const io = req.app.get('io');
    if (io) {
      io.emit('order_cancelled', {
        orderId: result.orderId,
        status: result.status,
        message: result.message
      });
    }

    res.json(result);
  } catch (err) {
    console.error('주문 취소 오류:', err);
    res.status(500).json({
      success: false,
      message: "주문 취소 중 오류가 발생했습니다."
    });
  }
};
