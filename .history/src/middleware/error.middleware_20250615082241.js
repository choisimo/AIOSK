// src/middleware/error.middleware.js

/**
 * 사용자 정의 에러 클래스
 * 특정 HTTP 상태 코드와 메시지를 가진 에러를 생성
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 개발 환경에서의 에러 응답 포맷
 * 상세한 에러 정보를 포함
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

/**
 * 운영 환경에서의 에러 응답 포맷
 * 민감한 정보는 숨기고 사용자 친화적인 메시지만 전송
 */
const sendErrorProd = (err, res) => {
  // 운영 에러 (사용자에게 안전하게 보여줄 수 있는 에러)
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message
    });
  } else {
    // 프로그래밍 에러나 알 수 없는 에러
    // 1) 로그에 에러를 기록
    console.error('ERROR 💥', err);

    // 2) 일반적인 메시지를 클라이언트에 전송
    res.status(500).json({
      success: false,
      status: 'error',
      message: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    });
  }
};

/**
 * MySQL 에러 처리
 * 데이터베이스 관련 에러를 사용자 친화적인 메시지로 변환
 */
const handleMySQLError = (err) => {
  let message = '데이터베이스 오류가 발생했습니다.';
  
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      message = '이미 존재하는 데이터입니다.';
      break;
    case 'ER_NO_REFERENCED_ROW_2':
      message = '참조하는 데이터가 존재하지 않습니다.';
      break;
    case 'ER_ROW_IS_REFERENCED_2':
      message = '다른 데이터에서 참조 중인 항목은 삭제할 수 없습니다.';
      break;
    case 'ER_BAD_NULL_ERROR':
      message = '필수 입력 항목이 누락되었습니다.';
      break;
    case 'ER_DATA_TOO_LONG':
      message = '입력된 데이터가 허용 길이를 초과했습니다.';
      break;
    case 'ECONNREFUSED':
      message = '데이터베이스 연결에 실패했습니다.';
      break;
    default:
      message = '데이터베이스 처리 중 오류가 발생했습니다.';
  }
  
  return new AppError(message, 400);
};

/**
 * JSON Web Token 에러 처리
 */
const handleJWTError = () => 
  new AppError('유효하지 않은 토큰입니다. 다시 로그인해주세요.', 401);

const handleJWTExpiredError = () => 
  new AppError('토큰이 만료되었습니다. 다시 로그인해주세요.', 401);

/**
 * Multer 파일 업로드 에러 처리
 */
const handleMulterError = (err) => {
  let message = '파일 업로드 중 오류가 발생했습니다.';
  
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = '파일 크기가 너무 큽니다. 5MB 이하의 파일만 업로드 가능합니다.';
      break;
    case 'LIMIT_FILE_COUNT':
      message = '업로드 파일 개수가 제한을 초과했습니다.';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = '허용되지 않는 파일 필드입니다.';
      break;
    default:
      message = '파일 업로드 중 오류가 발생했습니다.';
  }
  
  return new AppError(message, 400);
};

/**
 * 유효성 검증 에러 처리
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `입력 데이터가 올바르지 않습니다: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

/**
 * 글로벌 에러 처리 미들웨어
 * 모든 에러를 캐치하고 적절한 응답을 생성
 */
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // MySQL 에러 처리
    if (err.code) {
      error = handleMySQLError(error);
    }
    
    // JWT 에러 처리
    if (err.name === 'JsonWebTokenError') {
      error = handleJWTError();
    }
    if (err.name === 'TokenExpiredError') {
      error = handleJWTExpiredError();
    }
    
    // Multer 에러 처리
    if (err.code && err.code.startsWith('LIMIT_')) {
      error = handleMulterError(error);
    }
    
    // 유효성 검증 에러 처리
    if (err.name === 'ValidationError') {
      error = handleValidationError(error);
    }

    sendErrorProd(error, res);
  }
};

/**
 * 존재하지 않는 라우트에 대한 404 에러 처리
 */
const notFoundHandler = (req, res, next) => {
  const err = new AppError(`${req.originalUrl} 경로를 찾을 수 없습니다.`, 404);
  next(err);
};

/**
 * 비동기 함수의 에러를 자동으로 캐치하는 래퍼 함수
 * 컨트롤러에서 try-catch 없이 사용 가능
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  AppError,
  globalErrorHandler,
  notFoundHandler,
  catchAsync
};
