const router = require('express').Router();
const health = require('../controllers/health.controller');

/**
 * @swagger
 * /healthz:
 *   get:
 *     summary: Liveness probe
 *     description: Returns process-level liveness without checking external dependencies.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Process is alive.
 */
router.get('/healthz', health.getLiveness);

/**
 * @swagger
 * /readyz:
 *   get:
 *     summary: Readiness probe
 *     description: Returns service readiness after checking database connectivity.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is ready to receive traffic.
 *       503:
 *         description: Service dependency is unavailable.
 */
router.get('/readyz', health.getReadiness);

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Returns process and HTTP request metrics in Prometheus text format. If METRICS_TOKEN is configured, x-metrics-token or Authorization Bearer token is required. Production runtime requires METRICS_TOKEN or explicit ALLOW_OPEN_METRICS=true.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Prometheus metrics payload.
 *       403:
 *         description: Metrics token is missing or invalid.
 */
router.get('/metrics', health.getMetrics);

module.exports = (app) => {
  app.use(router);
};
