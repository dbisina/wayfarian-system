// server/utils/logSanitizer.js

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'authorization',
  'idtoken',
  'refreshtoken',
  'accesstoken',
  'privatekey',
  'apikey',
  'email',
  'emailaddress',
  'useremail',
]);

const COORDINATE_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'startlatitude',
  'startlongitude',
  'currentlatitude',
  'currentlongitude',
  'lastlatitude',
  'lastlongitude',
  'endlatitude',
  'endlongitude',
]);

const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const REDACTED_COORDINATE = '[REDACTED_COORDINATE]';

const normalizeKey = (key) => {
  if (!key) {
    return '';
  }

  return key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const shouldRedactValue = (key, value) => {
  const normalizedKey = normalizeKey(key);

  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return REDACTED;
  }

  if (COORDINATE_KEYS.has(normalizedKey)) {
    return REDACTED_COORDINATE;
  }

  if (normalizedKey.includes('email')) {
    return REDACTED_EMAIL;
  }

  if (typeof value === 'string' && EMAIL_REGEX.test(value)) {
    return REDACTED_EMAIL;
  }

  return null;
};

const sanitizeValue = (value, key, visited) => {
  if (value === null || value === undefined) {
    return value;
  }

  const redaction = shouldRedactValue(key, value);
  if (redaction) {
    return redaction;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return REDACTED;
  }

  if (visited.has(value)) {
    return REDACTED;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, visited));
  }

  const sanitized = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    sanitized[childKey] = sanitizeValue(childValue, childKey, visited);
  }

  visited.delete(value);
  return sanitized;
};

const sanitizeLogData = (data) => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    const redaction = shouldRedactValue(null, data);
    return redaction || data;
  }

  const visited = new WeakSet();
  return sanitizeValue(data, null, visited);
};

module.exports = {
  sanitizeLogData,
};
