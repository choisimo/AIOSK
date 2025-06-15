// src/routes/public/category.routes.js
module.exports = app => {
  const publicCategories = require("../../controllers/public/category.controller.js");
  var router = require("express").Router();

  // 공개 카테고리 목록 조회 (인증 불필요)
  router.get("/", publicCategories.findAll);

  app.use('/api/public/categories', router);
};
