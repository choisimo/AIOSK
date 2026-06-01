const session = require('express-session');
const logger = require('./logger');

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

const getExpiresAt = (sessionData) => {
  const cookie = sessionData && sessionData.cookie ? sessionData.cookie : {};
  const maxAge = Number(cookie.maxAge ?? cookie.originalMaxAge);

  if (Number.isFinite(maxAge) && maxAge > 0) {
    return new Date(Date.now() + maxAge);
  }

  if (cookie.expires) {
    const expires = new Date(cookie.expires);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() > Date.now()) {
      return expires;
    }
  }

  return new Date(Date.now() + DEFAULT_SESSION_TTL_MS);
};

class MySQLSessionStore extends session.Store {
  constructor(pool, options = {}) {
    super();
    this.pool = pool;
    this.cleanupIntervalMs = options.cleanupIntervalMs || DEFAULT_CLEANUP_INTERVAL_MS;

    if (this.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.clearExpired((error) => {
          if (error) {
            logger.logError(error, null, { context: 'MySQL session cleanup' });
          }
        });
      }, this.cleanupIntervalMs);

      if (typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  get(sid, callback) {
    this.pool.execute(
      'SELECT data FROM Sessions WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP(3)',
      [sid]
    )
      .then(([rows]) => {
        if (!rows.length) {
          callback(null, null);
          return;
        }

        const sessionData = rows[0].data;
        callback(null, sessionData ? (typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData) : null);
      })
      .catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const expiresAt = getExpiresAt(sessionData);
    const data = JSON.stringify(sessionData);

    this.pool.execute(
      `INSERT INTO Sessions (session_id, data, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         data = VALUES(data),
         expires_at = VALUES(expires_at),
         updated_at = CURRENT_TIMESTAMP`,
      [sid, data, expiresAt]
    )
      .then(() => callback(null))
      .catch(callback);
  }

  touch(sid, sessionData, callback = () => {}) {
    const expiresAt = getExpiresAt(sessionData);

    this.pool.execute(
      'UPDATE Sessions SET expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?',
      [expiresAt, sid]
    )
      .then(() => callback(null))
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.execute('DELETE FROM Sessions WHERE session_id = ?', [sid])
      .then(() => callback(null))
      .catch(callback);
  }

  clearExpired(callback = () => {}) {
    this.pool.execute('DELETE FROM Sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)')
      .then(() => callback(null))
      .catch(callback);
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = {
  MySQLSessionStore,
  DEFAULT_CLEANUP_INTERVAL_MS
};
