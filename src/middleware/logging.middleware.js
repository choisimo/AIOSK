// src/middleware/logging.middleware.js

const morgan = require('morgan');
const logger = require('../utils/logger');

// 커스텀 토큰 정의
morgan.token('safe-url', (req) => logger.redactUrl(req.originalUrl || req.url));

// 로그 포맷 정의
const logFormat = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
  : ':method :safe-url :status :response-time ms - :res[content-length]';

// Morgan 미들웨어 설정
const requestLogger = morgan(logFormat, {
  stream: logger.stream,
  skip: (req, res) => {
    // 정적 파일 요청은 로깅에서 제외
    return req.url.startsWith('/uploads/') || 
           req.url.includes('.css') || 
           req.url.includes('.js') || 
           req.url.includes('.ico');
  }
});

// 요청 ID 생성 미들웨어
const requestId = (req, res, next) => {
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  res.setHeader('X-Request-ID', req.id);
  next();
};

// 에러 로깅 미들웨어
const errorLogger = (err, req, res, next) => {
  logger.logError(err, req);
  next(err);
};

// 성능 모니터링 미들웨어
const performanceLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // 느린 요청 (1초 이상) 경고 로그
    if (duration > 1000) {
      logger.logWarning('Slow request detected', {
        method: req.method,
        url: logger.redactUrl(req.originalUrl),
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        requestId: req.id
      });
    }
    
    // 에러 응답 로깅
    if (res.statusCode >= 400) {
      logger.logWarning('Error response', {
        method: req.method,
        url: logger.redactUrl(req.originalUrl),
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        requestId: req.id,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
  });
  
  next();
};

// 보안 로깅 미들웨어 (의심스러운 활동 감지)
const securityLogger = (req, res, next) => {
  const suspiciousPatterns = [
    /\.(php|asp|jsp)$/i,  // 웹쉘 시도
    /\.\./,               // Directory traversal
    /<script/i,           // XSS 시도
    /union.*select/i,     // SQL injection 시도
    /drop.*table/i        // SQL injection 시도
  ];
  
  const url = req.originalUrl || req.url;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(JSON.stringify(req.body))) {
      logger.logWarning('Suspicious activity detected', {
        method: req.method,
        url: logger.redactUrl(url),
        body: logger.redactSensitiveData(req.body),
        headers: logger.redactSensitiveData(req.headers),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id
      });
      break;
    }
  }
  
  next();
};

module.exports = {
  requestLogger,
  requestId,
  errorLogger,
  performanceLogger,
  securityLogger
};
