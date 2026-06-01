const crypto = require('crypto');
const KioskStatus = require('../../models/kioskStatus.model.js');
const logger = require('../../utils/logger.js');

const KIOSK_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const trimToLength = (value, maxLength) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
};

exports.report = async (req, res) => {
  const requiredToken = process.env.KIOSK_STATUS_TOKEN;
  if (requiredToken) {
    const authorization = req.get('authorization') || '';
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
    const providedToken = req.get('x-kiosk-status-token') || bearerToken;

    const requiredBuffer = Buffer.from(requiredToken);
    const providedBuffer = Buffer.from(providedToken);
    const tokenIsValid = requiredBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(requiredBuffer, providedBuffer);

    if (!tokenIsValid) {
      return res.status(403).json({ message: 'Invalid kiosk status token.' });
    }
  }

  const kioskId = trimToLength(req.body.kioskId ?? req.body.kiosk_id, 100);
  const rawStatus = req.body.status === undefined || req.body.status === null || req.body.status === ''
    ? 'ONLINE'
    : req.body.status;
  const status = trimToLength(rawStatus, 50);

  if (!kioskId || !KIOSK_ID_PATTERN.test(kioskId)) {
    return res.status(400).json({ message: 'kioskId must be 1-100 characters using letters, numbers, dot, underscore, or hyphen.' });
  }

  if (!KioskStatus.STATUS_VALUES.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${KioskStatus.STATUS_VALUES.join(', ')}` });
  }

  try {
    const savedStatus = await KioskStatus.upsert({
      kiosk_id: kioskId,
      label: trimToLength(req.body.label, 255),
      status,
      app_version: trimToLength(req.body.appVersion ?? req.body.app_version, 100),
      ip_address: trimToLength(req.ip, 45),
      user_agent: trimToLength(req.get('user-agent'), 512)
    });

    res.json({
      success: true,
      data: savedStatus
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Public kiosk status report' });
    res.status(500).json({ message: '키오스크 상태 저장 중 오류가 발생했습니다.' });
  }
};
