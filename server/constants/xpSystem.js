// XP Distribution System
// server/constants/xpSystem.js

/**
 * XP values for each achievement based on difficulty and rarity
 * Structure: { achievementId: xpReward }
 */
const ACHIEVEMENT_XP = {
  // Journey Milestones (10-100 XP)
  first_journey: 50,
  ten_journeys: 100,
  fifty_journeys: 300,
  hundred_journeys: 500,
  
  // Distance Achievements (100-500 XP)
  hundred_km: 100,
  five_hundred_km: 250,
  thousand_km: 500,
  five_thousand_km: 1000,
  ten_thousand_km: 2000,
  
  // Speed Achievements (150-400 XP)
  speed_demon: 150,
  velocity_master: 300,
  apex_controller: 400,
  wind_reaper: 500,
  
  // Time Achievements (100-500 XP)
  hour_rider: 100,
  ten_hours: 250,
  fifty_hours: 500,
  hundred_hours: 1000,
  
  // Special Achievements (200-600 XP)
  night_rider: 200,
  drift_master: 350,
  rhythm_cruise: 250,
  street_sprinter: 300,
  turbo_pulse: 300,
  nitro_surge: 350,
  shadow_line: 400,
  flowstate_pilot: 450,
  
  // Performance Achievements (300-700 XP)
  performance_king: 600,
  iron_enduro: 500,
  rhythm_master: 400,
  arena_elite: 700,
  
  // Social Achievements (150-400 XP)
  ace_of_friends: 300,
  badge_hunter: 400,
  
  // Vehicle/Style Achievements (100-300 XP)
  mustang: 200,
  racer: 250,
  racing_car: 300,
  drifting: 300,
  tire_master: 150,
  track_champion: 400,
  speedometer_pro: 200,
  travel_expert: 250,
  miles_master: 300,
  
  // Legendary (1000+ XP)
  x_legend: 1500,
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
