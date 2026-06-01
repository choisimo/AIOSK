// src/server.js
require('dotenv').config(); // Ensures environment variables are loaded first
const { loadEnvFileSecrets } = require('./utils/envSecrets');
loadEnvFileSecrets();

const express = require('express');
const cors = require('cors'); // Import CORS
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const packageJson = require('../package.json');

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
const { metricsMiddleware } = require('./utils/metrics');
const { MySQLSessionStore, DEFAULT_CLEANUP_INTERVAL_MS } = require('./utils/mysqlSessionStore');
const { uploadRoot } = require('./config/upload.config');
const { createRateLimiter } = require('./middleware/rateLimit.middleware');
const { createFlashMiddleware } = require('./middleware/flash.middleware');

const parseOriginList = (value) => String(value || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const LOCAL_HTTP_URL_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i;
const DEFAULT_SESSION_SECRET = 'aiosk-admin-secret-key';
const DEFAULT_REQUEST_BODY_LIMIT = '1mb';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 300;
const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 20;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10 * 1000;
const DEFAULT_PORT = 3000;
const REQUEST_BODY_LIMIT_PATTERN = /^[1-9][0-9]*(b|kb|mb)$/i;
const PLACEHOLDER_SECRETS = new Set([
  DEFAULT_SESSION_SECRET,
  'change_this_session_secret',
  'change_this_to_at_least_32_characters',
  'your_super_secure_jwt_secret_key_at_least_32_characters_long',
  'your-super-secret-jwt-key-at-least-32-characters',
  'your-super-secret-session-key-at-least-32-characters'
]);

const normalizeCorsOrigin = (value) => {
  const origins = parseOriginList(value);
  if (origins.length === 0) return undefined;
  return origins.length === 1 ? origins[0] : origins;
};

const normalizePositiveInteger = (value, defaultValue, envName) => {
  if (value === undefined || value === '') return defaultValue;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${envName} must be a positive integer.`);
  }
  return parsed;
};

const normalizeListenPort = (value, defaultValue, envName) => {
  if (value === undefined || value === '') return defaultValue;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  const parsed = /^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : null;
  if (!Number.isSafeInteger(parsed) || parsed > 65535) {
    throw new Error(`${envName} must be an integer between 0 and 65535.`);
  }
  return parsed;
};

const normalizeRequestBodyLimit = (value) => {
  const normalized = String(value || DEFAULT_REQUEST_BODY_LIMIT).trim().toLowerCase();
  if (!REQUEST_BODY_LIMIT_PATTERN.test(normalized)) {
    throw new Error('REQUEST_BODY_LIMIT must be a positive byte size with b, kb, or mb units.');
  }
  return normalized;
};

const normalizeSessionStoreType = () => {
  const storeType = String(process.env.SESSION_STORE || (isProduction ? 'mysql' : 'memory')).toLowerCase();
  if (!['memory', 'mysql'].includes(storeType)) {
    throw new Error('SESSION_STORE must be either memory or mysql.');
  }
  return storeType;
};

const assertStrongSecret = (name, value) => {
  const text = String(value || '');
  const normalized = text.toLowerCase();
  if (!text || text.length < 32 || PLACEHOLDER_SECRETS.has(normalized) || /^(change_this|replace_with|your[_-])/i.test(text)) {
    throw new Error(`${name} must be set to a non-placeholder value with at least 32 characters in production.`);
  }
};

const assertProductionOrigins = (name, value) => {
  parseOriginList(value).forEach((origin) => {
    if (origin === '*') {
      throw new Error(`${name} must not use wildcard origin in production.`);
    }

    if (LOCAL_HTTP_URL_PATTERN.test(origin)) {
      throw new Error(`${name} must not use local origins in production.`);
    }
  });
};

const assertProductionPublicUrl = (name, value) => {
  if (!value) return;
  const normalized = String(value).trim();

  if (!/^https?:\/\/[^\s]+$/i.test(normalized)) {
    throw new Error(`${name} must be an absolute http or https URL in production.`);
  }
  if (LOCAL_HTTP_URL_PATTERN.test(normalized)) {
    throw new Error(`${name} must not use a local URL in production.`);
  }
};

const validateRuntimeConfig = () => {
  if (!isProduction) return;

  for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[name]) {
      throw new Error(`${name} must be set in production.`);
    }
  }

  const productionPort = normalizeListenPort(process.env.PORT, DEFAULT_PORT, 'PORT');
  if (productionPort === 0) {
    throw new Error('PORT must not be 0 in production.');
  }
  normalizePositiveInteger(process.env.DB_PORT, 3306, 'DB_PORT');
  normalizePositiveInteger(process.env.READINESS_DB_TIMEOUT_MS, 2000, 'READINESS_DB_TIMEOUT_MS');
  normalizeRequestBodyLimit(process.env.REQUEST_BODY_LIMIT);
  normalizePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS');
  normalizePositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_MAX_REQUESTS');
  normalizePositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS, 'AUTH_RATE_LIMIT_WINDOW_MS');
  normalizePositiveInteger(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS, 'AUTH_RATE_LIMIT_MAX_REQUESTS');
  normalizePositiveInteger(process.env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS, 'SHUTDOWN_TIMEOUT_MS');
  for (const name of ['ALLOW_OPEN_METRICS', 'ALLOW_OPEN_CORS']) {
    const value = process.env[name];
    if (value !== undefined && value !== '' && !['true', 'false'].includes(value)) {
      throw new Error(`${name} must be true or false in production.`);
    }
  }

  if (normalizeSessionStoreType() !== 'mysql') {
    throw new Error('SESSION_STORE must be mysql in production.');
  }
  if (!sessionCookieSecure) {
    throw new Error('SESSION_COOKIE_SECURE must be true in production.');
  }

  assertStrongSecret('JWT_SECRET', process.env.JWT_SECRET);
  assertStrongSecret('SESSION_SECRET', process.env.SESSION_SECRET);
  if (process.env.KIOSK_STATUS_TOKEN) {
    if (process.env.KIOSK_STATUS_TOKEN.length < 16) {
      throw new Error('KIOSK_STATUS_TOKEN must be at least 16 characters when set in production.');
    }
    if (/^(change_this|replace_with|your[_-])/i.test(process.env.KIOSK_STATUS_TOKEN)) {
      throw new Error('KIOSK_STATUS_TOKEN must not use placeholder values in production.');
    }
    if (/\s/.test(process.env.KIOSK_STATUS_TOKEN)) {
      throw new Error('KIOSK_STATUS_TOKEN must not contain whitespace in production.');
    }
  }
  if (!process.env.METRICS_TOKEN && process.env.ALLOW_OPEN_METRICS !== 'true') {
    throw new Error('METRICS_TOKEN must be set in production, or ALLOW_OPEN_METRICS=true must be set intentionally.');
  }
  if (process.env.METRICS_TOKEN) {
    assertStrongSecret('METRICS_TOKEN', process.env.METRICS_TOKEN);
  }

  if (!process.env.CORS_ORIGIN && process.env.ALLOW_OPEN_CORS !== 'true') {
    throw new Error('CORS_ORIGIN must be set in production, or ALLOW_OPEN_CORS=true must be set intentionally.');
  }
  assertProductionOrigins('CORS_ORIGIN', process.env.CORS_ORIGIN);

  if (!process.env.SOCKET_CORS_ORIGIN) {
    throw new Error('SOCKET_CORS_ORIGIN must be set in production.');
  }
  assertProductionOrigins('SOCKET_CORS_ORIGIN', process.env.SOCKET_CORS_ORIGIN);

  assertProductionPublicUrl('API_PUBLIC_URL', process.env.API_PUBLIC_URL);
  assertProductionPublicUrl('KIOSK_FRONTEND_URL', process.env.KIOSK_FRONTEND_URL);
};

const sessionCookieSecureEnv = process.env.SESSION_COOKIE_SECURE;
let sessionCookieSecure = isProduction;
if (sessionCookieSecureEnv !== undefined && sessionCookieSecureEnv !== '') {
  const normalizedSessionCookieSecure = String(sessionCookieSecureEnv).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedSessionCookieSecure)) {
    sessionCookieSecure = true;
  } else if (['0', 'false', 'no', 'off'].includes(normalizedSessionCookieSecure)) {
    sessionCookieSecure = false;
  } else {
    throw new Error(`Invalid boolean environment value: ${sessionCookieSecureEnv}`);
  }
}
const sessionCookieSameSite = String(process.env.SESSION_COOKIE_SAME_SITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(sessionCookieSameSite)) {
  throw new Error('SESSION_COOKIE_SAME_SITE must be one of lax, strict, none.');
}

validateRuntimeConfig();

const app = express();
const requestBodyLimit = normalizeRequestBodyLimit(process.env.REQUEST_BODY_LIMIT);
const apiRateLimiter = createRateLimiter({
  name: 'api',
  windowMs: normalizePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS'),
  maxRequests: normalizePositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS, 'RATE_LIMIT_MAX_REQUESTS')
});
const authRateLimiter = createRateLimiter({
  name: 'auth',
  windowMs: normalizePositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS, 'AUTH_RATE_LIMIT_WINDOW_MS'),
  maxRequests: normalizePositiveInteger(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS, 'AUTH_RATE_LIMIT_MAX_REQUESTS')
});
const postOnly = (middleware) => (req, res, next) => (
  req.method === 'POST' ? middleware(req, res, next) : next()
);
const trustProxyEnv = process.env.TRUST_PROXY;
let trustProxy;
if (trustProxyEnv !== undefined && trustProxyEnv !== '') {
  const normalizedTrustProxy = String(trustProxyEnv).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedTrustProxy)) {
    trustProxy = 1;
  } else if (['0', 'false', 'no', 'off'].includes(normalizedTrustProxy)) {
    trustProxy = false;
  } else {
    const parsedTrustProxy = /^(0|[1-9][0-9]*)$/.test(normalizedTrustProxy) ? Number(normalizedTrustProxy) : null;
    if (Number.isSafeInteger(parsedTrustProxy)) {
      trustProxy = parsedTrustProxy;
    } else {
      throw new Error('TRUST_PROXY must be boolean-like or a non-negative integer.');
    }
  }
}
if (trustProxy !== undefined) {
  app.set('trust proxy', trustProxy);
}

const databasePool = require('./models/db');
const sessionStoreType = normalizeSessionStoreType();
const sessionStore = sessionStoreType === 'mysql'
  ? new MySQLSessionStore(databasePool, {
    cleanupIntervalMs: normalizePositiveInteger(
      process.env.SESSION_CLEANUP_INTERVAL_MS,
      DEFAULT_CLEANUP_INTERVAL_MS,
      'SESSION_CLEANUP_INTERVAL_MS'
    )
  })
  : undefined;

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: normalizeCorsOrigin(process.env.SOCKET_CORS_ORIGIN) || 'http://localhost:3000',
    methods: ["GET", "POST"]
  }
});

// 뷰 엔진 설정 (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// EJS 레이아웃 설정
app.use(expressLayouts);
app.set('layout', 'layouts/admin');
app.set('layout extractScripts', true);

// 세션 설정
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: sessionCookieSameSite,
    maxAge: normalizePositiveInteger(process.env.SESSION_COOKIE_MAX_AGE_MS, 24 * 60 * 60 * 1000, 'SESSION_COOKIE_MAX_AGE_MS')
  }
}));

app.set('io', io); // Make io accessible in routes

// 로깅 미들웨어 적용 (가장 먼저)
app.use(requestId);
app.use(metricsMiddleware);
app.use(requestLogger);
app.use(performanceLogger);

const corsOrigin = normalizeCorsOrigin(process.env.CORS_ORIGIN);
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));
app.use('/api', apiRateLimiter);
app.use('/api/admin/login', postOnly(authRateLimiter));
app.use('/admin/login', postOnly(authRateLimiter));

// Middleware to parse JSON bodies
app.use(express.json({ limit: requestBodyLimit }));
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use(securityLogger);

// 정적 파일 제공 설정 (업로드된 이미지 접근용)
app.use('/uploads', express.static(uploadRoot));

const vendorStaticOptions = isProduction
  ? { immutable: true, maxAge: '1y' }
  : {};

app.use(
  '/vendor/bootstrap',
  express.static(path.join(__dirname, '../node_modules/bootstrap/dist'), vendorStaticOptions)
);
app.use(
  '/vendor/bootstrap-icons',
  express.static(path.join(__dirname, '../node_modules/bootstrap-icons/font'), vendorStaticOptions)
);
app.use(
  '/vendor/chart.js',
  express.static(path.join(__dirname, '../node_modules/chart.js/dist'), vendorStaticOptions)
);

// 공용 정적 파일 제공 (CSS, JS, 이미지 등)
app.use(express.static(path.join(__dirname, '../public')));

// Keep static assets before flash so same-origin browser asset loads cannot rotate form sessions.
app.use(createFlashMiddleware());

// Flash 메시지를 모든 뷰에서 사용할 수 있도록 설정
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPage = '';
  const configuredKioskFrontendUrl = process.env.KIOSK_FRONTEND_URL?.trim();
  const firstCorsOrigin = parseOriginList(process.env.CORS_ORIGIN).find(origin => origin !== '*');
  res.locals.kioskFrontendUrl = configuredKioskFrontendUrl || firstCorsOrigin || (isProduction ? '' : 'http://localhost:5173');
  next();
});

// Swagger UI 설정
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

/**
 * @swagger
 * /api-docs.json:
 *   get:
 *     summary: OpenAPI JSON
 *     description: Returns the generated OpenAPI document used by Swagger UI and smoke checks.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: OpenAPI document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
// Swagger JSON 스펙 제공
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API index
 *     description: Returns service metadata and links used by smoke checks and service discovery.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API index payload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                   example: "AIOSK Backend API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 links:
 *                   type: object
 *                   properties:
 *                     documentation:
 *                       type: string
 *                       example: "https://api.example.com/api-docs"
 *                     openapi:
 *                       type: string
 *                       example: "https://api.example.com/api-docs.json"
 *                     liveness:
 *                       type: string
 *                       example: "https://api.example.com/healthz"
 *                     readiness:
 *                       type: string
 *                       example: "https://api.example.com/readyz"
 *                     metrics:
 *                       type: string
 *                       example: "https://api.example.com/metrics"
 */
// API index route for smoke checks and service discovery.
app.get('/api', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    service: 'AIOSK Backend API',
    version: packageJson.version,
    status: 'ok',
    timestamp: new Date().toISOString(),
    links: {
      documentation: `${baseUrl}/api-docs`,
      openapi: `${baseUrl}/api-docs.json`,
      liveness: `${baseUrl}/healthz`,
      readiness: `${baseUrl}/readyz`,
      metrics: `${baseUrl}/metrics`
    }
  });
});

// 운영 헬스 체크 라우트
require('./routes/health.routes.js')(app);

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
// 공개 키오스크 상태 라우트
require("./routes/public/kioskStatus.routes.js")(app);

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
// 관리자 키오스크 상태 라우트
const adminKioskRoutes = require("./routes/admin/kiosks.routes.js");
app.use('/api/admin/kiosks', adminKioskRoutes);

// 404 에러 처리 (모든 라우트 뒤에 위치)
app.use(notFoundHandler);

// 에러 로깅 미들웨어
app.use(errorLogger);

// 중앙화된 에러 처리 미들웨어 (가장 마지막에 위치)
app.use(globalErrorHandler);

// Socket.IO connection listeners
io.on('connection', (socket) => {
  logger.logDebug('Socket client connected', { socketId: socket.id });

  socket.on('disconnect', () => {
    logger.logDebug('Socket client disconnected', { socketId: socket.id });
  });
});

const PORT = normalizeListenPort(process.env.PORT, DEFAULT_PORT, 'PORT');
httpServer.listen(PORT, () => {
  logger.logInfo(`Server is running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

let isShuttingDown = false;

const shutdown = async (reason, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.logInfo(`${reason} received. Shutting down gracefully...`);
  let timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS;
  try {
    timeoutMs = normalizePositiveInteger(
      process.env.SHUTDOWN_TIMEOUT_MS,
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      'SHUTDOWN_TIMEOUT_MS'
    );
  } catch (error) {
    logger.logError(error, null, { context: 'Graceful shutdown config' });
  }

  const timeout = setTimeout(() => {
    logger.logError(new Error(`Graceful shutdown timed out after ${timeoutMs}ms`), null, {
      context: 'Graceful shutdown'
    });
    process.exit(1);
  }, timeoutMs);
  timeout.unref?.();

  try {
    let httpCloseError = null;
    try {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    } catch (error) {
      httpCloseError = error;
      logger.logError(error, null, { context: 'Graceful shutdown HTTP close' });
    }

    if (sessionStore && typeof sessionStore.close === 'function') {
      sessionStore.close();
    }

    if (databasePool && typeof databasePool.end === 'function') {
      await databasePool.end();
    }

    clearTimeout(timeout);
    logger.logInfo('Runtime resources closed. Process terminated.');
    if (httpCloseError) {
      process.exit(1);
      return;
    }

    process.exit(exitCode);
  } catch (error) {
    clearTimeout(timeout);
    logger.logError(error, null, { context: 'Graceful shutdown' });
    process.exit(1);
  }
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.logError(err);
  logger.logError(new Error('Uncaught Exception. Shutting down...'));
  shutdown('uncaughtException', 1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.logError(err);
  logger.logError(new Error('Unhandled Rejection. Shutting down...'));
  shutdown('unhandledRejection', 1);
});
