// src/server.js
require('dotenv').config(); // Ensures environment variables are loaded first

const express = require('express');
const cors = require('cors'); // Import CORS
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

// Swagger 설정 import
const { swaggerSpec, swaggerUi, swaggerUiOptions } = require('./config/swagger.config');

// 로깅 및 에러 처리 미들웨어 import
const logger = require('./utils/logger');
const { 
  globalErrorHandler, 
  notFoundHandler 
} = require('./middleware/error.middleware');
const {
  requestLogger,
  requestId,
  errorLogger,
  performanceLogger,
  securityLogger
} = require('./middleware/logging.middleware');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"]
  }
});

// 뷰 엔진 설정 (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'aiosk-admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // HTTPS에서는 true로 설정
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  }
}));

// Flash 메시지 설정
app.use(flash());

// Flash 메시지를 모든 뷰에서 사용할 수 있도록 설정
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

app.set('io', io); // Make io accessible in routes

// 로깅 미들웨어 적용 (가장 먼저)
app.use(requestId);
app.use(requestLogger);
app.use(performanceLogger);
app.use(securityLogger);

// CORS Configuration (Basic - allow all for now, can be configured more strictly)
app.use(cors()); 
// Or for specific origin:
// app.use(cors({ origin: 'http://localhost:YOUR_FRONTEND_PORT' }));

// Middleware to parse JSON bodies
app.use(express.json({ limit: '10mb' }));
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 정적 파일 제공 설정 (업로드된 이미지 접근용)
app.use('/uploads', express.static('uploads'));

// 공용 정적 파일 제공 (CSS, JS, 이미지 등)
app.use(express.static(path.join(__dirname, '../public')));

// Swagger UI 설정
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Swagger JSON 스펙 제공
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Simple test route
app.get('/api', (req, res) => { // Changed to /api to avoid conflict if frontend is served from root
  res.json({ 
    message: 'Kiosk Backend API is running!',
    documentation: `${req.protocol}://${req.get('host')}/api-docs`,
    swagger_json: `${req.protocol}://${req.get('host')}/api-docs.json`
  });
});

// --- Mount Routes ---
// Note: The order of requiring db.js doesn't strictly matter here as it sets up its own connection.
// However, routes depend on the Express app instance.

// === 웹 관리자 패널 라우트 ===
const webAdminRoutes = require('./routes/webAdmin.routes');
app.use('/admin', webAdminRoutes);

// === 공개 API 라우트 (인증 불필요) ===
// 공개 카테고리 라우트
require("./routes/public/category.routes.js")(app);
// 공개 메뉴 라우트
require("./routes/public/menu.routes.js")(app);
// 공개 주문 라우트
require("./routes/public/order.routes.js")(app);

// === 관리자 API 라우트 (인증 필요) ===
// 관리자 인증 라우트
require("./routes/admin.routes.js")(app);
// 관리자 카테고리 관리 라우트
require("./routes/category.routes.js")(app);
// 관리자 메뉴 관리 라우트
require("./routes/menu.routes.js")(app);
// 관리자 주문 관리 라우트
const adminOrderRoutes = require("./routes/admin/orders.routes.js");
app.use('/api/admin/orders', adminOrderRoutes);
// 관리자 통계 및 리포트 라우트
const adminStatisticsRoutes = require("./routes/admin/statistics.routes.js");
app.use('/api/admin/statistics', adminStatisticsRoutes);

// 404 에러 처리 (모든 라우트 뒤에 위치)
app.use(notFoundHandler);

// 에러 로깅 미들웨어
app.use(errorLogger);

// 중앙화된 에러 처리 미들웨어 (가장 마지막에 위치)
app.use(globalErrorHandler);

// Socket.IO connection listeners
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => { // Changed app.listen to httpServer.listen
  logger.logInfo(`Server is running on port ${PORT}`, { 
    environment: process.env.NODE_ENV || 'development',
    port: PORT 
  });
  
  // The database connection test is already within src/models/db.js
  // If you want an additional check here, you could try a simple query:
  /*
  const sql = require('./models/db.js'); // Get the promisePool
  sql.query('SELECT 1')
    .then(() => {
      logger.logInfo('Database connection verified successfully from server.js on startup.');
    })
    .catch(err => {
      logger.logError(err);
    });
  */
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.logInfo('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.logInfo('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.logInfo('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.logInfo('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.logError(err);
  logger.logError(new Error('Uncaught Exception! 💥 Shutting down...'));
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.logError(err);
  logger.logError(new Error('Unhandled Rejection! 💥 Shutting down...'));
  httpServer.close(() => {
    process.exit(1);
  });
});
