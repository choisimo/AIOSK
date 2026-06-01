// src/middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { menuUploadDir, maxFileSize } = require('../config/upload.config');
const logger = require('../utils/logger');

const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/jpg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/gif', new Set(['.gif'])],
  ['image/webp', new Set(['.webp'])]
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(
  Array.from(ALLOWED_IMAGE_TYPES.values()).flatMap(extensions => Array.from(extensions))
);

// 파일 저장 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(menuUploadDir)) {
      fs.mkdirSync(menuUploadDir, { recursive: true });
    }
    cb(null, menuUploadDir);
  },
  filename: function (req, file, cb) {
    // 파일명 생성: [메뉴ID]-[타임스탬프].[확장자]
    const rawMenuId = typeof req.params?.menuId === 'string' ? req.params.menuId.trim() : '';
    const parsedMenuId = /^[1-9][0-9]*$/.test(rawMenuId) ? Number(rawMenuId) : null;
    const menuId = Number.isSafeInteger(parsedMenuId) ? rawMenuId : 'invalid';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `menu-${menuId}-${timestamp}${ext}`;
    cb(null, filename);
  }
});

// Multer 설정
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const originalExtension = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ALLOWED_IMAGE_TYPES.get(file.mimetype);

    if (!allowedExtensions) {
      const error = new Error('이미지 파일만 업로드 가능합니다. (JPEG, PNG, GIF, WebP)');
      error.mimetype = file.mimetype;
      return cb(error, false);
    }

    if (!ALLOWED_IMAGE_EXTENSIONS.has(originalExtension) || !allowedExtensions.has(originalExtension)) {
      const error = new Error('이미지 파일 확장자가 MIME 타입과 일치하지 않습니다. (JPEG, PNG, GIF, WebP)');
      error.extension = originalExtension;
      error.mimetype = file.mimetype;
      return cb(error, false);
    }

    return cb(null, true);
  },
  limits: {
    fileSize: maxFileSize,
    files: 1 // 한 번에 하나의 파일만
  }
});

const logUploadRejection = (req, reason, data = {}) => {
  logger.logWarning('Upload rejected', {
    reason,
    field: data.field,
    code: data.code,
    mimetype: data.mimetype,
    extension: data.extension,
    limit: data.limit,
    ip: req.ip,
    requestId: req.id
  });
};

// 에러 핸들링 미들웨어
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const maxFileSizeMiB = maxFileSize / (1024 * 1024);
      const maxFileSizeLabel = `${Number.isInteger(maxFileSizeMiB) ? maxFileSizeMiB : maxFileSizeMiB.toFixed(1)}MB`;

      logUploadRejection(req, 'file_too_large', {
        code: error.code,
        field: error.field,
        limit: maxFileSize
      });
      return res.status(400).json({
        message: `파일 크기가 너무 큽니다. 최대 ${maxFileSizeLabel}까지 업로드 가능합니다.`
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      logUploadRejection(req, 'too_many_files', {
        code: error.code,
        field: error.field
      });
      return res.status(400).json({
        message: '한 번에 하나의 파일만 업로드할 수 있습니다.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      logUploadRejection(req, 'unexpected_file_field', {
        code: error.code,
        field: error.field
      });
      return res.status(400).json({
        message: '예상하지 못한 파일 필드입니다. "image" 필드를 사용해주세요.'
      });
    }
  }

  if (error.message && error.message.includes('이미지 파일')) {
    logUploadRejection(req, error.extension ? 'invalid_extension' : 'invalid_mimetype', {
      extension: error.extension,
      mimetype: error.mimetype
    });
    return res.status(400).json({
      message: error.message
    });
  }

  // 기타 에러
  logger.logError(error, req, { context: 'Upload middleware' });
  return res.status(500).json({
    message: '파일 업로드 중 오류가 발생했습니다.'
  });
};

module.exports = {
  uploadSingle: upload.single('image'),
  handleUploadError
};
