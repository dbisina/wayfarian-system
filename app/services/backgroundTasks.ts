import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { locationService } from './locationService';

export const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        console.error('[TaskManager] Background location error:', error);
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };

        // Process each location point received in the background batch
        for (const location of locations) {
            if (locationService.isCurrentlyTracking()) {
                try {
                    // Process the raw location with our LocationService state
                    // This will run the point through the Kalman Filter
                    await locationService.processRawLocation(location);
                } catch (e) {
                    console.error('[TaskManager] Error processing location:', e);
                }
            }
        }
    }
});
