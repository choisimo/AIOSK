const startTimeMs = Date.now();
const HTTP_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const httpSeries = new Map();

const labelSet = (labels) => Object.entries(labels)
  .map(([key, value]) => `${key}="${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')}"`)
  .join(',');

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route && req.route.path
      ? `${req.baseUrl || ''}${req.route.path}`.replace(/\/+$/, '') || '/'
      : 'unmatched';
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    const key = [req.method, route, statusClass].join('|');

    if (!httpSeries.has(key)) {
      httpSeries.set(key, {
        method: req.method,
        route,
        statusClass,
        count: 0,
        sum: 0,
        buckets: HTTP_DURATION_BUCKETS_SECONDS.map(() => 0)
      });
    }

    const series = httpSeries.get(key);
    series.count += 1;
    series.sum += durationSeconds;

    HTTP_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) {
        series.buckets[index] += 1;
      }
    });
  });

  next();
};

const renderPrometheusMetrics = () => {
  const memory = process.memoryUsage();
  const lines = [
    '# HELP aiosk_process_uptime_seconds Process uptime in seconds.',
    '# TYPE aiosk_process_uptime_seconds gauge',
    `aiosk_process_uptime_seconds ${Math.floor((Date.now() - startTimeMs) / 1000)}`,
    '# HELP aiosk_process_memory_bytes Process memory usage by type.',
    '# TYPE aiosk_process_memory_bytes gauge'
  ];

  Object.entries(memory).forEach(([type, bytes]) => {
    lines.push(`aiosk_process_memory_bytes{${labelSet({ type })}} ${bytes}`);
  });

  lines.push(
    '# HELP aiosk_http_requests_total HTTP requests by method, route, and status class.',
    '# TYPE aiosk_http_requests_total counter',
    '# HELP aiosk_http_request_duration_seconds HTTP request duration histogram.',
    '# TYPE aiosk_http_request_duration_seconds histogram'
  );

  Array.from(httpSeries.values())
    .sort((a, b) => `${a.method} ${a.route} ${a.statusClass}`.localeCompare(`${b.method} ${b.route} ${b.statusClass}`))
    .forEach((series) => {
      const baseLabels = {
        method: series.method,
        route: series.route,
        status_class: series.statusClass
      };

      lines.push(`aiosk_http_requests_total{${labelSet(baseLabels)}} ${series.count}`);

      HTTP_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        lines.push(`aiosk_http_request_duration_seconds_bucket{${labelSet({ ...baseLabels, le: bucket })}} ${series.buckets[index]}`);
      });
      lines.push(`aiosk_http_request_duration_seconds_bucket{${labelSet({ ...baseLabels, le: '+Inf' })}} ${series.count}`);
      lines.push(`aiosk_http_request_duration_seconds_sum{${labelSet(baseLabels)}} ${series.sum}`);
      lines.push(`aiosk_http_request_duration_seconds_count{${labelSet(baseLabels)}} ${series.count}`);
    });

  return lines.join('\n') + '\n';
};

module.exports = {
  metricsMiddleware,
  renderPrometheusMetrics
};
