import type { RideConfig, RideStats, Segment } from './types';
/**
 * Authoritative stats for a whole ride. Each segment is the stretch between a start/resume
 * and the next pause/stop; nothing is counted between segments.
 */
export declare function computeRideStats(segments: Segment[], config?: Partial<RideConfig>): RideStats;
