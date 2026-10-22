import type { RidePoint, Segment } from '../types';

/** Deterministic PRNG so noisy traces are identical on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const ORIGIN = { lat: 6.45, lng: 3.4 }; // Lagos

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** A point `eastM` metres east and `northM` metres north of the origin. */
export function offset(eastM: number, northM: number) {
  return {
    lat: ORIGIN.lat + northM / M_PER_DEG_LAT,
    lng: ORIGIN.lng + eastM / mPerDegLng(ORIGIN.lat),
  };
}

export interface TraceOptions {
  startT?: number;
  /** Fixes per second. */
  hz?: number;
  /** Gaussian position noise (metres, per axis). */
  noiseM?: number;
  /** Reported accuracy (metres). */
  accuracy?: number;
  seed?: number;
  /** Where the trace begins, in metres east of the origin. */
  startEastM?: number;
  startNorthM?: number;
}

/** Straight eastward travel at a constant speed. */
export function straight(speedMps: number, durationS: number, o: TraceOptions = {}): Segment {
  const { startT = 0, hz = 1, noiseM = 0, accuracy = 5, seed = 1, startEastM = 0, startNorthM = 0 } = o;
  const rand = mulberry32(seed);
  const out: RidePoint[] = [];
  const n = Math.round(durationS * hz);
  for (let i = 0; i <= n; i++) {
    const tS = i / hz;
    const p = offset(
      startEastM + speedMps * tS + noiseM * gaussian(rand),
      startNorthM + noiseM * gaussian(rand)
    );
    out.push({ ...p, t: startT + tS * 1000, accuracy });
  }
  return out;
}

/** Standing still while the GPS fix wanders. */
export function stationary(durationS: number, o: TraceOptions = {}): Segment {
  return straight(0, durationS, o);
}

/** Join traces end to end in time; positions are whatever each trace says. */
export function concat(...parts: Segment[]): Segment {
  return parts.flat();
}
