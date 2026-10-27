// server/services/geo/cache.js
// Small in-memory TTL cache for map lookups. Places, routes and addresses repeat a lot (same area,
// same fuel stations), so most requests never reach a paid provider. Identical requests that arrive
// while one is already in flight share its promise instead of calling the provider twice.

class TtlCache {
  constructor(maxEntries = 5000) {
    this.max = maxEntries;
    this.map = new Map();
    this.inflight = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Re-insert so the Map's order doubles as least-recently-used order.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }

  /** Returns the cached value, or runs `load` once for all concurrent callers and caches the result. */
  async wrap(key, ttlMs, load) {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.hits++;
      return cached;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    this.misses++;
    const p = (async () => {
      try {
        const value = await load();
        if (value !== undefined && value !== null) this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  stats() {
    const total = this.hits + this.misses;
    return { entries: this.map.size, hits: this.hits, misses: this.misses, hitRate: total ? +(this.hits / total).toFixed(3) : 0 };
  }
}

/** Rounds a coordinate to a grid cell so riders a few hundred metres apart share one cache entry. */
const cell = (lat, lng, decimals = 3) => `${Number(lat).toFixed(decimals)},${Number(lng).toFixed(decimals)}`;

module.exports = { TtlCache, cell };
