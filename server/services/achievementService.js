// server/services/achievementService.js
// Achievement & Streak tracking service

const prisma = require('../prisma/client');
const { ACHIEVEMENT_XP, awardXP } = require('../constants/xpSystem');

/**
 * Achievement definitions with thresholds
 * Each achievement maps to a key in ACHIEVEMENT_XP
 */
const ACHIEVEMENT_DEFINITIONS = {
  // Journey count milestones
  first_journey: { type: 'journeys', threshold: 1 },
  ten_journeys: { type: 'journeys', threshold: 10 },
  fifty_journeys: { type: 'journeys', threshold: 50 },
  hundred_journeys: { type: 'journeys', threshold: 100 },

  // Distance milestones (in km)
  hundred_km: { type: 'distance', threshold: 100 },
  five_hundred_km: { type: 'distance', threshold: 500 },
  thousand_km: { type: 'distance', threshold: 1000 },
  five_thousand_km: { type: 'distance', threshold: 5000 },
  ten_thousand_km: { type: 'distance', threshold: 10000 },

  // Speed milestones (in km/h)
  speed_demon: { type: 'speed', threshold: 100 },
  velocity_master: { type: 'speed', threshold: 150 },
  apex_controller: { type: 'speed', threshold: 200 },
  wind_reaper: { type: 'speed', threshold: 250 },

  // Time milestones (in seconds)
  hour_rider: { type: 'time', threshold: 3600 },
  ten_hours: { type: 'time', threshold: 36000 },
  fifty_hours: { type: 'time', threshold: 180000 },
  hundred_hours: { type: 'time', threshold: 360000 },

  // Special achievements
  night_rider: { type: 'special', check: 'nightRide' },

  // Social achievements
  ace_of_friends: { type: 'social', check: 'firstGroupJourney' },
  badge_hunter: { type: 'social', check: 'tenGroupJourneys' },
};

// Minimum quality gates — rides below these don't count toward milestones
const MIN_JOURNEY_DISTANCE_KM = 0.5; // Must ride at least 500m
const MIN_JOURNEY_TIME_SECS = 300;   // Must ride at least 5 minutes

/**
 * Check and award achievements for a user after journey completion
 * @param {string} userId
 * @param {object} journeyData - Optional data about the just-completed journey
 * @returns {Promise<Array>} - Newly unlocked achievements
 */
async function checkAndAwardAchievements(userId, journeyData = {}) {
  try {
    // Get user stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalDistance: true,
        totalTime: true,
        topSpeed: true,
        totalTrips: true,
        xp: true,
        level: true,
      },
    });

    if (!user) return [];

    // Count only qualifying journeys (above minimum distance and time)
    const qualifyingTrips = await prisma.journey.count({
      where: {
        userId,
        status: 'COMPLETED',
        totalDistance: { gte: MIN_JOURNEY_DISTANCE_KM },
        totalTime: { gte: MIN_JOURNEY_TIME_SECS },
      },
    });

    // Get already unlocked achievements
    const existingAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    });
    const unlockedSet = new Set(existingAchievements.map(a => a.achievementId));

    const newlyUnlocked = [];

    for (const [achievementId, definition] of Object.entries(ACHIEVEMENT_DEFINITIONS)) {
      // Skip if already unlocked
      if (unlockedSet.has(achievementId)) continue;

      // Skip if no XP defined for this achievement
      const xpReward = ACHIEVEMENT_XP[achievementId];
      if (!xpReward) continue;

      let qualified = false;

      switch (definition.type) {
        case 'journeys':
          qualified = qualifyingTrips >= definition.threshold;
          break;
        case 'distance':
          qualified = user.totalDistance >= definition.threshold;
          break;
        case 'speed':
          qualified = user.topSpeed >= definition.threshold;
          break;
        case 'time':
          qualified = user.totalTime >= definition.threshold;
          break;
        case 'special':
          if (definition.check === 'nightRide' && journeyData.completedAt) {
            const hour = new Date(journeyData.completedAt).getHours();
            qualified = hour >= 22 || hour < 5;
          }
          break;
        case 'social':
          if (definition.check === 'firstGroupJourney') {
            const groupJourneyCount = await prisma.journeyInstance.count({
              where: { userId, status: 'COMPLETED' },
            });
            qualified = groupJourneyCount >= 1;
          } else if (definition.check === 'tenGroupJourneys') {
            const groupJourneyCount = await prisma.journeyInstance.count({
              where: { userId, status: 'COMPLETED' },
            });
            qualified = groupJourneyCount >= 10;
          }
          break;
      }

      if (qualified) {
        // Create achievement record
        await prisma.userAchievement.create({
          data: {
            userId,
            achievementId,
            xpAwarded: xpReward,
          },
        });

        // Award XP
        await awardXP(userId, xpReward, achievementId);

        newlyUnlocked.push({
          achievementId,
          xpAwarded: xpReward,
        });

        console.log(`[Achievement] ${userId} unlocked: ${achievementId} (+${xpReward} XP)`);
      }
    }

    return newlyUnlocked;
  } catch (error) {
    console.error('[Achievement] Error checking achievements:', error);
    return [];
  }
}

/**
 * Update ride streak for a user
 * @param {string} userId
 * @returns {Promise<object>} - Updated streak info
 */
async function updateStreak(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let streak = await prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      // First ride ever
      streak = await prisma.userStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastRideDate: today,
        },
      });
      return streak;
    }

    const lastRide = streak.lastRideDate ? new Date(streak.lastRideDate) : null;
    if (lastRide) {
      lastRide.setHours(0, 0, 0, 0);
    }

    let newCurrentStreak = streak.currentStreak;

    if (lastRide && lastRide.getTime() === today.getTime()) {
      // Already rode today, no change
      return streak;
    } else if (lastRide && lastRide.getTime() === yesterday.getTime()) {
      // Consecutive day - increment
      newCurrentStreak = streak.currentStreak + 1;
    } else {
      // Gap > 1 day - reset to 1
      newCurrentStreak = 1;
    }

    const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);

    streak = await prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        lastRideDate: today,
      },
    });

    console.log(`[Streak] ${userId}: current=${newCurrentStreak}, longest=${newLongestStreak}`);
    return streak;
  } catch (error) {
    console.error('[Streak] Error updating streak:', error);
    return null;
  }
}

/**
 * Get all unlocked achievements for a user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getUserAchievements(userId) {
  try {
    const achievements = await prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
    });
    return achievements;
  } catch (error) {
    console.error('[Achievement] Error getting achievements:', error);
    return [];
  }
}

/**
 * Get streak info for a user
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getUserStreak(userId) {
  try {
    let streak = await prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      return { currentStreak: 0, longestStreak: 0, lastRideDate: null };
    }

    // Check if streak is still active (last ride was today or yesterday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastRide = streak.lastRideDate ? new Date(streak.lastRideDate) : null;
    if (lastRide) {
      lastRide.setHours(0, 0, 0, 0);
    }

    const isActive = lastRide && (
      lastRide.getTime() === today.getTime() ||
      lastRide.getTime() === yesterday.getTime()
    );

    return {
      currentStreak: isActive ? streak.currentStreak : 0,
      longestStreak: streak.longestStreak,
      lastRideDate: streak.lastRideDate,
      isActive: !!isActive,
    };
  } catch (error) {
    console.error('[Streak] Error getting streak:', error);
    return { currentStreak: 0, longestStreak: 0, lastRideDate: null };
  }
}

module.exports = {
  checkAndAwardAchievements,
  updateStreak,
  getUserAchievements,
  getUserStreak,
  ACHIEVEMENT_DEFINITIONS,
};
