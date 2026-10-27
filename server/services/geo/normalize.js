// server/services/geo/normalize.js
// Shared pieces for every provider: one error type the chain understands, and the helpers that let
// each provider return exactly the shapes the app already reads, so switching providers is invisible.

/**
 * code: NOT_CONFIGURED | DENIED | RATE_LIMITED | NO_RESULTS | UNAVAILABLE
 * NO_RESULTS is an answer, not a failure: the chain may still ask the next provider, but it never
 * counts against the provider's health.
 */
class GeoError extends Error {
  constructor(code, message, providerStatus) {
    super(message);
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

/** Maps an HTTP / provider status onto a GeoError code. */
function codeForStatus(status) {
  const s = String(status ?? '');
  if (s === 'ZERO_RESULTS' || s === 'NOT_FOUND' || s === '404') return 'NO_RESULTS';
  if (s === 'OVER_QUERY_LIMIT' || s === 'OVER_DAILY_LIMIT' || s === '429') return 'RATE_LIMITED';
  if (s === 'REQUEST_DENIED' || s === '401' || s === '403') return 'DENIED';
  return 'UNAVAILABLE';
}

/** Wraps an axios / network error as a GeoError. */
function fromAxios(provider, err) {
  if (err instanceof GeoError) return err;
  const status = err?.response?.status;
  const code = status ? codeForStatus(status) : 'UNAVAILABLE';
  return new GeoError(code, `${provider}: ${status || err?.code || err?.message || 'request failed'}`, status);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Google encoded-polyline format (precision 5), which the app already decodes. */
function encodePolyline(points) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.latitude * 1e5);
    const lng = Math.round(p.longitude * 1e5);
    out += enc(lat - pLat) + enc(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

function decodePolyline(encoded) {
  const path = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    path.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return path;
}

const formatKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const formatMin = (s) => {
  const min = Math.max(1, Math.round(s / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

module.exports = { GeoError, codeForStatus, fromAxios, haversineKm, encodePolyline, decodePolyline, formatKm, formatMin };
