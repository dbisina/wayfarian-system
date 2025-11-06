# Group Journey - Quick Start Guide

## Setup Steps

### 1. Database Migration
Once your database is accessible, run:

```bash
cd server
npx prisma migrate dev --name add_group_journey_instances
npx prisma generate
npm run dev
```

### 2. Start the Client
```bash
cd app
npx expo start
```

## How to Test

### Single Device Testing (Limited)
1. Create a group
2. Add yourself as a member
3. Go to group detail
4. Click "Start Group Journey"
5. Enter a title
6. You'll be taken to the journey screen
7. See your location on the map

### Multi-Device Testing (Full Experience)
**Required:** 2+ physical devices OR 1 physical + 1 emulator

**Device 1 (Creator):**
1. Login to account A
2. Create a group
3. Note the group code
4. Click "Start Group Journey"
5. Enter title (e.g., "Morning Ride")
6. Watch the journey screen

**Device 2 (Member):**
1. Login to account B
2. Join group using code
3. You'll receive an alert: "Journey Started!"
4. Tap "Join Journey"
5. See both your and creator's location on map
6. Start moving to see real-time updates

**What You'll See:**
- Both profile pictures on the map
- Real-time position updates as you move
- Distance and stats for each member
- Notifications when anyone completes

## Features to Test

### Starting a Journey
- ✓ Only creator/admin can start
- ✓ Requires location permission
- ✓ All members get notified instantly
- ✓ Members can join or dismiss

### During Journey
- ✓ Location updates every 10 meters or 2 seconds
- ✓ Map shows all member markers
- ✓ Profile pictures on markers
- ✓ Member list scrolls horizontally
- ✓ Stats update in real-time

### Pause/Resume
- ✓ Tap pause button
- ✓ Location tracking stops
- ✓ Other members see your status change
- ✓ Tap resume to continue

### Completion
- ✓ Tap "Complete" button
- ✓ Confirmation dialog shows your stats
- ✓ All members get notification
- ✓ Completed badge shows on your marker
- ✓ If last person, group journey completes

## Troubleshooting

### Members Don't Receive Notification
**Check:**
- Socket connection (green dot in app)
- Both users in same group
- Network connectivity

**Fix:**
- Restart app
- Check server logs for socket events
- Verify /group-journey/start response

### Location Not Updating
**Check:**
- Location permissions granted
- GPS enabled on device
- Not in airplane mode

**Fix:**
- Re-grant permissions in Settings
- Restart location services
- Check device GPS accuracy

### Map Markers Not Showing
**Check:**
- Google Maps API key configured
- Internet connection active
- `react-native-maps` installed

**Fix:**
```bash
cd app
npm install react-native-maps
```

### Socket Connection Issues
**Check:**
- Server running on correct port
- Firewall not blocking WebSocket
- API URL override set correctly

**Fix:**
- Go to Settings → OAuth Debug & API Override
- Clear override or set tunnel URL
- Restart expo dev server

## API Testing with Postman/cURL

### Start Group Journey
```bash
curl -X POST http://localhost:3001/api/group-journey/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "GROUP_ID",
    "title": "Test Journey",
    "description": "Testing group journey",
    "startLatitude": 40.7128,
    "startLongitude": -74.0060
  }'
```

### Get Journey Details
```bash
curl http://localhost:3001/api/group-journey/GROUP_JOURNEY_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Location
```bash
curl -X POST http://localhost:3001/api/group-journey/instance/INSTANCE_ID/location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 40.7130,
    "longitude": -74.0062,
    "speed": 5.5,
    "distance": 100
  }'
```

## Expected Socket Events

When you start a journey, you should see in server logs:
```
User Alice connected (Socket: abc123)
User Alice joined group journey xyz789
[Socket] group-journey:started emitted to 3 members
[Socket] member:location-updated broadcast
```

In browser console / Expo debugger:
```
[Socket] Connected
🚀 Group journey started: { groupJourneyId: 'xyz', title: 'Morning Ride' }
✅ Joined group journey: { memberLocations: [...] }
```

## Performance Notes

- **Location updates:** Throttled to 3 seconds to reduce server load
- **Socket broadcasts:** Room-based (efficient for groups)
- **Database:** Sequential queries (works with connection_limit=1)
- **Memory:** Minimal - no route caching on client

## Next Features to Add

1. Photo capture during journey
2. Route replay/playback
3. Journey statistics comparison
4. Leaderboard integration
5. Achievement unlocks
6. Share journey results

---

**Questions?** Check `GROUP_JOURNEY_IMPLEMENTATION.md` for full architecture details.
