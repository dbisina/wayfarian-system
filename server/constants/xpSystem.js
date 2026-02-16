// XP Distribution System
// server/constants/xpSystem.js

/**
 * XP values for each achievement based on difficulty and rarity
 * Structure: { achievementId: xpReward }
 */
const ACHIEVEMENT_XP = {
  // Journey Milestones — low XP, these are easy to hit
  first_journey: 10,
  ten_journeys: 40,
  fifty_journeys: 150,
  hundred_journeys: 300,

  // Distance Achievements — reward real riding
  hundred_km: 60,
  five_hundred_km: 150,
  thousand_km: 350,
  five_thousand_km: 800,
  ten_thousand_km: 1500,

  // Speed Achievements
  speed_demon: 80,
  velocity_master: 180,
  apex_controller: 300,
  wind_reaper: 400,

  // Time Achievements — reward dedication
  hour_rider: 40,
  ten_hours: 120,
  fifty_hours: 300,
  hundred_hours: 600,

  // Special Achievements
  night_rider: 100,
  drift_master: 200,
  rhythm_cruise: 120,
  street_sprinter: 150,
  turbo_pulse: 150,
  nitro_surge: 200,
  shadow_line: 250,
  flowstate_pilot: 300,

  // Performance Achievements
  performance_king: 400,
  iron_enduro: 350,
  rhythm_master: 250,
  arena_elite: 500,

  // Social Achievements
  ace_of_friends: 150,
  badge_hunter: 250,

  // Vehicle/Style Achievements
  mustang: 100,
  racer: 120,
  racing_car: 150,
  drifting: 150,
  tire_master: 80,
  track_champion: 250,
  speedometer_pro: 100,
  travel_expert: 120,
  miles_master: 180,

  // Legendary
  x_legend: 1000,
};

/**
 * Level thresholds - XP required to reach each level
 * Exponential growth formula: level^2 * 100
 */
const LEVEL_THRESHOLDS = [
  0,      // Level 1
  100,    // Level 2
  400,    // Level 3
  900,    // Level 4
  1600,   // Level 5
  2500,   // Level 6
  3600,   // Level 7
  4900,   // Level 8
  6400,   // Level 9
  8100,   // Level 10
  10000,  // Level 11
  12100,  // Level 12
  14400,  // Level 13
  16900,  // Level 14
  19600,  // Level 15
  22500,  // Level 16
  25600,  // Level 17
  28900,  // Level 18
  32400,  // Level 19
  36100,  // Level 20
  40000,  // Level 21
  44100,  // Level 22
  48400,  // Level 23
  52900,  // Level 24
  57600,  // Level 25
  62500,  // Level 26
  67600,  // Level 27
  72900,  // Level 28
  78400,  // Level 29
  84100,  // Level 30
  90000,  // Level 31
  96100,  // Level 32
  102400, // Level 33
  108900, // Level 34
  115600, // Level 35
  122500, // Level 36
  129600, // Level 37
  136900, // Level 38
  144400, // Level 39
  152100, // Level 40
  160000, // Level 41
  168100, // Level 42
  176400, // Level 43
  184900, // Level 44
  193600, // Level 45
  202500, // Level 46
  211600, // Level 47
  220900, // Level 48
  230400, // Level 49
  240100, // Level 50
];

/**
 * Calculate level from XP
 * @param {number} xp - Total XP
 * @returns {number} - Current level
 */
function calculateLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Get XP required for next level
 * @param {number} currentLevel - Current level
 * @returns {number} - XP required for next level
 */
function getNextLevelXP(currentLevel) {
  if (currentLevel >= LEVEL_THRESHOLDS.length) {
    return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  }
  return LEVEL_THRESHOLDS[currentLevel];
}

/**
 * Get XP progress to next level
 * @param {number} xp - Current XP
 * @param {number} level - Current level
 * @returns {object} - { current, required, percentage }
 */
function getLevelProgress(xp, level) {
  const currentLevelXP = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextLevelXP = getNextLevelXP(level);
  const xpInCurrentLevel = xp - currentLevelXP;
  const xpRequiredForLevel = nextLevelXP - currentLevelXP;
  const percentage = Math.min(100, (xpInCurrentLevel / xpRequiredForLevel) * 100);

  return {
    current: xpInCurrentLevel,
    required: xpRequiredForLevel,
    percentage: Math.round(percentage * 10) / 10,
    nextLevelXP,
  };
}

/**
 * Get XP for an achievement
 * @param {string} achievementId - Achievement ID
 * @returns {number} - XP reward
 */
function getAchievementXP(achievementId) {
  return ACHIEVEMENT_XP[achievementId] || 0;
}

/**
 * Award XP to a user
 * @param {string} userId - User ID
 * @param {number} xpToAdd - XP to add
 * @param {string} reason - Reason for XP (e.g., achievement name)
 * @returns {Promise<object>} - Updated user with level change info
 */
async function awardXP(userId, xpToAdd, reason = 'Unknown') {
  const prisma = require('../prisma/client');
  
  // Get current user stats
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, level: true, displayName: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const oldXP = user.xp || 0;
  const oldLevel = user.level || 1;
  const newXP = oldXP + xpToAdd;
  const newLevel = calculateLevel(newXP);

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      xp: newXP,
      level: newLevel,
    },
    select: {
      id: true,
      displayName: true,
      xp: true,
      level: true,
    },
  });

  const leveledUp = newLevel > oldLevel;

  console.log(`[XP] ${user.displayName} earned ${xpToAdd} XP for "${reason}" (${oldXP} → ${newXP}, Level ${oldLevel}${leveledUp ? ` → ${newLevel}` : ''})`);

  return {
    user: updatedUser,
    xpGained: xpToAdd,
    leveledUp,
    oldLevel,
    newLevel,
    progress: getLevelProgress(newXP, newLevel),
  };
}

module.exports = {
  ACHIEVEMENT_XP,
  LEVEL_THRESHOLDS,
  calculateLevel,
  getNextLevelXP,
  getLevelProgress,
  getAchievementXP,
  awardXP,
};
