
export type JourneyContentState = {
    elapsedTime: number; // seconds
    totalDistance: number; // km
    currentSpeed: number; // km/h
    progress: number; // 0.0 to 1.0
    distanceRemaining?: number | null; // km, optional
};

export type JourneyAttributes = {
    journeyId: string;
    startLocationName: string;
    destinationName: string;
    startTime: number; // timestamp (ms) since 1970 usually, but we will align with Swift
};

export type StartLiveActivityFn = (
    params: JourneyAttributes & { contentState: JourneyContentState }
) => Promise<{ activityId: string }>;

export type UpdateLiveActivityFn = (
    params: JourneyContentState
) => Promise<void>;

export type StopLiveActivityFn = () => Promise<void>;

export type IsLiveActivityRunningFn = () => boolean;
