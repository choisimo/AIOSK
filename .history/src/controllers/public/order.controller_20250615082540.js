// src/controllers/public/order.controller.js
const Order = require("../../models/order.model.js");
const { AppError, catchAsync } = require("../../middleware/error.middleware.js");
const logger = require("../../utils/logger");

// 주문 데이터 유효성 검증 헬퍼 함수
const validateOrderData = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError("주문 항목이 필요합니다. 'items' 배열에 최소 하나의 항목을 포함해야 합니다.", 400);
  }

  for (const item of items) {
    if (item.menuId === undefined || item.quantity === undefined) {
      throw new AppError("각 주문 항목에는 menuId와 quantity가 필요합니다.", 400);
    }
    
    if (typeof item.menuId !== 'number' || item.menuId <= 0) {
      throw new AppError(`유효하지 않은 메뉴 ID입니다: ${item.menuId}. 양의 정수여야 합니다.`, 400);
    }
    
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new AppError(`유효하지 않은 수량입니다: ${item.quantity}. 양의 정수여야 합니다.`, 400);
    }
  }
};

// 공개 주문 생성 (인증 불필요)
exports.create = catchAsync(async (req, res) => {
  // 요청 데이터 검증
  validateOrderData(req.body.items);
  
  // 주문 데이터 구성 (공개 API에서는 기본 상태로 설정)
  const orderData = {
    items: req.body.items.map(item => ({
      menu_id: item.menuId,
      quantity: item.quantity
    })),
    status: 'RECEIVED' // 공개 API에서 생성되는 주문의 기본 상태
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
  
  // Socket.IO를 통한 실시간 알림 전송
  const io = req.app.get('io');
  if (io && detailedOrder) {
    io.emit('new_order', {
      orderId: detailedOrder.id,
      totalPrice: detailedOrder.total_price,
      status: detailedOrder.status,
      createdAt: detailedOrder.created_at,
      items: detailedOrder.items
    });
  }
  
  // 공개 API 스펙에 맞는 응답 형식 구성
  const publicOrderResponse = {
    orderId: detailedOrder.id,
    totalPrice: parseFloat(detailedOrder.total_price),
    status: detailedOrder.status,
    createdAt: detailedOrder.created_at,
    items: detailedOrder.items.map(item => ({
      menuName: item.menu_name,
      quantity: item.quantity,
      price: parseFloat(item.price_per_item) * item.quantity
    }))
  };
  
  res.status(201).json(publicOrderResponse);
});
    });
  }
};
