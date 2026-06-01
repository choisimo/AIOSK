const crypto = require('crypto');
const sql = require('../models/db.js');
const logger = require('../utils/logger');
const { renderPrometheusMetrics } = require('../utils/metrics');
const packageJson = require('../../package.json');

const DEFAULT_READINESS_TIMEOUT_MS = 2000;

const basePayload = () => ({
  service: 'aiosk-backend',
  version: packageJson.version,
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.floor(process.uptime())
});

const getLiveness = (req, res) => {
  res.json({
    status: 'alive',
    ...basePayload()
  });
};

const getReadiness = async (req, res) => {
  const startedAt = Date.now();
  let timeoutMs = DEFAULT_READINESS_TIMEOUT_MS;

  try {
    const rawTimeoutMs = process.env.READINESS_DB_TIMEOUT_MS;
    if (rawTimeoutMs !== undefined && rawTimeoutMs !== '') {
      const timeoutText = typeof rawTimeoutMs === 'number'
        ? String(rawTimeoutMs)
        : (typeof rawTimeoutMs === 'string' ? rawTimeoutMs.trim() : '');
      const parsedTimeoutMs = /^[1-9][0-9]*$/.test(timeoutText) ? Number(timeoutText) : null;
      if (!Number.isSafeInteger(parsedTimeoutMs)) {
        const error = new Error('READINESS_DB_TIMEOUT_MS must be a positive integer.');
        error.code = 'READINESS_CONFIG_INVALID';
        throw error;
      }
      timeoutMs = parsedTimeoutMs;
    }

    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Database readiness check timed out after ${timeoutMs}ms`);
        error.code = 'READINESS_TIMEOUT';
        reject(error);
      }, timeoutMs);
    });

    await Promise.race([sql.query('SELECT 1 AS ok'), timeout])
      .finally(() => clearTimeout(timeoutId));
    res.json({
      status: 'ready',
      ...basePayload(),
      checks: {
        database: {
          status: 'up',
          latencyMs: Date.now() - startedAt,
          timeoutMs
        }
      }
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logger.logWarning('Readiness check failed', {
      check: 'database',
      code: error.code || error.name,
      message: error.message,
      latencyMs,
      timeoutMs
    });

    res.status(503).json({
      status: 'not_ready',
      ...basePayload(),
      checks: {
        database: {
          status: 'down',
          latencyMs,
          timeoutMs,
          error: error.code || error.name || 'UNKNOWN_ERROR'
        }
      }
    });
  }
};

const getMetrics = (req, res) => {
  const expectedToken = process.env.METRICS_TOKEN || '';
  const authorization = req.get('Authorization') || '';
  const providedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : req.get('x-metrics-token') || '';

  if (expectedToken) {
    const expectedBuffer = Buffer.from(expectedToken);
    const providedBuffer = Buffer.from(providedToken);
    const tokenIsValid = expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!tokenIsValid) {
      res.status(403).json({
        success: false,
        message: 'Metrics token is required.'
      });
      return;
    }
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderPrometheusMetrics());
};

module.exports = {
  getLiveness,
  getReadiness,
  getMetrics
};
