import type { RideConfig, RidePoint, RideStats } from './types';
export declare const DEFAULT_CONFIG: RideConfig;
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
export declare class StatsAccumulator {
    private readonly cfg;
    private distanceM;
    private movingTimeS;
    private closedElapsedS;
    private topSpeedMps;
    private accepted;
    private rejected;
    private anchor;
    private prevValid;
    private pending;
    private candidateStartT;
    private lastCommitT;
    private segmentFirstT;
    private lastSeenT;
    private rejectStreak;
    private marks;
    private cumM;
    constructor(config?: Partial<RideConfig>);
    /** Call on resume (and before the very first fix, which is optional). Closes the previous segment. */
    startSegment(): void;
    /** Call on pause. Safe to call repeatedly. */
    endSegment(): void;
    add(p: RidePoint): void;
    snapshot(): RideStats;
    private reject;
    private reanchor;
    private closeSegment;
    private updateTopSpeed;
}
