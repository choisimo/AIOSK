// src/middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 업로드 디렉토리 확인 및 생성
const ensureUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// 파일 저장 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../../uploads/menus');
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // 파일명 생성: [메뉴ID]-[타임스탬프].[확장자]
    const menuId = req.params.menuId || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `menu-${menuId}-${timestamp}${ext}`;
    cb(null, filename);
  }
});

// 파일 필터링 (이미지 파일만 허용)
const fileFilter = (req, file, cb) => {
  // 허용되는 이미지 MIME 타입
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다. (JPEG, PNG, GIF, WebP)'), false);
  }
};

// Multer 설정
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 제한
    files: 1 // 한 번에 하나의 파일만
  }
});

// 에러 핸들링 미들웨어
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: '파일 크기가 너무 큽니다. 최대 5MB까지 업로드 가능합니다.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: '한 번에 하나의 파일만 업로드할 수 있습니다.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: '예상하지 못한 파일 필드입니다. "image" 필드를 사용해주세요.'
      });
    }
  }
  
  if (error.message.includes('이미지 파일만')) {
    return res.status(400).json({
      message: error.message
    });
  }
  
  // 기타 에러
  return res.status(500).json({
    message: '파일 업로드 중 오류가 발생했습니다.'
  });
};

module.exports = {
  uploadSingle: upload.single('image'),
  handleUploadError
};
