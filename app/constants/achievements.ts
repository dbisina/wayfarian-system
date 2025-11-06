// Achievement Badge Icons Mapping
// Maps achievement IDs to their corresponding badge images

export const ACHIEVEMENT_BADGES = {
  // Journey Milestones
  'first_journey': require('../assets/images/badges/ignition rookie.png'),
  'ten_journeys': require('../assets/images/badges/Route Raider.png'),
  'fifty_journeys': require('../assets/images/badges/Trail Dominator.png'),
  'hundred_journeys': require('../assets/images/badges/Legacy Rider.png'),
  
    // Distance Achievements
  'hundred_km': require('../assets/images/badges/explorer.png'),
  'five_hundred_km': require('../assets/images/badges/Horizon Drifter.png'),
  'thousand_km': require('../assets/images/badges/World Treader.png'),
  'five_thousand_km': require('../assets/images/badges/around-the-world.png'),
  'ten_thousand_km': require('../assets/images/badges/Globe Striker.png'),
  
  // Speed Achievements
  'speed_demon': require('../assets/images/badges/Speedster.png'),
  'velocity_master': require('../assets/images/badges/Velocity Ace.png'),
  'apex_controller': require('../assets/images/badges/Apex Controller.png'),
  'wind_reaper': require('../assets/images/badges/Wind Reaper.png'),
  
  // Time Achievements
  'hour_rider': require('../assets/images/badges/Time master.png'),
  'ten_hours': require('../assets/images/badges/Chrono Breaker.png'),
  'fifty_hours': require('../assets/images/badges/Timewarp Rider.png'),
  'hundred_hours': require('../assets/images/badges/Eternal Engine.png'),
  
  // Special Achievements
  'night_rider': require('../assets/images/badges/Nightshift Nomad.png'),
  'drift_master': require('../assets/images/badges/Drift Syndicate.png'),
  'rhythm_cruise': require('../assets/images/badges/Rhythm Cruise.png'),
  'street_sprinter': require('../assets/images/badges/Street Sprinter.png'),
  'turbo_pulse': require('../assets/images/badges/Turbo Pulse.png'),
  'nitro_surge': require('../assets/images/badges/Nitro surge.png'),
  'shadow_line': require('../assets/images/badges/Shadow Line.png'),
  'flowstate_pilot': require('../assets/images/badges/Flowstate Pilot.png'),
  
  // Performance Achievements
  'performance_king': require('../assets/images/badges/performance.png'),
  'iron_enduro': require('../assets/images/badges/Iron Enduro.png'),
  'rhythm_master': require('../assets/images/badges/Rhythm Master.png'),
  'arena_elite': require('../assets/images/badges/Arena Elite.png'),
  
  // Social Achievements
  'ace_of_friends': require('../assets/images/badges/Ace of friends.png'),
  'badge_hunter': require('../assets/images/badges/Badge Hunter.png'),
  
  // Vehicle/Style Achievements
  'mustang': require('../assets/images/badges/Mustang.png'),
  'racer': require('../assets/images/badges/racer.png'),
  'racing_car': require('../assets/images/badges/racing-car.png'),
  'drifting': require('../assets/images/badges/drifting.png'),
  'tire_master': require('../assets/images/badges/tire.png'),
  'track_champion': require('../assets/images/badges/track (1).png'),
  'speedometer_pro': require('../assets/images/badges/speedometer (1).png'),
  'travel_expert': require('../assets/images/badges/travel.png'),
  'miles_master': require('../assets/images/badges/miles-per-hour.png'),
  
  // Legendary
  'x_legend': require('../assets/images/badges/X(Roman 10).png'),
};

export type AchievementId = keyof typeof ACHIEVEMENT_BADGES;

// Achievement metadata (could be fetched from server or kept client-side)
export interface AchievementMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string; // fallback emoji if image not found
}

export const ACHIEVEMENT_CATEGORIES = {
  JOURNEY: 'Journey Milestones',
  DISTANCE: 'Distance Explorer',
  SPEED: 'Speed Demon',
  TIME: 'Time Master',
  SPECIAL: 'Special Achievements',
  PERFORMANCE: 'Performance',
  SOCIAL: 'Social',
  STYLE: 'Riding Style',
};
