// app/services/backgroundTaskService.ts
// Background location tracking with persistent notifications for journey continuation.
//
// STORAGE ARCHITECTURE — why two AsyncStorage keys:
//
// A naïve approach stores everything (route arrays + stats) in one JSON blob written on
// every GPS fix (every 5 s). For a 7-hour ride that means 5,040 writes × ~175 KB = 882 MB
// of SQLite I/O. The WAL file grows without bound, each write takes longer than the last,
// Android eventually kills the background task for missing its deadline, and the journey
// "crashes" with no log entry.
//
// Fix: split into HOT and COLD state.
//   HOT  (activeJourneyState)  — scalar stats + tiny pending-points buffer.
//                                Written every GPS fix  (~200 bytes → <1 MB / 7 h).
//   COLD (activeJourneyRoutes) — full route arrays (up to 2 000 pts + 500 raw buffer).
//                                Written every COLD_FLUSH_EVERY_N fixes (≈ 60 s) → ~88 MB / 7 h.
//
// Public API is unchanged: getPersistedJourneyState() merges both keys before returning.

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LiveNotificationService, { JourneyNotificationData } from './liveNotificationService';

// ─── Storage keys ────────────────────────────────────────────────────────────
const BACKGROUND_LOCATION_TASK = 'WAYFARIAN_BACKGROUND_LOCATION';
/** HOT key — scalar stats, written every GPS fix. */
const JOURNEY_STATE_KEY = 'activeJourneyState';
/** COLD key — route arrays, written every ~60 s. */
const JOURNEY_ROUTES_KEY = 'activeJourneyRoutes';
const SETTINGS_UNITS_KEY = 'settings.units';
const NOTIFICATION_ID = 'journey-tracking-notification';

// When the foreground smart-tracking loop is actively pushing notification updates,
// the background task skips its own notification write (but still persists stats)
// if foreground was active within this window.
const FG_NOTIFICATION_LEASE_KEY = 'wayfarian.fgNotificationLeaseAt';
const FG_LEASE_FRESHNESS_MS = 8000;

// ─── Configuration ────────────────────────────────────────────────────────────
const MIN_MOVEMENT_THRESHOLD_M = 10;
const MAX_REASONABLE_SPEED_MPS = 50.0; // ~180 km/h hard ceiling
const MAX_SPEED_FOR_RECORDING_MPS = 0.5;
const MAX_ROUTE_POINTS = 2000;
const MAX_RAW_BUFFER_POINTS = 500;

// Flush pending route points from hot state to cold state every N task invocations.
// At 5 s per invocation → flush every 60 s.
const COLD_FLUSH_EVERY_N = 12;
// Slightly more than one flush cycle as a safety margin.
const MAX_PENDING_ROUTE_POINTS = 15;
const MAX_PENDING_RAW_POINTS = 15;

const VEHICLE_MAX_SPEED_KMH: Record<string, number> = {
    car: 180,
    bike: 50,
    scooter: 80,
};

// ─── Internal types ───────────────────────────────────────────────────────────

/** Written every GPS fix — scalar stats only, stays tiny. */
interface JourneyHotState {
    journeyId: string;
    startTime: number;
    totalDistance: number;
    movingTime: number;
    topSpeed: number;
    vehicle?: 'car' | 'bike' | 'scooter';
    lastLatitude: number;
    lastLongitude: number;
    lastTimestamp: number;
    lastSpeed?: number;
    recentHighSpeeds?: number[];
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number;
    /** Running count of task invocations; triggers cold flush at N. */
    invocationCount: number;
    /** Route points accumulated since last cold flush. */
    pendingRoutePoints: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
    /** Raw points accumulated since last cold flush. */
    pendingRawPoints: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
}

/** Written every ~60 s — full route arrays. */
interface JourneyColdState {
    journeyId: string;
    routePoints: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
    rawPointsBuffer: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
}

// ─── Public type (backwards-compatible merged view) ───────────────────────────
export interface PersistedJourneyState {
    journeyId: string;
    startTime: number;
    totalDistance: number;
    movingTime: number;
    topSpeed: number;
    vehicle?: 'car' | 'bike' | 'scooter';
    lastLatitude: number;
    lastLongitude: number;
    lastTimestamp: number;
    lastSpeed?: number;
    recentHighSpeeds?: number[];
    routePoints: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
    rawPointsBuffer: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function getUnitsPreference(): Promise<'km' | 'mi'> {
    try {
        const units = await AsyncStorage.getItem(SETTINGS_UNITS_KEY);
        return units === 'mi' ? 'mi' : 'km';
    } catch {
        return 'km';
    }
}

/** Build notification from hot state (all required stats live there). */
async function updateTrackingNotification(hot: JourneyHotState): Promise<void> {
    try {
        // Yield to foreground when it's actively updating the notification.
        try {
            const leaseStr = await AsyncStorage.getItem(FG_NOTIFICATION_LEASE_KEY);
            if (leaseStr) {
                const leaseAt = parseInt(leaseStr, 10);
                if (Number.isFinite(leaseAt) && Date.now() - leaseAt < FG_LEASE_FRESHNESS_MS) return;
            }
        } catch {}

        const avgSpeed = hot.movingTime > 0 ? (hot.totalDistance / hot.movingTime) * 3600 : 0;

        let distanceRemaining = 0;
        let progress = 0;
        if (hot.destinationLatitude && hot.destinationLongitude) {
            distanceRemaining = calculateHaversineDistance(
                hot.lastLatitude, hot.lastLongitude,
                hot.destinationLatitude, hot.destinationLongitude,
            );
            if (hot.estimatedTotalDistance && hot.estimatedTotalDistance > 0) {
                progress = Math.min(hot.totalDistance / hot.estimatedTotalDistance, 1);
            }
        }

        const units = await getUnitsPreference();
        const notificationData: JourneyNotificationData = {
            journeyId: hot.journeyId,
            startTime: hot.startTime,
            totalDistance: hot.totalDistance,
            currentSpeed: (hot.lastSpeed || 0) * 3.6,
            avgSpeed,
            topSpeed: hot.topSpeed,
            movingTime: hot.movingTime,
            progress,
            distanceRemaining: distanceRemaining > 0 ? distanceRemaining : undefined,
            startLocationName: hot.startLocationName,
            destinationName: hot.destinationName,
            currentLatitude: hot.lastLatitude,
            currentLongitude: hot.lastLongitude,
            units,
        };

        await LiveNotificationService.updateNotification(notificationData);
    } catch (e) {
        console.warn('[BackgroundTask] Failed to update notification:', e);
        await fallbackToSimpleNotification(hot);
    }
}

async function fallbackToSimpleNotification(hot: JourneyHotState): Promise<void> {
    try {
        const elapsed = Math.floor((Date.now() - hot.startTime) / 1000);
        await Notifications.scheduleNotificationAsync({
            identifier: NOTIFICATION_ID,
            content: {
                title: 'Journey in Progress',
                body: `${hot.totalDistance.toFixed(2)} km • ${formatDuration(elapsed)}`,
                data: { type: 'JOURNEY_TRACKING', journeyId: hot.journeyId },
                sticky: true,
                sound: false,
            },
            trigger: null,
        });
    } catch {}
}

// ─── Background task definition ───────────────────────────────────────────────

TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK,
    async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
        if (error) {
            console.error('[BackgroundTask] Error:', error);
            return;
        }
        if (!data) return;

        const { locations } = data as { locations: Location.LocationObject[] };
        if (!locations || locations.length === 0) return;

        const location = locations[locations.length - 1];

        try {
            // ── Read HOT state only (~200 bytes) ──────────────────────────────
            const hotJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
            if (!hotJson) return; // Journey ended — state was cleared before stop

            const hot: JourneyHotState = JSON.parse(hotJson);

            // ── Process location ──────────────────────────────────────────────
            if (hot.lastLatitude && hot.lastLongitude) {
                const distanceKm = calculateHaversineDistance(
                    hot.lastLatitude, hot.lastLongitude,
                    location.coords.latitude, location.coords.longitude,
                );
                const distanceMeters = distanceKm * 1000;
                const timeDelta = (location.timestamp - hot.lastTimestamp) / 1000;
                const reportedSpeed = location.coords.speed || 0;
                const impliedSpeedMps = timeDelta > 0 ? distanceMeters / timeDelta : 0;
                const effectiveSpeedMps = reportedSpeed > 0 ? reportedSpeed : impliedSpeedMps;

                const isReasonableSpeed = impliedSpeedMps <= MAX_REASONABLE_SPEED_MPS;
                const hasSignificantMovement = distanceMeters > MIN_MOVEMENT_THRESHOLD_M;
                const isActuallyMoving = effectiveSpeedMps > MAX_SPEED_FOR_RECORDING_MPS;

                if (hasSignificantMovement && isReasonableSpeed && isActuallyMoving) {
                    hot.totalDistance += distanceKm;

                    // Validate speed
                    const validatedSpeedMps = Math.min(
                        Math.max(reportedSpeed, 0),
                        impliedSpeedMps > 0 ? impliedSpeedMps : reportedSpeed,
                    );
                    const speedKmh = Math.abs(validatedSpeedMps) * 3.6;

                    // Top speed — vehicle-aware cap + sustainment
                    if (!hot.recentHighSpeeds) hot.recentHighSpeeds = [];
                    const vehicleCapKmh = VEHICLE_MAX_SPEED_KMH[hot.vehicle || 'car'] ?? VEHICLE_MAX_SPEED_KMH.car;
                    if (speedKmh > vehicleCapKmh) {
                        hot.recentHighSpeeds = [];
                    } else if (speedKmh > hot.topSpeed * 0.5 || speedKmh > 20) {
                        hot.recentHighSpeeds.push(speedKmh);
                        if (hot.recentHighSpeeds.length > 5) hot.recentHighSpeeds.shift();
                        if (hot.recentHighSpeeds.length >= 3) {
                            const minR = Math.min(...hot.recentHighSpeeds);
                            const maxR = Math.max(...hot.recentHighSpeeds);
                            if (minR > maxR * 0.75 && speedKmh > hot.topSpeed) {
                                const sorted = [...hot.recentHighSpeeds].sort((a, b) => a - b);
                                const median = sorted[Math.floor(sorted.length / 2)];
                                hot.topSpeed = Math.min(vehicleCapKmh, Math.max(hot.topSpeed, median));
                            }
                        }
                    } else {
                        hot.recentHighSpeeds = [];
                    }

                    if (validatedSpeedMps > MAX_SPEED_FOR_RECORDING_MPS) {
                        hot.movingTime += timeDelta;
                    }
                    hot.lastSpeed = validatedSpeedMps;

                    // Accumulate pending route point (bounded buffer between cold flushes)
                    if (!hot.pendingRoutePoints) hot.pendingRoutePoints = [];
                    hot.pendingRoutePoints.push({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        timestamp: location.timestamp,
                        speed: reportedSpeed,
                    });
                    if (hot.pendingRoutePoints.length > MAX_PENDING_ROUTE_POINTS) {
                        hot.pendingRoutePoints = hot.pendingRoutePoints.slice(-MAX_PENDING_ROUTE_POINTS);
                    }

                    if (!hot.pendingRawPoints) hot.pendingRawPoints = [];
                    hot.pendingRawPoints.push({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        timestamp: location.timestamp,
                        speed: reportedSpeed,
                    });
                    if (hot.pendingRawPoints.length > MAX_PENDING_RAW_POINTS) {
                        hot.pendingRawPoints = hot.pendingRawPoints.slice(-MAX_PENDING_RAW_POINTS);
                    }
                } else if (!isReasonableSpeed) {
                    console.warn(`[BackgroundTask] Filtered GPS jitter: ${impliedSpeedMps.toFixed(1)} m/s`);
                }
            }

            // Update last known position
            hot.lastLatitude = location.coords.latitude;
            hot.lastLongitude = location.coords.longitude;
            hot.lastTimestamp = location.timestamp;
            hot.invocationCount = (hot.invocationCount || 0) + 1;

            // ── Cold flush every COLD_FLUSH_EVERY_N invocations (~60 s) ────────
            // Moves pending route points to the large cold-state JSON so the hot
            // state stays tiny on every GPS-fix write.
            const shouldFlushCold =
                hot.invocationCount % COLD_FLUSH_EVERY_N === 0 &&
                ((hot.pendingRoutePoints?.length ?? 0) > 0 || (hot.pendingRawPoints?.length ?? 0) > 0);

            if (shouldFlushCold) {
                try {
                    const coldJson = await AsyncStorage.getItem(JOURNEY_ROUTES_KEY);
                    const cold: JourneyColdState = coldJson
                        ? JSON.parse(coldJson)
                        : { journeyId: hot.journeyId, routePoints: [], rawPointsBuffer: [] };

                    // Append pending points and enforce caps
                    cold.routePoints = [...cold.routePoints, ...(hot.pendingRoutePoints ?? [])];
                    if (cold.routePoints.length > MAX_ROUTE_POINTS) {
                        const first = cold.routePoints[0];
                        cold.routePoints = [first, ...cold.routePoints.slice(-(MAX_ROUTE_POINTS - 1))];
                    }

                    cold.rawPointsBuffer = [...cold.rawPointsBuffer, ...(hot.pendingRawPoints ?? [])];
                    if (cold.rawPointsBuffer.length > MAX_RAW_BUFFER_POINTS) {
                        cold.rawPointsBuffer = cold.rawPointsBuffer.slice(-MAX_RAW_BUFFER_POINTS);
                    }

                    await AsyncStorage.setItem(JOURNEY_ROUTES_KEY, JSON.stringify(cold));

                    // Clear pending buffers now that they're safely in cold storage
                    hot.pendingRoutePoints = [];
                    hot.pendingRawPoints = [];
                } catch (coldErr) {
                    // Cold flush failed — leave pending points in hot state for next attempt
                    console.warn('[BackgroundTask] Cold flush failed, will retry:', coldErr);
                }
            }

            // ── Write HOT state (~200 bytes, fast) ───────────────────────────
            await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(hot));

            // ── Update notification (reads hot state only) ────────────────────
            await updateTrackingNotification(hot);

        } catch (e) {
            console.error('[BackgroundTask] Failed to process location:', e);
        }
    },
);

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BackgroundTrackingOptions {
    startLocationName?: string;
    destinationName?: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    estimatedTotalDistance?: number;
    startTime?: number;
    initialLocation?: { latitude: number; longitude: number; timestamp: number };
    vehicle?: 'car' | 'bike' | 'scooter';
}

export async function startBackgroundTracking(
    journeyId: string,
    options?: BackgroundTrackingOptions,
): Promise<boolean> {
    try {
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            console.warn('[BackgroundTask] Background location permission not granted');
            return false;
        }

        let initialCoords: { latitude: number; longitude: number; timestamp: number };
        if (options?.initialLocation) {
            initialCoords = options.initialLocation;
        } else {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            initialCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, timestamp: loc.timestamp };
        }

        const syncedStartTime = options?.startTime || Date.now();

        // ── Write initial HOT state (small) ────────────────────────────────────
        const hotState: JourneyHotState = {
            journeyId,
            startTime: syncedStartTime,
            totalDistance: 0,
            movingTime: 0,
            topSpeed: 0,
            vehicle: options?.vehicle ?? 'car',
            lastLatitude: initialCoords.latitude,
            lastLongitude: initialCoords.longitude,
            lastTimestamp: initialCoords.timestamp,
            startLocationName: options?.startLocationName,
            destinationName: options?.destinationName,
            destinationLatitude: options?.destinationLatitude,
            destinationLongitude: options?.destinationLongitude,
            estimatedTotalDistance: options?.estimatedTotalDistance,
            invocationCount: 0,
            pendingRoutePoints: [],
            pendingRawPoints: [],
        };
        await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(hotState));

        // ── Write initial COLD state (route arrays) ────────────────────────────
        const coldState: JourneyColdState = {
            journeyId,
            routePoints: [{ latitude: initialCoords.latitude, longitude: initialCoords.longitude, timestamp: initialCoords.timestamp, speed: 0 }],
            rawPointsBuffer: [{ latitude: initialCoords.latitude, longitude: initialCoords.longitude, timestamp: initialCoords.timestamp, speed: 0 }],
        };
        await AsyncStorage.setItem(JOURNEY_ROUTES_KEY, JSON.stringify(coldState));

        // ── Start background location task ─────────────────────────────────────
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            foregroundService: {
                notificationTitle: options?.destinationName ? `Heading to ${options.destinationName}` : 'Wayfarian Journey',
                notificationBody: 'Tracking your journey...',
                notificationColor: '#F9A825',
            },
            pausesUpdatesAutomatically: false,
            activityType: Location.ActivityType.AutomotiveNavigation,
        });

        // Initial rich notification (non-blocking)
        const units = await getUnitsPreference();
        LiveNotificationService.updateNotification({
            journeyId,
            startTime: syncedStartTime,
            totalDistance: 0,
            currentSpeed: 0,
            avgSpeed: 0,
            topSpeed: 0,
            movingTime: 0,
            progress: 0,
            distanceRemaining: options?.estimatedTotalDistance,
            startLocationName: options?.startLocationName,
            destinationName: options?.destinationName,
            currentLatitude: initialCoords.latitude,
            currentLongitude: initialCoords.longitude,
            units,
        }).catch(e => console.warn('[BackgroundTask] Initial notification failed (non-critical):', e));

        await LiveNotificationService.initializeChannel();

        console.log('[BackgroundTask] Started background tracking for journey:', journeyId);
        return true;
    } catch (error) {
        console.error('[BackgroundTask] Failed to start background tracking:', error);
        return false;
    }
}

export async function stopBackgroundTracking(): Promise<PersistedJourneyState | null> {
    let savedState: PersistedJourneyState | null = null;
    try {
        // 1. Read & merge both states BEFORE clearing — callers may need the final stats.
        savedState = await getPersistedJourneyState();

        // 2. Clear HOT state FIRST so a racing background task invocation sees null and exits
        //    without re-posting the notification (the race that caused the notification to persist).
        await AsyncStorage.removeItem(JOURNEY_STATE_KEY);
        await AsyncStorage.removeItem(JOURNEY_ROUTES_KEY);

        // 3. Stop the location task (now safe — background task exits on null hot state)
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (isRunning) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }

        // 4. Dismiss notification
        await LiveNotificationService.dismissNotification();
        await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

        console.log('[BackgroundTask] Stopped background tracking');
        return savedState;
    } catch (error) {
        console.error('[BackgroundTask] Failed to stop background tracking:', error);
        LiveNotificationService.dismissNotification().catch(() => {});
        return savedState;
    }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
    try {
        return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
        return false;
    }
}

/** Reads both HOT and COLD state and returns a merged PersistedJourneyState. */
export async function getPersistedJourneyState(): Promise<PersistedJourneyState | null> {
    try {
        const hotJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        if (!hotJson) return null;
        const hot: JourneyHotState = JSON.parse(hotJson);

        const coldJson = await AsyncStorage.getItem(JOURNEY_ROUTES_KEY);
        const cold: JourneyColdState | null = coldJson ? JSON.parse(coldJson) : null;

        return {
            journeyId: hot.journeyId,
            startTime: hot.startTime,
            totalDistance: hot.totalDistance,
            movingTime: hot.movingTime,
            topSpeed: hot.topSpeed,
            vehicle: hot.vehicle,
            lastLatitude: hot.lastLatitude,
            lastLongitude: hot.lastLongitude,
            lastTimestamp: hot.lastTimestamp,
            lastSpeed: hot.lastSpeed,
            recentHighSpeeds: hot.recentHighSpeeds,
            startLocationName: hot.startLocationName,
            destinationName: hot.destinationName,
            destinationLatitude: hot.destinationLatitude,
            destinationLongitude: hot.destinationLongitude,
            estimatedTotalDistance: hot.estimatedTotalDistance,
            // Merge: cold (flushed history) + hot pending (recent points not yet flushed)
            routePoints: [
                ...(cold?.routePoints ?? []),
                ...(hot.pendingRoutePoints ?? []),
            ],
            rawPointsBuffer: [
                ...(cold?.rawPointsBuffer ?? []),
                ...(hot.pendingRawPoints ?? []),
            ],
        };
    } catch {
        return null;
    }
}

export async function recoverJourneyState(): Promise<PersistedJourneyState | null> {
    const state = await getPersistedJourneyState();
    if (state) {
        const isActive = await isBackgroundTrackingActive();
        if (!isActive) {
            await AsyncStorage.removeItem(JOURNEY_STATE_KEY);
            await AsyncStorage.removeItem(JOURNEY_ROUTES_KEY);
            return null;
        }
    }
    return state;
}

export async function getBufferedBackgroundPoints(): Promise<{ latitude: number; longitude: number; timestamp: number; speed?: number }[]> {
    try {
        const state = await getPersistedJourneyState();
        return state?.rawPointsBuffer ?? [];
    } catch {
        return [];
    }
}

export async function clearBackgroundBuffer(): Promise<void> {
    try {
        // Clear from cold state
        const coldJson = await AsyncStorage.getItem(JOURNEY_ROUTES_KEY);
        if (coldJson) {
            const cold: JourneyColdState = JSON.parse(coldJson);
            cold.rawPointsBuffer = [];
            await AsyncStorage.setItem(JOURNEY_ROUTES_KEY, JSON.stringify(cold));
        }
        // Clear pending raw points from hot state
        const hotJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        if (hotJson) {
            const hot: JourneyHotState = JSON.parse(hotJson);
            hot.pendingRawPoints = [];
            await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(hot));
        }
    } catch (e) {
        console.warn('[BackgroundTask] Failed to clear buffer:', e);
    }
}

export async function getBackgroundDistance(): Promise<number> {
    try {
        // Distance lives in hot state — no need to read cold
        const hotJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        if (!hotJson) return 0;
        const hot: JourneyHotState = JSON.parse(hotJson);
        return hot.totalDistance ?? 0;
    } catch {
        return 0;
    }
}

/** Sync foreground stats into hot state only — fast, no route-array I/O. */
export async function syncForegroundToBackground(foregroundState: {
    totalDistance: number;
    movingTime: number;
    topSpeed: number;
    currentSpeed: number; // km/h
    currentLatitude?: number;
    currentLongitude?: number;
}): Promise<void> {
    try {
        const hotJson = await AsyncStorage.getItem(JOURNEY_STATE_KEY);
        if (!hotJson) return;
        const hot: JourneyHotState = JSON.parse(hotJson);

        hot.totalDistance = Math.max(hot.totalDistance, foregroundState.totalDistance);
        hot.movingTime = Math.max(hot.movingTime, foregroundState.movingTime);
        hot.topSpeed = Math.max(hot.topSpeed, foregroundState.topSpeed);
        hot.lastSpeed = foregroundState.currentSpeed / 3.6;

        if (foregroundState.currentLatitude && foregroundState.currentLongitude) {
            hot.lastLatitude = foregroundState.currentLatitude;
            hot.lastLongitude = foregroundState.currentLongitude;
            hot.lastTimestamp = Date.now();
        }

        await AsyncStorage.setItem(JOURNEY_STATE_KEY, JSON.stringify(hot));
        console.log('[BackgroundTask] Synced foreground state — distance:', hot.totalDistance.toFixed(2), 'km');
    } catch (e) {
        console.warn('[BackgroundTask] Failed to sync foreground state:', e);
    }
}

export async function getBackgroundAccumulatedState(): Promise<{
    totalDistance: number;
    movingTime: number;
    topSpeed: number;
    routePoints: { latitude: number; longitude: number; timestamp: number; speed?: number }[];
} | null> {
    try {
        const state = await getPersistedJourneyState();
        if (!state) return null;
        return {
            totalDistance: state.totalDistance,
            movingTime: state.movingTime,
            topSpeed: state.topSpeed,
            routePoints: state.routePoints,
        };
    } catch {
        return null;
    }
}

export default {
    startBackgroundTracking,
    stopBackgroundTracking,
    isBackgroundTrackingActive,
    getPersistedJourneyState,
    recoverJourneyState,
    getBufferedBackgroundPoints,
    clearBackgroundBuffer,
    getBackgroundDistance,
    syncForegroundToBackground,
    getBackgroundAccumulatedState,
    BACKGROUND_LOCATION_TASK,
};
