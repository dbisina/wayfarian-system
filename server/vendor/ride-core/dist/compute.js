"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRideStats = computeRideStats;
const accumulator_1 = require("./accumulator");
/**
 * Authoritative stats for a whole ride. Each segment is the stretch between a start/resume
 * and the next pause/stop; nothing is counted between segments.
 */
function computeRideStats(segments, config = {}) {
    const acc = new accumulator_1.StatsAccumulator(config);
    for (const segment of segments) {
        acc.startSegment();
        // Sort defensively: late or out-of-order uploads must not change the result.
        const ordered = [...segment].sort((a, b) => a.t - b.t);
        for (const p of ordered)
            acc.add(p);
        acc.endSegment();
    }
    return acc.snapshot();
}
