// src/controllers/public/category.controller.js
const Category = require("../../models/category.model.js");

// 공개 카테고리 목록 조회 (인증 불필요)
exports.findAll = async (req, res) => {
  try {
    // sort_order 기준 오름차순으로 모든 카테고리 조회
    const categories = await Category.getAll();
    
    // 응답 형식을 공개 API 스펙에 맞게 변환
    const publicCategories = categories.map(category => ({
      categoryId: category.id,
      name: category.name,
      sortOrder: category.sort_order
    }));

    res.status(200).json(publicCategories);
  } catch (err) {
    console.error("Error retrieving public categories:", err);
    res.status(500).json({
      message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
};
