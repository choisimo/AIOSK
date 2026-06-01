// src/controllers/public/order.controller.js
const Order = require("../../models/order.model.js");
const { AppError } = require("../../middleware/error.middleware.js");
const logger = require("../../utils/logger");

const MAX_ORDER_ITEMS = 100;
const MAX_ORDER_ITEM_QUANTITY = 99;

const parseNonNegativeAmount = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
  if (parsed !== null && Number.isFinite(parsed)) {
    return parsed;
  }

  throw new Error('Invalid order amount from database.');
};

// 공개 주문 생성 (인증 불필요)
exports.create = async (req, res, next) => {
  try {
    // 요청 데이터 검증
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      throw new AppError("주문 항목이 필요합니다. 'items' 배열에 최소 하나의 항목을 포함해야 합니다.", 400);
    }
    if (req.body.items.length > MAX_ORDER_ITEMS) {
      throw new AppError(`주문 항목은 최대 ${MAX_ORDER_ITEMS}개까지 허용됩니다.`, 400);
    }

    for (const item of req.body.items) {
      if (item.menuId === undefined || item.quantity === undefined) {
        throw new AppError("각 주문 항목에는 menuId와 quantity가 필요합니다.", 400);
      }

      if (!Number.isSafeInteger(item.menuId) || item.menuId <= 0) {
        throw new AppError(`유효하지 않은 메뉴 ID입니다: ${item.menuId}. 양의 정수여야 합니다.`, 400);
      }

      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_ORDER_ITEM_QUANTITY) {
        throw new AppError(`유효하지 않은 수량입니다: ${item.quantity}. 1 이상 ${MAX_ORDER_ITEM_QUANTITY} 이하의 정수여야 합니다.`, 400);
      }
    }

    // 주문 데이터 구성
    const orderData = {
      items: req.body.items.map(item => ({
        menu_id: item.menuId,
        quantity: item.quantity
      }))
    };

    // 주문 생성
    const createdOrder = await Order.create(orderData);

    // 주문 생성 로깅
    logger.logInfo('New order created via public API', {
      orderId: createdOrder.id,
      itemCount: req.body.items.length,
      totalItems: req.body.items.reduce((sum, item) => sum + item.quantity, 0)
    });

    // 상세 주문 정보 조회 (메뉴 이름 포함)
    const detailedOrder = await Order.findById(createdOrder.id);

    // 공개 API 스펙에 맞는 응답 형식 구성
    const publicOrderResponse = {
      orderId: detailedOrder.id,
      totalPrice: parseNonNegativeAmount(detailedOrder.total_price),
      status: detailedOrder.status,
      createdAt: detailedOrder.created_at,
      items: detailedOrder.items.map((item) => {
        const pricePerItem = parseNonNegativeAmount(item.price_per_item);

        return {
          menuId: item.menu_id,
          menuName: item.menu_name,
          quantity: item.quantity,
          pricePerItem,
          price: Number((pricePerItem * item.quantity).toFixed(2))
        };
      })
    };

    // Socket.IO를 통한 실시간 알림 전송
    const io = req.app.get('io');
    if (io) {
      io.emit('new_order', {
        orderId: publicOrderResponse.orderId,
        totalPrice: publicOrderResponse.totalPrice
      });
    }

    res.status(201).json(publicOrderResponse);
  } catch (error) {
    next(error);
  }
};
