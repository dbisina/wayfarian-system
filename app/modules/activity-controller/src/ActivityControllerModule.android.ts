import {
    StartLiveActivityFn,
    UpdateLiveActivityFn,
    StopLiveActivityFn,
    IsLiveActivityRunningFn,
} from './ActivityController.types';

export const startLiveActivity: StartLiveActivityFn = async () => {
    return { activityId: '' };
};

export const updateLiveActivity: UpdateLiveActivityFn = async () => {
    return;
};

export const stopLiveActivity: StopLiveActivityFn = async () => {
    return;
};

export const isLiveActivityRunning: IsLiveActivityRunningFn = () => {
    return false;
};

export const areLiveActivitiesEnabled = (): boolean => {
    return false;
};
