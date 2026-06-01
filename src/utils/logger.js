// src/utils/logger.js

const winston = require('winston');
const path = require('path');

// 로그 디렉토리 생성
const fs = require('fs');
const logDir = path.resolve(process.cwd(), process.env.LOG_DIR || 'logs');
fs.mkdirSync(logDir, { recursive: true });

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|passwd|token|secret|session|jwt|api[-_]?key|x-metrics-token|x-kiosk-status-token)/i;
const URL_KEY_PATTERN = /(^|[_-])(?:url|uri|href|referrer|referer)(?:$|[_-])|originalUrl/i;

const redactUrl = (value) => {
  if (typeof value !== 'string') return value;

  const hashIndex = value.indexOf('#');
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : value.slice(hashIndex);
  const queryIndex = withoutHash.indexOf('?');

  if (queryIndex === -1) return value;

  const prefix = withoutHash.slice(0, queryIndex);
  const query = withoutHash.slice(queryIndex + 1);

  if (!query) return value;

  const redactedQuery = query.split('&').map((part) => {
    if (!part) return part;

    const separatorIndex = part.indexOf('=');
    const key = separatorIndex === -1 ? part : part.slice(0, separatorIndex);
    let decodedKey = key;
    try {
      decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));
    } catch (error) {
      decodedKey = key;
    }

    if (!SENSITIVE_KEY_PATTERN.test(decodedKey)) {
      return part;
    }

    return `${key}=${REDACTED}`;
  }).join('&');

  return `${prefix}?${redactedQuery}${hash}`;
};

const normalizeError = (error) => {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);

  const normalizedError = new Error('Non-Error value was thrown or logged.');
  normalizedError.details = error;
  return normalizedError;
};

const redactSensitiveData = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveData(item, seen));
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  return Object.entries(value).reduce((redacted, [key, entryValue]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = REDACTED;
    } else if (URL_KEY_PATTERN.test(key) && typeof entryValue === 'string') {
      redacted[key] = redactUrl(entryValue);
    } else {
      redacted[key] = redactSensitiveData(entryValue, seen);
    }
    return redacted;
  }, {});
};

const serializeErrorForLog = (error, seen = new WeakSet()) => {
  const normalizedError = normalizeError(error);

  if (seen.has(normalizedError)) {
    return '[Circular]';
  }
  seen.add(normalizedError);

  const serialized = {
    name: normalizedError.name,
    message: normalizedError.message,
    stack: normalizedError.stack,
    code: normalizedError.code,
    statusCode: normalizedError.statusCode
  };

  if (normalizedError.cause) {
    serialized.cause = serializeErrorForLog(normalizedError.cause, seen);
  }

  if (normalizedError.details) {
    serialized.details = normalizedError.details instanceof Error
      ? serializeErrorForLog(normalizedError.details, seen)
      : redactSensitiveData(normalizedError.details);
  }

  return redactSensitiveData(serialized);
};

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
logger.logError = function(error, req = null, data = null) {
  const normalizedError = normalizeError(error);
  const logData = {
    ...serializeErrorForLog(normalizedError),
    statusCode: normalizedError.statusCode || 500
  };

  if (data) {
    logData.data = redactSensitiveData(data);
  }

  if (req) {
    logData.request = {
      method: req.method,
      url: redactUrl(req.originalUrl || req.url),
      headers: redactSensitiveData(req.headers),
      body: redactSensitiveData(req.body),
      params: redactSensitiveData(req.params),
      query: redactSensitiveData(req.query),
      ip: req.ip
    };
  }

  this.error(logData);
};

logger.logInfo = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = redactSensitiveData(data);
  this.info(logData);
};

logger.logWarning = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = redactSensitiveData(data);
  this.warn(logData);
};

logger.logDebug = function(message, data = null) {
  const logData = { message };
  if (data) logData.data = redactSensitiveData(data);
  this.debug(logData);
};

logger.redactSensitiveData = redactSensitiveData;
logger.redactUrl = redactUrl;

module.exports = logger;
