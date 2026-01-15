// app/utils/StatsCalculator.ts
// Utility to calculate journey statistics using "Official Distance" (Roads API) 
// and "Moving Time" (Local Physics).

export const StatsCalculator = {
  /**
   * Calculates average speed in km/h.
   * @param distanceKm - The official distance from Google Roads API in kilometers.
   * @param movingTimeSeconds - The accumulated moving time in seconds.
   * @returns Average speed in km/h.
   */
  calculateAverageSpeed: (distanceKm: number, movingTimeSeconds: number): number => {
    if (!movingTimeSeconds || movingTimeSeconds <= 0) return 0;
    const avgSpeed = (distanceKm / movingTimeSeconds) * 3600;
    // Return actual calculated speed - no artificial caps for accuracy
    return avgSpeed;
  },

  /**
   * Updates the max speed if the current speed is higher.
   * @param currentMaxSpeed - The current maximum speed recorded (km/h).
   * @param newSpeed - The latest speed reading (km/h).
   * @returns The new maximum speed.
   */
  calculateMaxSpeed: (currentMaxSpeed: number, newSpeed: number): number => {
    return Math.max(currentMaxSpeed, newSpeed);
  },

  /**
   * Formats duration in seconds to HH:MM:SS or MM:SS.
   * @param seconds - Duration in seconds.
   * @returns Formatted string.
   */
  formatDuration: (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  /**
   * Formats large durations (> 24 hours) to Xd Xh Xm format.
   * Falls back to HH:MM:SS for shorter durations.
   * @param seconds - Duration in seconds.
   * @returns Formatted string like "2d 5h 30m" or "5:30:15".
   */
  formatLargeDuration: (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    // For less than 24 hours, use HH:MM format
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  },

  /**
   * Formats distance in kilometers to a readable string (e.g., "1.2 km").
   * @deprecated Use SettingsContext's convertDistance instead for unit conversion support.
   * @param distanceKm - Distance in kilometers.
   * @returns Formatted string (always in km).
   */
  formatDistance: (distanceKm: number): string => {
    return `${distanceKm.toFixed(2)} km`;
  },

  /**
   * Formats speed in km/h.
   * @deprecated Use SettingsContext's convertSpeed instead for unit conversion support.
   * @param speedKmh - Speed in km/h.
   * @returns Formatted string (always in km/h).
   */
  formatSpeed: (speedKmh: number): string => {
    return `${Math.round(speedKmh)} km/h`;
  }
};
