import { requireNativeModule, NativeModule } from 'expo-modules-core';
import {
    StartLiveActivityFn,
    UpdateLiveActivityFn,
    StopLiveActivityFn,
    IsLiveActivityRunningFn,
    JourneyAttributes,
    JourneyContentState,
} from './ActivityController.types';

// Define the shape of the native module
interface ActivityControllerNativeModule extends NativeModule {
    startLiveActivity(data: string): Promise<void>;
    updateLiveActivity(data: string): Promise<void>;
    stopLiveActivity(): Promise<void>;
    isLiveActivityRunning(): boolean;
    areLiveActivitiesEnabled: boolean;
}

const nativeModule = requireNativeModule('ActivityController') as ActivityControllerNativeModule;

export const startLiveActivity: StartLiveActivityFn = async (params) => {
    // Pass both attributes and initial content state
    const payload = {
        attributes: {
            journeyId: params.journeyId,
            startLocationName: params.startLocationName,
            destinationName: params.destinationName,
            startTime: params.startTime
        },
        contentState: params.contentState
    };

    const stringParams = JSON.stringify(payload);
    await nativeModule.startLiveActivity(stringParams);
    return { activityId: 'unknown' }; // Native module void return in guide, but we can enhance later if needed
};

export const updateLiveActivity: UpdateLiveActivityFn = async (contentState) => {
    const stringParams = JSON.stringify(contentState);
    return nativeModule.updateLiveActivity(stringParams);
};

export const stopLiveActivity: StopLiveActivityFn = async () => {
    return nativeModule.stopLiveActivity();
};

export const isLiveActivityRunning: IsLiveActivityRunningFn = () => {
    return nativeModule.isLiveActivityRunning();
};

export const areLiveActivitiesEnabled = (): boolean => {
    return nativeModule.areLiveActivitiesEnabled;
};
