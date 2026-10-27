// server/services/geo/speedLimit.js
// The posted speed limit at a spot, from OpenStreetMap's `maxspeed` tags via the public Overpass API.
// Free, but fair-use only, so lookups are cached by ~110 m cell (a limit rarely changes) and rate
// limited. It never throws at the rider: when nothing is known the answer is { kmh: null } and the
// app simply hides the sign. OSM coverage of limits is patchy in some countries (Nigeria included).

const axios = require('axios');
const { TtlCache, cell } = require('./cache');
const { ProviderGuard } = require('./guard');
const { haversineKm } = require('./normalize');

// Public Overpass servers are often at capacity, so a lookup tries them in turn. OVERPASS_URL (comma
// separated) replaces the list, for a private server.
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const LOOKUP_BUDGET_MS = 12_000; // stop trying more servers after this long: the app gives up at 8 s anyway

const DAY = 24 * 60 * 60 * 1000;
const HIT_TTL = 7 * DAY;
const MISS_TTL = DAY;
const MPH_TO_KMH = 1.609344;

/** "100" → 100, "60 mph" → 97, "none" / "walk" / "NG:urban" / junk → null. */
function parseMaxspeed(raw) {
  const m = /^\s*(\d{1,3})(?:\s*(mph|km\/h|kph))?\s*$/i.exec(String(raw ?? '').split(';')[0]);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!(n >= 5 && n <= 200)) return null;
  return /mph/i.test(m[2] || '') ? Math.round(n * MPH_TO_KMH) : n;
}

/** The limit of the way whose middle is nearest the point, skipping ways with no usable limit. */
function pickLimit(elements, lat, lng) {
  let best = null;
  for (const el of elements || []) {
    const kmh = parseMaxspeed(el?.tags?.maxspeed);
    const c = el?.center;
    if (kmh == null || !c) continue;
    const d = haversineKm(lat, lng, c.lat, c.lon);
    if (!best || d < best.d) best = { d, kmh };
  }
  return best ? best.kmh : null;
}

const query = (lat, lng) =>
  `[out:json][timeout:6];way(around:25,${lat.toFixed(6)},${lng.toFixed(6)})[highway][maxspeed];out tags center 8;`;

class SpeedLimitService {
  constructor({ http, cache, guard, endpoint, endpoints } = {}) {
    const fromEnv = (process.env.OVERPASS_URL || '').split(',').map((u) => u.trim()).filter(Boolean);
    this.endpoints = endpoints || (endpoint ? [endpoint] : fromEnv.length ? fromEnv : DEFAULT_ENDPOINTS);
    this.http = http || axios.create({ timeout: 6000, headers: { 'User-Agent': 'Wayfarian-server (https://github.com/dbisina/wayfarian-system)' } });
    this.cache = cache || new TtlCache(5000);
    // One request a second and a rest after errors keeps us a polite guest on a free service.
    this.guard = guard || new ProviderGuard('overpass', { ratePerSec: 1, failThreshold: 4, coolOffMs: 120_000 });
  }

  async lookup(latitude, longitude) {
    const key = `sl:${cell(latitude, longitude, 3)}`;
    const result = await this.cache.wrap(key, MISS_TTL, async () => {
      if (this.guard.blockReason()) return undefined; // busy or resting: answer "unknown", remember nothing
      const body = `data=${encodeURIComponent(query(latitude, longitude))}`;
      const deadline = Date.now() + LOOKUP_BUDGET_MS;
      let lastError = null;
      for (const url of this.endpoints) {
        if (Date.now() > deadline) break;
        try {
          const res = await this.http.post(url, body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          this.guard.success();
          const found = { kmh: pickLimit(res?.data?.elements, latitude, longitude) };
          if (found.kmh != null) this.cache.set(key, found, HIT_TTL);
          return found;
        } catch (err) {
          lastError = err; // at capacity, rate limited or timed out: try the next server
        }
      }
      // Every server failed: that counts as one failure, so a short outage rests the service briefly.
      this.guard.failure({ code: lastError?.response?.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE', message: lastError?.message });
      return undefined;
    });
    return result ?? { kmh: null };
  }

  stats() {
    return { ...this.guard.stats(), cache: this.cache.stats() };
  }
}

const speedLimitService = new SpeedLimitService();

module.exports = { SpeedLimitService, speedLimitService, parseMaxspeed, pickLimit };
