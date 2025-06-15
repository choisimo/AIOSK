// src/routes/public/menu.routes.js
module.exports = app => {
  const publicMenus = require("../../controllers/public/menu.controller.js");
  var router = require("express").Router();

  // 공개 메뉴 목록 조회 (인증 불필요)
  // 쿼리 파라미터: categoryId (선택사항)
  router.get("/", publicMenus.findAll);

  app.use('/api/public/menus', router);
};
