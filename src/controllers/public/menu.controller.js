// src/controllers/public/menu.controller.js
const Menu = require("../../models/menu.model.js");

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
      const parsedCategoryId = parseInt(categoryId, 10);
      if (isNaN(parsedCategoryId)) {
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
      price: parseFloat(menu.price), // Decimal을 number로 변환
      imageUrl: menu.image_url,
      status: menu.status,
      categoryId: menu.category_id
    }));

    res.status(200).json(publicMenus);
  } catch (err) {
    console.error("Error retrieving public menus:", err);
    res.status(500).json({
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
};
