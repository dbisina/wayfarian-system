import { StatsAccumulator } from './accumulator';
import type { RideConfig, RideStats, Segment } from './types';

/**
 * Authoritative stats for a whole ride. Each segment is the stretch between a start/resume
 * and the next pause/stop; nothing is counted between segments.
 */
export function computeRideStats(segments: Segment[], config: Partial<RideConfig> = {}): RideStats {
  const acc = new StatsAccumulator(config);
  for (const segment of segments) {
    acc.startSegment();
    // Sort defensively: late or out-of-order uploads must not change the result.
    const ordered = [...segment].sort((a, b) => a.t - b.t);
    for (const p of ordered) acc.add(p);
    acc.endSegment();
  }
  return acc.snapshot();
}
