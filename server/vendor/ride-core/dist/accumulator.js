"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsAccumulator = exports.DEFAULT_CONFIG = void 0;
const geo_1 = require("./geo");
exports.DEFAULT_CONFIG = {
    maxAccuracyM: 50,
    maxSpeedMps: 70, // ~252 km/h
    noiseFloorM: 3,
    accuracyNoiseFactor: 1,
    stopHoldS: 10,
    topSpeedWindowS: 5,
    maxGapS: 300,
    reanchorAfterRejects: 3,
};
/**
 * Feeds GPS fixes one at a time and keeps running ride stats.
 *
 * The app uses this for live numbers and the server replays the stored points through
 * the same class for the authoritative result, so both always agree.
 *
 * Rules:
 *  - Fixes with bad accuracy, invalid coordinates or non-increasing time are ignored.
 *  - A fix that implies an impossible speed is a GPS jump and is ignored.
 *  - Movement is measured from the last accepted anchor, not fix to fix, so a stationary
 *    phone whose fix wanders inside its noise radius never accumulates distance.
 *  - Nothing is counted across a pause (new segment) or a silence longer than maxGapS.
 */
class StatsAccumulator {
    constructor(config = {}) {
        this.distanceM = 0;
        this.movingTimeS = 0;
        this.closedElapsedS = 0;
        this.topSpeedMps = 0;
        this.accepted = 0;
        this.rejected = 0;
        // current segment state
        this.anchor = null;
        this.prevValid = null;
        this.pending = [];
        this.candidateStartT = 0;
        this.lastCommitT = null;
        this.segmentFirstT = null;
        this.lastSeenT = null;
        this.rejectStreak = 0;
        this.marks = [];
        this.cumM = 0;
        this.cfg = { ...exports.DEFAULT_CONFIG, ...config };
    }
    /** Call on resume (and before the very first fix, which is optional). Closes the previous segment. */
    startSegment() {
        this.closeSegment();
    }
    /** Call on pause. Safe to call repeatedly. */
    endSegment() {
        this.closeSegment();
    }
    add(p) {
        if (!(0, geo_1.isValidCoordinate)(p.lat, p.lng) || !Number.isFinite(p.t))
            return this.reject();
        if (p.accuracy != null && (!(p.accuracy >= 0) || p.accuracy > this.cfg.maxAccuracyM))
            return this.reject();
        // Time must move forward within a segment.
        if (this.lastSeenT != null && p.t <= this.lastSeenT)
            return this.reject();
        if (!this.anchor || !this.prevValid) {
            this.reanchor(p);
            this.segmentFirstT = p.t;
            return;
        }
        const dtPrevS = (p.t - this.prevValid.t) / 1000;
        // Signal lost for too long: unknowable, so start over without counting anything.
        if (dtPrevS > this.cfg.maxGapS) {
            this.reanchor(p);
            return;
        }
        // A jump is judged hop to hop (last valid fix to this one); the anchor can be far behind
        // after a stop or a tunnel and would make a normal fix look impossible.
        const hop = (0, geo_1.haversineM)(this.prevValid.lat, this.prevValid.lng, p.lat, p.lng);
        if (hop / dtPrevS > this.cfg.maxSpeedMps) {
            this.rejectStreak++;
            if (this.rejectStreak >= this.cfg.reanchorAfterRejects) {
                // The anchor itself was probably the bad fix. Start over from here.
                this.reanchor(p);
                return;
            }
            return this.reject();
        }
        this.rejectStreak = 0;
        const d = (0, geo_1.haversineM)(this.anchor.lat, this.anchor.lng, p.lat, p.lng);
        // Valid fix: time passes for elapsed even if the rider has not moved.
        const prev = this.prevValid;
        this.prevValid = p;
        this.lastSeenT = p.t;
        this.accepted++;
        const accA = this.anchor.accuracy ?? 0;
        const accB = p.accuracy ?? 0;
        const noise = Math.max(this.cfg.noiseFloorM, this.cfg.accuracyNoiseFactor * Math.max(accA, accB));
        if (d < noise) {
            // Inside the noise radius: still stationary. The anchor stays put so slow real
            // movement accumulates until it clears the radius.
            this.pending = [];
            return;
        }
        if (this.pending.length === 0)
            this.candidateStartT = prev.t;
        this.pending.push(p);
        const wasMoving = this.lastCommitT != null && p.t - this.lastCommitT <= this.cfg.stopHoldS * 1000;
        if (!wasMoving && this.pending.length < 2)
            return; // wait for confirmation
        // Commit: distance follows the path through every held fix, not the straight chord.
        let path = 0;
        let from = this.anchor;
        for (const q of this.pending) {
            path += (0, geo_1.haversineM)(from.lat, from.lng, q.lat, q.lng);
            from = q;
        }
        const movingFromT = wasMoving ? this.lastCommitT : this.candidateStartT;
        this.distanceM += path;
        this.movingTimeS += (p.t - movingFromT) / 1000;
        this.cumM += path;
        this.anchor = p;
        this.pending = [];
        this.lastCommitT = p.t;
        this.marks.push({ t: p.t, cumM: this.cumM });
        this.updateTopSpeed(p.t);
    }
    snapshot() {
        const openElapsed = this.segmentFirstT != null && this.lastSeenT != null ? (this.lastSeenT - this.segmentFirstT) / 1000 : 0;
        const avg = this.movingTimeS > 0 ? this.distanceM / this.movingTimeS : 0;
        // A ride shorter than the top-speed window has no window; fall back to its average.
        const top = this.topSpeedMps > 0 ? this.topSpeedMps : avg;
        return {
            distanceM: this.distanceM,
            movingTimeS: this.movingTimeS,
            elapsedTimeS: this.closedElapsedS + openElapsed,
            topSpeedMps: Math.min(top, this.cfg.maxSpeedMps),
            avgSpeedMps: avg,
            pointsAccepted: this.accepted,
            pointsRejected: this.rejected,
        };
    }
    reject() {
        this.rejected++;
    }
    reanchor(p) {
        this.anchor = p;
        this.prevValid = p;
        this.pending = [];
        this.lastCommitT = null;
        this.lastSeenT = p.t;
        this.marks = [{ t: p.t, cumM: this.cumM }];
        this.rejectStreak = 0;
        this.accepted++;
    }
    closeSegment() {
        if (this.segmentFirstT != null && this.lastSeenT != null) {
            this.closedElapsedS += (this.lastSeenT - this.segmentFirstT) / 1000;
        }
        this.anchor = null;
        this.prevValid = null;
        this.pending = [];
        this.lastCommitT = null;
        this.segmentFirstT = null;
        this.lastSeenT = null;
        this.rejectStreak = 0;
        this.marks = [];
        this.cumM = 0;
    }
    updateTopSpeed(nowT) {
        const windowMs = this.cfg.topSpeedWindowS * 1000;
        // Latest mark that is at least one window old.
        let start = null;
        for (let i = this.marks.length - 1; i >= 0; i--) {
            const m = this.marks[i];
            if (nowT - m.t >= windowMs) {
                start = m;
                break;
            }
        }
        if (!start)
            return;
        const last = this.marks[this.marks.length - 1];
        const speed = (last.cumM - start.cumM) / ((nowT - start.t) / 1000);
        if (speed > this.topSpeedMps)
            this.topSpeedMps = speed;
        // Keep only what a future window can still need.
        const keepFrom = nowT - windowMs * 2;
        if (this.marks.length > 64 && this.marks[0].t < keepFrom) {
            const idx = this.marks.findIndex((m) => m.t >= keepFrom);
            if (idx > 0)
                this.marks = this.marks.slice(idx - 1);
        }
    }
}
exports.StatsAccumulator = StatsAccumulator;
