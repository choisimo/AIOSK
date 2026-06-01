const crypto = require('crypto');
const logger = require('../utils/logger');

const CSRF_SESSION_KEY = 'csrfToken';
const TOKEN_BYTES = 32;

const attachCsrfToken = (req, res, next) => {
  try {
    if (!req.session) {
      throw new Error('CSRF protection requires session middleware.');
    }

    if (!req.session[CSRF_SESSION_KEY]) {
      req.session[CSRF_SESSION_KEY] = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    }

    res.locals.csrfToken = req.session[CSRF_SESSION_KEY];
    next();
  } catch (error) {
    next(error);
  }
};

const verifyCsrfToken = (req, res, next) => {
  const expectedToken = req.session?.[CSRF_SESSION_KEY];
  const providedToken = req.body?._csrf || req.get('x-csrf-token');

  let tokenIsValid = false;
  if (expectedToken && providedToken) {
    const expectedBuffer = Buffer.from(String(expectedToken));
    const providedBuffer = Buffer.from(String(providedToken));
    tokenIsValid = expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  }

  if (tokenIsValid) {
    return next();
  }

  logger.logWarning('CSRF token validation failed', {
    method: req.method,
    url: logger.redactUrl(req.originalUrl || req.url),
    ip: req.ip,
    requestId: req.id
  });

  if (req.is('application/json') || req.xhr || /\bjson\b/i.test(req.get('accept') || '')) {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token.' });
  }

  req.flash?.('error', '요청 보안 토큰이 만료되었습니다. 다시 시도해주세요.');
  return res.redirect(req.get('referer') || '/admin/login');
};

module.exports = {
  attachCsrfToken,
  verifyCsrfToken
};
