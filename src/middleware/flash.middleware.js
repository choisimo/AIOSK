const FLASH_SESSION_KEY = 'flash';

const createFlashMiddleware = () => (req, res, next) => {
  req.flash = function flash(type, message) {
    const key = String(type || '');
    if (!key) return [];

    if (arguments.length < 2) {
      if (!req.session) {
        throw new Error('Flash middleware requires session middleware.');
      }

      const bucket = req.session[FLASH_SESSION_KEY];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return [];

      const messages = Array.isArray(bucket[key]) ? bucket[key] : [];
      delete bucket[key];
      if (Object.keys(bucket).length === 0) {
        delete req.session[FLASH_SESSION_KEY];
      }
      return messages;
    }

    if (!req.session) {
      throw new Error('Flash middleware requires session middleware.');
    }

    if (!req.session[FLASH_SESSION_KEY] || typeof req.session[FLASH_SESSION_KEY] !== 'object' || Array.isArray(req.session[FLASH_SESSION_KEY])) {
      req.session[FLASH_SESSION_KEY] = {};
    }

    const bucket = req.session[FLASH_SESSION_KEY];
    const messages = (Array.isArray(message) ? message : [message]).map(entry => String(entry));
    bucket[key] = (Array.isArray(bucket[key]) ? bucket[key] : []).concat(messages);
    return bucket[key].length;
  };

  next();
};

module.exports = {
  createFlashMiddleware
};
