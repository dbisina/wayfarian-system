// app/v2/rideController.ts
//
// The commands the UI uses to run a ride. Keeps screens free of tracking details: start, pause,
// resume and end each do the recorder step and the matching GPS step in the right order.

import { getRuntime, ensureRestored } from './runtime';
import { getTrackingPermission, requestTrackingPermission, startTracking, stopTracking } from './locationEngine';

export type StartResult = { ok: true; rideId: string } | { ok: false; reason: 'permission' | 'in_progress' };

export async function startRide(opts: { vehicleId?: string; vehicleType?: string; title?: string; groupRideId?: string } = {}): Promise<StartResult> {
  const rt = getRuntime();
  await ensureRestored();
  if (rt.recorder.live() && rt.recorder.live()!.status !== 'ENDED') return { ok: false, reason: 'in_progress' };

  let perm = await getTrackingPermission();
  if (!perm.foreground) perm = await requestTrackingPermission();
  if (!perm.foreground) return { ok: false, reason: 'permission' };

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rideId = await rt.recorder.start({ vehicleId: opts.vehicleId, title: opts.title, timezone, groupRideId: opts.groupRideId });
  await startTracking({ vehicleType: opts.vehicleType });
  rt.emitLive(rt.recorder.live());
  return { ok: true, rideId };
}

export async function pauseRide(): Promise<void> {
  const rt = getRuntime();
  await stopTracking(); // nothing is recorded, and the battery is not used, while paused
  rt.emitLive(await rt.recorder.pause());
}

export async function resumeRide(vehicleType?: string): Promise<void> {
  const rt = getRuntime();
  rt.emitLive(await rt.recorder.resume());
  await startTracking({ vehicleType });
}

export async function endRide(): Promise<string | null> {
  const rt = getRuntime();
  await stopTracking();
  const rideId = rt.recorder.currentRideId();
  const final = await rt.recorder.end();
  rt.emitLive(final);
  return final ? rideId : null;
}

/** Call at app start: if the app died mid-ride, pick the ride back up and resume GPS. */
export async function recoverRide(): Promise<boolean> {
  const rt = getRuntime();
  await ensureRestored();
  const live = rt.recorder.live();
  if (!live || live.status === 'ENDED') return false;
  rt.emitLive(live);
  if (live.status === 'RECORDING') await startTracking();
  return true;
}
