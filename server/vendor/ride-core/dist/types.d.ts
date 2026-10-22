/**
 * Units used everywhere inside ride-core: metres, seconds, metres per second.
 * Convert to km / km/h / mph only at the UI edge (see units.ts).
 */
export interface RidePoint {
    lat: number;
    lng: number;
    /** Device timestamp in milliseconds since the epoch. */
    t: number;
    /** Horizontal accuracy in metres, when the device reports it. */
    accuracy?: number | null;
}
/** Points recorded between one start/resume and the next pause/stop. Nothing is counted across segments. */
export type Segment = RidePoint[];
export interface RideConfig {
    /** Fixes worse than this (metres) are ignored. */
    maxAccuracyM: number;
    /** Anything faster is treated as a GPS jump and ignored (m/s). */
    maxSpeedMps: number;
    /** A fix must move at least this far from the last accepted fix to count as movement (metres). */
    noiseFloorM: number;
    /** ...or this multiple of the larger of the two accuracies, whichever is bigger. */
    accuracyNoiseFactor: number;
    /** Top speed is the best average over a window of this many seconds, so one lucky fix cannot set it. */
    topSpeedWindowS: number;
    /** A silence longer than this (seconds) is "signal lost": nothing is counted across it. */
    maxGapS: number;
    /**
     * Movement is only believed once it is confirmed by a second fix beyond the noise radius,
     * unless the rider was already moving within this many seconds.
     */
    stopHoldS: number;
    /** After this many consecutive jump rejections the next fix becomes the new anchor. */
    reanchorAfterRejects: number;
}
export interface RideStats {
    distanceM: number;
    /** Time spent actually moving, pauses and stops excluded. */
    movingTimeS: number;
    /** Time from first to last fix of each segment, summed. Pauses excluded, stops included. */
    elapsedTimeS: number;
    /** Sustained top speed over the configured window. */
    topSpeedMps: number;
    /** distance / movingTime */
    avgSpeedMps: number;
    pointsAccepted: number;
    pointsRejected: number;
}
