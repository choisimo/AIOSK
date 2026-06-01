// src/controllers/public/menu.controller.js
const Menu = require("../../models/menu.model.js");
const logger = require("../../utils/logger.js");

const parseNonNegativeAmount = (value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
  if (parsed !== null && Number.isFinite(parsed)) {
    return parsed;
  }

  throw new Error('Invalid menu price from database.');
};

// 공개 메뉴 목록 조회 (인증 불필요)
exports.findAll = async (req, res) => {
  try {
    const { categoryId } = req.query;
    
    // 필터 설정: FOR_SALE 상태인 메뉴만 조회
    const filters = {
      status: 'FOR_SALE'
    };
    
    // categoryId가 제공된 경우 해당 카테고리 메뉴만 필터링
    if (categoryId) {
      const rawCategoryId = typeof categoryId === 'string' ? categoryId.trim() : '';
      const parsedCategoryId = /^[1-9][0-9]*$/.test(rawCategoryId) ? Number(rawCategoryId) : null;
      if (!Number.isSafeInteger(parsedCategoryId)) {
        return res.status(400).json({
          message: "유효하지 않은 카테고리 ID입니다."
        });
      }
      filters.category_id = parsedCategoryId;
    }

    const menus = await Menu.getAll(filters);
    
    // 응답 형식을 공개 API 스펙에 맞게 변환
    const publicMenus = menus.map(menu => ({
      menuId: menu.id,
      name: menu.name,
      description: menu.description,
      price: parseNonNegativeAmount(menu.price),
      imageUrl: menu.image_url,
      status: menu.status,
      categoryId: menu.category_id
    }));

    res.status(200).json(publicMenus);
  } catch (err) {
    logger.logError(err, req, { context: 'Public menu list' });
    res.status(500).json({
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
};
