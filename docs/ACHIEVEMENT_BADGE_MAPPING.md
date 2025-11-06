# Achievement Badge Mapping Summary

## Overview
Successfully mapped 40+ badge images to a comprehensive achievement system for the Wayfarian riding app. The system now includes 20+ achievements across 4 categories with tiered progression.

## Badge Categories and Achievements

### 🚀 Journey Milestones (4 achievements)
Progressive achievements based on number of journeys completed:

| Achievement ID | Badge File | Name | Description | Threshold |
|---------------|-----------|------|-------------|-----------|
| `first_journey` | ignition rookie.png | Ignition Rookie | Complete your first journey | 1 journey |
| `ten_journeys` | Route Raider.png | Route Raider | Complete 10 journeys | 10 journeys |
| `fifty_journeys` | Trail Dominator.png | Trail Dominator | Complete 50 journeys | 50 journeys |
| `hundred_journeys` | Legacy Rider.png | Legacy Rider | Complete 100 journeys | 100 journeys |

### 🌍 Distance Explorer (5 achievements)
Progressive achievements based on total distance traveled:

| Achievement ID | Badge File | Name | Description | Threshold |
|---------------|-----------|------|-------------|-----------|
| `hundred_km` | explorer.png | Explorer | Travel 100 kilometers total | 100 km |
| `five_hundred_km` | Horizon Drifter.png | Horizon Drifter | Travel 500 kilometers total | 500 km |
| `thousand_km` | World Treader.png | World Treader | Travel 1,000 kilometers total | 1,000 km |
| `five_thousand_km` | around-the-world.png | Around the World | Travel 5,000 kilometers total | 5,000 km |
| `ten_thousand_km` | Globe Striker.png | Globe Striker | Travel 10,000 kilometers total | 10,000 km |

### ⚡ Speed Demon (4 achievements)
Progressive achievements based on top speed reached:

| Achievement ID | Badge File | Name | Description | Threshold |
|---------------|-----------|------|-------------|-----------|
| `speed_demon` | Speedster.png | Speedster | Reach 80 km/h top speed | 80 km/h |
| `velocity_master` | Velocity Ace.png | Velocity Ace | Reach 120 km/h top speed | 120 km/h |
| `apex_controller` | Apex Controller.png | Apex Controller | Reach 160 km/h top speed | 160 km/h |
| `wind_reaper` | Wind Reaper.png | Wind Reaper | Reach 200 km/h top speed | 200 km/h |

### ⏱️ Time Master (4 achievements)
Progressive achievements based on total time riding:

| Achievement ID | Badge File | Name | Description | Threshold |
|---------------|-----------|------|-------------|-----------|
| `hour_rider` | Time master.png | Time Master | Ride for 1 hour total | 60 minutes |
| `ten_hours` | Chrono Breaker.png | Chrono Breaker | Ride for 10 hours total | 600 minutes |
| `fifty_hours` | Timewarp Rider.png | Timewarp Rider | Ride for 50 hours total | 3,000 minutes |
| `hundred_hours` | Eternal Engine.png | Eternal Engine | Ride for 100 hours total | 6,000 minutes |

### ⭐ Special Achievements (4 achievements)
Future implementation - requires additional journey analytics:

| Achievement ID | Badge File | Name | Description | Status |
|---------------|-----------|------|-------------|--------|
| `night_rider` | Nightshift Nomad.png | Nightshift Nomad | Complete 10 journeys at night | 🔒 Not implemented |
| `drift_master` | Drift Syndicate.png | Drift Syndicate | Master the art of drifting | 🔒 Not implemented |
| `rhythm_cruise` | Rhythm Cruise.png | Rhythm Cruise | Maintain steady speed for 30 minutes | 🔒 Not implemented |
| `flowstate_pilot` | Flowstate Pilot.png | Flowstate Pilot | Complete perfect journey | 🔒 Not implemented |

## Additional Available Badges (Not Yet Mapped)
These badges are available for future achievement expansion:

- **Social**: Ace of friends.png, Badge Hunter.png
- **Performance**: Arena Elite.png, Iron Enduro.png, performance.png, Rhythm Master.png
- **Style**: drifting.png, Mustang.png, racer.png, racing-car.png
- **Misc**: Drift Syndicate.png, Nitro surge.png, Shadow Line.png, speedometer (1).png, Street Sprinter.png, tire.png, track (1).png, travel.png, Turbo Pulse.png, miles-per-hour.png, X(Roman 10).png

## Implementation Details

### Client-Side (React Native)
**File**: `app/constants/achievements.ts`
- Maps achievement IDs to local badge image assets
- Uses `require()` for efficient asset loading
- Provides TypeScript types for type safety

**Usage in Components**:
```typescript
import { ACHIEVEMENT_BADGES } from '../../constants/achievements';

const badgeSource = ACHIEVEMENT_BADGES[achievement.id];
<Image source={badgeSource} style={styles.achievementBadgeImage} />
```

### Server-Side (Node.js/Express)
**File**: `server/controllers/leaderboardController.js`
- Updated `getAchievements()` endpoint
- Added `category` and `badge` fields to each achievement
- Achievements calculated dynamically from User model stats:
  - `totalTrips`: Number of completed journeys
  - `totalDistance`: Total kilometers traveled
  - `topSpeed`: Maximum speed reached
  - `totalTime`: Total minutes riding

**API Response Format**:
```json
{
  "success": true,
  "achievements": [
    {
      "id": "first_journey",
      "name": "Ignition Rookie",
      "description": "Complete your first journey",
      "category": "journey",
      "badge": "ignition rookie.png",
      "threshold": 1,
      "current": 0,
      "type": "totalTrips",
      "unlocked": false
    }
  ],
  "summary": {
    "totalAchievements": 20,
    "unlockedCount": 0,
    "progress": "0.0"
  }
}
```

### Display Updates
**File**: `app/app/(tabs)/index.tsx`
- Home screen now displays actual badge images instead of emoji placeholders
- Falls back to 🏆 emoji if badge image not found
- Uses 60x60px badge images with `resizeMode="contain"`

## Database Schema
No database changes required! Achievements remain dynamically calculated from existing User model fields:

```prisma
model User {
  totalTrips    Int      @default(0)  // Journey count
  totalDistance Float    @default(0)  // Total km
  topSpeed      Float    @default(0)  // Max km/h
  totalTime     Int      @default(0)  // Total minutes
}
```

## Next Steps

### Immediate
1. ✅ Badge-achievement mapping completed
2. ✅ Server endpoint updated with badge references
3. ✅ Client constants file created
4. ✅ Home screen updated to display badges
5. 🔄 **RESTART SERVER** to apply changes

### Future Enhancements
1. **Add Social Achievements**:
   - "Ace of Friends" - Invite 5 friends
   - "Badge Hunter" - Unlock 10 achievements
   
2. **Add Performance Achievements**:
   - "Arena Elite" - Top 10 on leaderboard
   - "Iron Enduro" - Complete journey over 100km
   - "Rhythm Master" - Maintain target speed for duration

3. **Implement Special Achievements**:
   - Night journey tracking (time-of-day detection)
   - Drift detection (accelerometer/gyroscope data)
   - Steady speed cruise tracking

4. **Create Full Achievement Screen**:
   - Grid view of all achievements
   - Filter by category
   - Show locked achievements with progress bars
   - Celebration animations on unlock

5. **Add Achievement Notifications**:
   - Push notification when achievement unlocked
   - In-app toast/modal celebration
   - Share achievement to social media

## Testing Checklist
- [ ] Restart server with new achievement definitions
- [ ] Test `/api/leaderboard/achievements` endpoint
- [ ] Verify badge images display correctly on home screen
- [ ] Check that achievements unlock based on user stats
- [ ] Test with user having 0 achievements
- [ ] Test with user having multiple unlocked achievements
- [ ] Verify fallback emoji displays for unmapped achievements

## Notes
- All badge PNGs are stored in `app/assets/images/badges/`
- Badge filenames must match exactly (case-sensitive)
- Achievement IDs must match between client mapping and server definitions
- Current implementation uses 20 of 40+ available badges
- Special achievements currently return `current: 0` and `unlocked: false` (future implementation)
