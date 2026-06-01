const logger = require('../utils/logger');

const createRateLimiter = ({ name, windowMs, maxRequests }) => {
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error(`${name} rate limit windowMs must be a positive integer.`);
  }
  if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
    throw new Error(`${name} rate limit maxRequests must be a positive integer.`);
  }

  const buckets = new Map();
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, windowMs);
  cleanupInterval.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${name}:${clientIp}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const remaining = Math.max(maxRequests - bucket.count, 0);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count <= maxRequests) {
      return next();
    }

    res.setHeader('Retry-After', String(retryAfterSeconds));
    logger.logWarning('Rate limit exceeded', {
      limiter: name,
      method: req.method,
      url: logger.redactUrl(req.originalUrl || req.url),
      ip: clientIp,
      requestId: req.id,
      retryAfterSeconds
    });

    return res.status(429).send({
      message: 'Too many requests. Try again later.'
    });
  };
};

module.exports = {
  createRateLimiter
};
