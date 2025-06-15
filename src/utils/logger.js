// src/utils/logger.js

const winston = require('winston');
const path = require('path');

// 로그 디렉토리 생성
const logDir = 'logs';
const fs = require('fs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 로그 포맷 정의
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 콘솔용 포맷 (개발 환경)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Winston logger 생성
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'aiosk-backend' },
  transports: [
    // 에러 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // 모든 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // 액세스 로그 파일 (HTTP 요청)
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 개발 환경에서는 콘솔에도 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// HTTP 요청 로깅을 위한 스트림
logger.stream = {
  write: (message) => {
    // morgan에서 전달하는 메시지의 마지막 개행문자 제거
    logger.http(message.trim());
  }
};

// 커스텀 로깅 메서드들
logger.logError = function(error, req = null) {
  const logData = {
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500
  };
  
  if (req) {
    logData.request = {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip
    };
  }
  
  this.error(logData);
};

logger.logInfo = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = data;
  this.info(logData);
};

logger.logWarning = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = data;
  this.warn(logData);
};

logger.logDebug = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = data;
  this.debug(logData);
};

module.exports = logger;
