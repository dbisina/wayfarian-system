// server/services/geo/guard.js
// Per-provider protection: a token bucket for the provider's rate limit, a daily credit budget, and a
// circuit breaker that rests a failing provider for a while. When a guard says no, the chain moves
// straight to the next provider instead of making the rider wait.

class ProviderGuard {
  /**
   * @param {string} name
   * @param {object} opts
   * @param {number} [opts.ratePerSec]  requests per second allowed (Infinity = no limit)
   * @param {number} [opts.dailyBudget] credits per UTC day (Infinity = no limit)
   * @param {number} [opts.failThreshold] failures inside `failWindowMs` that open the breaker
   * @param {number} [opts.failWindowMs]
   * @param {number} [opts.coolOffMs] how long an open breaker stays open
   */
  constructor(name, opts = {}) {
    this.name = name;
    this.ratePerSec = opts.ratePerSec ?? Infinity;
    this.tokens = this.ratePerSec;
    this.lastRefill = Date.now();
    this.dailyBudget = opts.dailyBudget ?? Infinity;
    this.failThreshold = opts.failThreshold ?? 5;
    this.failWindowMs = opts.failWindowMs ?? 60_000;
    this.coolOffMs = opts.coolOffMs ?? 60_000;
    this.failures = [];
    this.openUntil = 0;
    this.day = this.today();
    this.used = 0;
    this.calls = 0;
    this.errors = 0;
    this.warned = false;
  }

  today() {
    return new Date().toISOString().slice(0, 10);
  }

  rollDay() {
    const d = this.today();
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
      this.warned = false;
    }
  }

  refill() {
    if (!Number.isFinite(this.ratePerSec)) return;
    const now = Date.now();
    this.tokens = Math.min(this.ratePerSec, this.tokens + ((now - this.lastRefill) / 1000) * this.ratePerSec);
    this.lastRefill = now;
  }

  /** Why this provider can't take a request right now, or null if it can. Takes a token when it can. */
  blockReason(credits = 1) {
    this.rollDay();
    if (Date.now() < this.openUntil) return 'circuit_open';
    if (this.used + credits > this.dailyBudget) return 'budget';
    this.refill();
    if (this.tokens < 1) return 'rate';
    this.tokens -= 1;
    return null;
  }

  success(credits = 1) {
    this.calls++;
    this.used += credits;
    if (!this.warned && Number.isFinite(this.dailyBudget) && this.used >= this.dailyBudget * 0.8) {
      this.warned = true;
      console.warn(`[geo] ${this.name} has used ${this.used}/${this.dailyBudget} credits today`);
    }
  }

  failure(err) {
    this.calls++;
    this.errors++;
    // A provider that rejects the key or the quota will keep doing so; rest it straight away.
    const hard = err?.code === 'RATE_LIMITED' || err?.code === 'DENIED';
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < this.failWindowMs);
    this.failures.push(now);
    if (hard || this.failures.length >= this.failThreshold) {
      this.openUntil = now + this.coolOffMs;
      this.failures = [];
      console.warn(`[geo] ${this.name} paused for ${this.coolOffMs / 1000}s after ${err?.code || 'errors'}: ${err?.message || ''}`);
    }
  }

  stats() {
    this.rollDay();
    return {
      day: this.day,
      creditsUsed: this.used,
      dailyBudget: Number.isFinite(this.dailyBudget) ? this.dailyBudget : null,
      calls: this.calls,
      errors: this.errors,
      paused: Date.now() < this.openUntil,
    };
  }
}

module.exports = { ProviderGuard };
