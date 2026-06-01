const path = require('path');

const DEFAULT_UPLOAD_DIR = 'uploads';
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR);
const rawMaxFileSize = process.env.MAX_FILE_SIZE;
const maxFileSizeText = typeof rawMaxFileSize === 'number' ? String(rawMaxFileSize) : String(rawMaxFileSize || '').trim();
const parsedMaxFileSize = rawMaxFileSize === undefined || rawMaxFileSize === ''
  ? DEFAULT_MAX_FILE_SIZE
  : (/^[1-9][0-9]*$/.test(maxFileSizeText) ? Number(maxFileSizeText) : null);
if (!Number.isSafeInteger(parsedMaxFileSize)) {
  throw new Error('MAX_FILE_SIZE must be a positive integer.');
}

module.exports = {
  uploadRoot,
  menuUploadDir: path.join(uploadRoot, 'menus'),
  maxFileSize: parsedMaxFileSize
};
