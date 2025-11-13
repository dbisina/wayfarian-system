// server/middleware/authorization.js
// Additional authorization helpers for privileged endpoints

const logger = require('../services/Logger');

const parseList = (raw) =>
  (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const operatorIds = parseList(process.env.SYSTEM_OPERATOR_IDS);
const operatorEmails = parseList(process.env.SYSTEM_OPERATOR_EMAILS).map((email) => email.toLowerCase());
const isProduction = (process.env.NODE_ENV || 'development') === 'production';

const isOperator = (user) => {
  if (!user) {
    return false;
  }

  if (operatorIds.length > 0 && operatorIds.includes(user.id)) {
    return true;
  }

  if (user.email && operatorEmails.includes(user.email.toLowerCase())) {
    return true;
  }

  // In non-production environments, allow access when no allowlist configured to reduce friction
  if (!isProduction && operatorIds.length === 0 && operatorEmails.length === 0) {
    return true;
  }

  return false;
};

const requireOperator = (req, res, next) => {
  if (isOperator(req.user)) {
    return next();
  }

  logger.security('Operator access denied', {
    path: req.originalUrl,
    userId: req.user?.id,
    email: req.user?.email ? '[REDACTED]' : undefined,
    ip: req.ip,
  });

  return res.status(403).json({
    error: 'Forbidden',
    message: 'You do not have permission to access this resource.',
  });
};

module.exports = {
  requireOperator,
  isOperator,
};
