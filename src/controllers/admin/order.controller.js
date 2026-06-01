// src/controllers/admin/order.controller.js
const Order = require("../../models/order.model.js");
const logger = require("../../utils/logger.js");

const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'COMPLETED', 'CANCELLED'];
const MAX_ORDER_LIST_LIMIT = 200;
const MAX_ORDER_LIST_OFFSET = 10000;

const parseOrderId = (value) => {
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
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

const parseDateRange = (query) => {
  const start = parseDateFilter(query.startDate);
  if (start.error) return { error: "시작 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)" };

  const end = parseDateFilter(query.endDate);
  if (end.error) return { error: "종료 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 형식 사용)" };

  if (start.value && end.value && start.value > end.value) {
    return { error: "종료 날짜는 시작 날짜보다 빠를 수 없습니다." };
  }

  return {
    startDate: start.value,
    endDate: end.value
  };
};

const parseOrderStatusFilter = (value) => {
  if (value === undefined || value === '') return { value: undefined };
  if (typeof value !== 'string') {
    return { error: "주문 상태 필터가 올바르지 않습니다." };
  }

  const status = value.trim().toUpperCase();
  if (!ORDER_STATUSES.includes(status)) {
    return { error: "주문 상태 필터가 올바르지 않습니다." };
  }

  return { value: status };
};

// 모든 주문 목록 조회 (관리자용)
exports.findAll = async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query);
    if (dateRange.error) {
      return res.status(400).json({
        success: false,
        message: dateRange.error
      });
    }

    const statusFilter = parseOrderStatusFilter(req.query.status);
    if (statusFilter.error) {
      return res.status(400).json({
        success: false,
        message: statusFilter.error
      });
    }

    const rawLimit = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = /^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null;
    const rawOffset = typeof req.query.offset === 'string' ? req.query.offset.trim() : '';
    const parsedOffset = /^(0|[1-9][0-9]*)$/.test(rawOffset) ? Number(rawOffset) : null;

    const filters = {
      status: statusFilter.value,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_ORDER_LIST_LIMIT) : 50, // 기본 50개
      offset: Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? Math.min(parsedOffset, MAX_ORDER_LIST_OFFSET) : 0
    };

    const orders = await Order.getAll(filters);
    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (err) {
    logger.logError(err, req, { context: 'Admin order list' });
    res.status(500).json({
      success: false,
      message: "주문 목록 조회 중 오류가 발생했습니다."
    });
  }
};

// 특정 주문 상세 조회
exports.findOne = async (req, res) => {
  const orderId = parseOrderId(req.params.orderId);

  if (orderId === null) {
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
    logger.logError(err, req, { context: 'Admin order detail' });
    res.status(500).json({
      success: false,
      message: "주문 조회 중 오류가 발생했습니다."
    });
  }
};

// 주문 상태 변경
exports.updateStatus = async (req, res) => {
  const orderId = parseOrderId(req.params.orderId);
  const { status } = req.body;

  if (orderId === null) {
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
        previousStatus: result.previousStatus,
        status: result.status
      });
    }

    res.json(result);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin order status update' });
    res.status(500).json({
      success: false,
      message: "주문 상태 변경 중 오류가 발생했습니다."
    });
  }
};

// 주문 취소
exports.cancel = async (req, res) => {
  const orderId = parseOrderId(req.params.orderId);

  if (orderId === null) {
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
        previousStatus: result.previousStatus,
        status: result.status
      });
    }

    res.json(result);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin order cancel' });
    res.status(500).json({
      success: false,
      message: "주문 취소 중 오류가 발생했습니다."
    });
  }
};
