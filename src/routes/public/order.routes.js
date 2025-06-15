// src/routes/public/order.routes.js
module.exports = app => {
  const publicOrders = require("../../controllers/public/order.controller.js");
  var router = require("express").Router();

  // 공개 주문 생성 (인증 불필요)
  router.post("/", publicOrders.create);

  app.use('/api/public/orders', router);
};
