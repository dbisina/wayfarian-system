// app/constants/photoChallenges.ts
// Client-side photo challenge definitions shown during active rides

export interface PhotoChallenge {
  id: string;
  title: string;
  description: string;
  xp: number;
  icon: string; // Ionicons name
  groupOnly?: boolean;
  timeWindow?: [number, number]; // [startHour, endHour] in 24h format
  distanceTrigger?: number; // km threshold to show this challenge
}

export const PHOTO_CHALLENGES: PhotoChallenge[] = [
  {
    id: 'first_snap',
    title: 'First Snap',
    description: 'Take the first photo of the ride',
    xp: 25,
    icon: 'camera',
  },
  {
    id: 'golden_hour',
    title: 'Golden Hour',
    description: 'Take a photo during sunset',
    xp: 35,
    icon: 'sunny',
    timeWindow: [17, 20],
  },
  {
    id: 'group_shot',
    title: 'Squad Goals',
    description: 'Take a photo with 3+ members visible',
    xp: 40,
    icon: 'people',
    groupOnly: true,
  },
  {
    id: 'pit_stop',
    title: 'Pit Stop',
    description: 'Take a photo at a rest stop',
    xp: 30,
    icon: 'cafe',
  },
  {
    id: 'halfway',
    title: 'Halfway There',
    description: 'Take a photo at the halfway point',
    xp: 40,
    icon: 'flag',
    distanceTrigger: 0.5, // 50% of estimated total distance
  },
  {
    id: 'scenic',
    title: 'Scenic Route',
    description: 'Capture a scenic view',
    xp: 20,
    icon: 'image',
  },
  {
    id: 'night_shot',
    title: 'Night Owl',
    description: 'Take a photo after dark',
    xp: 30,
    icon: 'moon',
    timeWindow: [21, 5],
  },
  {
    id: 'speed_snap',
    title: 'Speed Snap',
    description: 'Take a photo while riding fast',
    xp: 25,
    icon: 'flash',
  },
];

/**
 * Get contextually relevant challenges based on current conditions
 */
export const getActiveChallenge = (options: {
  currentHour: number;
  photoCount: number;
  isGroupRide: boolean;
  distanceKm: number;
  totalEstimatedKm?: number;
}): PhotoChallenge | null => {
  const { currentHour, photoCount, isGroupRide, distanceKm, totalEstimatedKm } = options;

  // First snap if no photos yet
  if (photoCount === 0) {
    return PHOTO_CHALLENGES.find(c => c.id === 'first_snap') || null;
  }

  // Time-based challenges
  const timeChallenges = PHOTO_CHALLENGES.filter(c => {
    if (!c.timeWindow) return false;
    const [start, end] = c.timeWindow;
    if (start < end) {
      return currentHour >= start && currentHour < end;
    }
    // Wraps midnight (e.g., 21 to 5)
    return currentHour >= start || currentHour < end;
  });

  if (timeChallenges.length > 0) {
    return timeChallenges[Math.floor(Math.random() * timeChallenges.length)];
  }

  // Halfway challenge
  if (totalEstimatedKm && distanceKm >= totalEstimatedKm * 0.4 && distanceKm <= totalEstimatedKm * 0.6) {
    return PHOTO_CHALLENGES.find(c => c.id === 'halfway') || null;
  }

  // Group challenges
  if (isGroupRide) {
    const groupChallenges = PHOTO_CHALLENGES.filter(c => c.groupOnly);
    if (groupChallenges.length > 0) {
      return groupChallenges[Math.floor(Math.random() * groupChallenges.length)];
    }
  }

  // Generic challenges
  const generic = PHOTO_CHALLENGES.filter(c => !c.timeWindow && !c.groupOnly && !c.distanceTrigger && c.id !== 'first_snap');
  return generic.length > 0 ? generic[Math.floor(Math.random() * generic.length)] : null;
};
