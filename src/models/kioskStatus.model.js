const sql = require('./db.js');

const STATUS_VALUES = ['ONLINE', 'DEGRADED', 'MAINTENANCE', 'OFFLINE'];
const DEFAULT_OFFLINE_AFTER_SECONDS = 120;
const KIOSK_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const normalizeTextField = (value, maxLength, fieldName) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }

  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
};

const normalizeStatus = (value) => {
  const status = normalizeTextField(value, 50, 'status');
  if (!STATUS_VALUES.includes(status)) {
    throw new Error(`status must be one of: ${STATUS_VALUES.join(', ')}`);
  }
  return status;
};

const normalizeRow = (row) => {
  const ageSeconds = row.age_seconds === null || row.age_seconds === undefined
    ? null
    : Number(row.age_seconds);
  const derivedStatus = ageSeconds !== null && ageSeconds > DEFAULT_OFFLINE_AFTER_SECONDS ? 'OFFLINE' : row.status;

  return {
    id: row.id,
    kioskId: row.kiosk_id,
    label: row.label,
    status: derivedStatus,
    reportedStatus: row.status,
    appVersion: row.app_version,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    lastSeenAt: row.last_seen_at,
    ageSeconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const KioskStatus = {};

KioskStatus.STATUS_VALUES = STATUS_VALUES;

KioskStatus.upsert = async (statusData) => {
  const kioskId = normalizeTextField(statusData.kiosk_id, 100, 'kiosk_id');
  if (!kioskId || !KIOSK_ID_PATTERN.test(kioskId)) {
    throw new Error('kiosk_id must be 1-100 characters using letters, numbers, dot, underscore, or hyphen.');
  }
  const status = normalizeStatus(statusData.status);

  const payload = {
    kiosk_id: kioskId,
    label: normalizeTextField(statusData.label, 255, 'label'),
    status,
    app_version: normalizeTextField(statusData.app_version, 100, 'app_version'),
    ip_address: normalizeTextField(statusData.ip_address, 45, 'ip_address'),
    user_agent: normalizeTextField(statusData.user_agent, 512, 'user_agent')
  };

  await sql.execute(
    `INSERT INTO KioskStatuses
      (kiosk_id, label, status, app_version, ip_address, user_agent, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       status = VALUES(status),
       app_version = VALUES(app_version),
       ip_address = VALUES(ip_address),
       user_agent = VALUES(user_agent),
       last_seen_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [
      payload.kiosk_id,
      payload.label,
      payload.status,
      payload.app_version,
      payload.ip_address,
      payload.user_agent
    ]
  );

  const [rows] = await sql.execute(
    `SELECT *,
        TIMESTAMPDIFF(SECOND, last_seen_at, CURRENT_TIMESTAMP) as age_seconds
     FROM KioskStatuses
     WHERE kiosk_id = ?`,
    [payload.kiosk_id]
  );

  return rows.length ? normalizeRow(rows[0]) : null;
};

KioskStatus.getAll = async (options = {}) => {
  const rawLimit = typeof options.limit === 'string' ? options.limit.trim() : '';
  const normalizedLimit = typeof options.limit === 'number'
    ? options.limit
    : (/^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null);
  const limit = Number.isSafeInteger(normalizedLimit) && normalizedLimit > 0 ? Math.min(normalizedLimit, 500) : 100;
  const [rows] = await sql.execute(
    `SELECT *,
        TIMESTAMPDIFF(SECOND, last_seen_at, CURRENT_TIMESTAMP) as age_seconds
     FROM KioskStatuses
     ORDER BY last_seen_at DESC
     LIMIT ${limit}`
  );

  return rows.map(normalizeRow);
};

KioskStatus.getSummary = async () => {
  const kiosks = await KioskStatus.getAll({
    limit: 500
  });

  return kiosks.reduce((summary, kiosk) => {
    summary.total += 1;
    summary[kiosk.status.toLowerCase()] = (summary[kiosk.status.toLowerCase()] || 0) + 1;
    if (!summary.lastSeenAt || (kiosk.lastSeenAt && kiosk.lastSeenAt > summary.lastSeenAt)) {
      summary.lastSeenAt = kiosk.lastSeenAt;
    }
    return summary;
  }, {
    total: 0,
    online: 0,
    degraded: 0,
    maintenance: 0,
    offline: 0,
    lastSeenAt: null
  });
};

module.exports = KioskStatus;
