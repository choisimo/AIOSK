const KioskStatus = require('../../models/kioskStatus.model.js');
const logger = require('../../utils/logger.js');

exports.findAll = async (req, res) => {
  try {
    const rawLimit = typeof req.query.limit === 'string' ? req.query.limit.trim() : '';
    const parsedLimit = /^[1-9][0-9]*$/.test(rawLimit) ? Number(rawLimit) : null;
    const limit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 100;

    const [summary, kiosks] = await Promise.all([
      KioskStatus.getSummary(),
      KioskStatus.getAll({ limit })
    ]);

    res.json({
      success: true,
      count: kiosks.length,
      summary,
      data: kiosks
    });
  } catch (error) {
    logger.logError(error, req, { context: 'Admin kiosk status query' });
    res.status(500).json({
      success: false,
      message: '키오스크 상태 조회 중 오류가 발생했습니다.'
    });
  }
};
