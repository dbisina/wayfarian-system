# Group Journey Implementation - Complete Real-Time System

## Overview
A complete real-time group journey system where one person (creator/admin) starts a journey and all group members are automatically notified and can participate simultaneously. Each member has their own journey instance that tracks individually, but everyone can see each other's real-time locations on a shared map.

## Architecture

### Database Schema
```prisma
GroupJourney (parent)
  ├── id, groupId, creatorId, title, description
  ├── startLatitude/Longitude, endLatitude/Longitude
  ├── status (ACTIVE, COMPLETED, CANCELLED)
  └── instances[] (children)

JourneyInstance (per member)
  ├── id, groupJourneyId, userId
  ├── status, startTime, endTime
  ├── totalDistance, totalTime, avgSpeed, topSpeed
  ├── currentLatitude/Longitude, lastLocationUpdate
  └── routePoints (individual GPS trail)

JourneyPhoto
  ├── Associated with journey instances
  └── Lat/long metadata
```

### Real-Time Communication
**WebSocket Events:**
- `group-journey:started` - Creator starts → all members auto-notified
- `group-journey:join` - Member joins journey room
- `instance:location-update` - Real-time position updates (throttled to 3s)
- `member:location-updated` - Broadcast to all members
- `member:journey-completed` - Member finishes, group notified
- `member:journey-paused/resumed` - Status updates
- `group-journey:state` - Request full state snapshot

## API Endpoints

### Group Journey Routes
```
POST   /api/group-journey/start
       - Body: groupId, title, description, startLat/Lng, endLat/Lng
       - Creates parent GroupJourney
       - Creates JourneyInstance for each member
       - Emits socket event to all members
       - Returns: groupJourney with instances

GET    /api/group-journey/:id
       - Returns journey + all member instances with details

GET    /api/group-journey/:groupJourneyId/my-instance
       - Returns current user's instance

POST   /api/group-journey/instance/:id/location
       - Body: latitude, longitude, distance, speed
       - Updates instance location + stats
       - Broadcasts to group via socket

POST   /api/group-journey/instance/:id/complete
       - Body: endLat/Lng (optional)
       - Completes instance, updates user stats
       - Notifies group
       - Auto-completes parent if all done

POST   /api/group-journey/instance/:id/pause
POST   /api/group-journey/instance/:id/resume
       - Control individual instance state
```

## Client Implementation

### Hook: `useGroupJourney`
**Features:**
- Auto-join journey room on mount
- Real-time location tracking with throttling (3s intervals)
- Socket event listeners for all member updates
- Auto-navigation prompt when journey starts
- Completion notifications
- State management for members & my instance

**Usage:**
```tsx
const {
  isJoined,
  memberLocations,  // Array of all member positions
  myInstance,       // Current user's instance
  isTracking,
  startLocationTracking,
  stopLocationTracking,
} = useGroupJourney({
  socket,
  groupJourneyId,
  autoStart: true
});
```

### Screen: `group-journey.tsx`
**Features:**
- Map with all member markers (profile pictures)
- Real-time position updates
- Status indicators (active, paused, completed)
- Member list with distances
- Controls: Pause/Resume, Complete
- Auto-fit map to show all members
- Tracking indicator

**Flow:**
1. Creator starts journey from group detail screen
2. All members receive alert with "Join Journey" button
3. Members auto-navigate to journey screen
4. Location tracking starts automatically
5. All members see each other on map
6. Individual completion tracked
7. Group notified when each member finishes

### Updates to Existing Screens
**`group-detail.tsx`:**
- Added "Start Group Journey" button (creator/admin only)
- Prompts for journey title
- Gets current location
- Calls `/group-journey/start` API
- Navigates creator to journey screen

**`services/api.ts`:**
- Exported `apiRequest` function for custom calls
- Maintains backward compatibility

## Socket Integration

### Server: `groupJourneySocket.js`
**Handlers:**
- `group-journey:join` - Join room, get current state
- `group-journey:leave` - Leave room
- `instance:location-update` - Real-time location (high frequency)
- `group-journey:request-state` - Full state refresh

**Broadcasts:**
- `member:location-updated` - Position changes
- `member:journey-completed` - Completion events
- `member:connected/disconnected` - Connection status

### Server: `sockets/index.js`
- Registered groupJourneySocket handler
- Integrated with authentication flow

## Features

### Real-Time Tracking
- Location updates every 10 meters or 2 seconds
- Throttled broadcasts (3s) to reduce server load
- Background location tracking
- Auto-pause/resume support

### Member Visualization
- Profile pictures as map markers
- Completed badge overlay
- Distance and status display
- Horizontal scrolling member list

### Notifications
- Alert when journey starts (with join option)
- Alert when member completes (with stats)
- Alert when all members complete

### Individual Progress
- Each member tracks own distance/time/speed
- Independent pause/resume/complete
- Personal route trail
- Photo capture capability (ready for integration)

### Group Coordination
- Shared start/end points
- Collective progress counter
- Real-time member count
- Auto-complete when all done

## Migration Required

Run when database is accessible:
```bash
cd server
npx prisma migrate dev --name add_group_journey_instances
npx prisma generate
```

This creates:
- `group_journeys` table
- `journey_instances` table
- `journey_photos` table
- Relationships and indexes

## Testing Checklist

1. ☐ Creator starts journey from group detail
2. ☐ All members receive push notification
3. ☐ Members navigate to journey screen
4. ☐ Location tracking starts automatically
5. ☐ Real-time positions appear on map
6. ☐ Member markers update as they move
7. ☐ Individual pause/resume works
8. ☐ Member completion notifies group
9. ☐ All completed triggers group completion
10. ☐ Stats properly recorded to user profiles

## Production Considerations

### Performance
- Location update throttling (3s)
- DB writes async (don't block socket)
- Connection_limit=1 compatibility (sequential queries)
- Fast-fail on DB timeouts (503)

### Scalability
- Room-based socket broadcast (efficient)
- Pagination for large groups (>10 members)
- Photo storage via Firebase
- Route point compression (optional)

### Reliability
- Auto-reconnect on socket disconnect
- State recovery via `request-state`
- Graceful degradation if location unavailable
- Validation on all inputs

## Files Created/Modified

### Server
**New:**
- `server/controllers/groupJourneyController.js` (520 lines)
- `server/routes/groupJourney.js` (170 lines)
- `server/sockets/groupJourneySocket.js` (320 lines)

**Modified:**
- `server/prisma/schema.prisma` (+120 lines)
- `server/app.js` (+2 lines)
- `server/sockets/index.js` (+2 lines)

### Client
**New:**
- `app/hooks/useGroupJourney.ts` (380 lines)
- `app/app/group-journey.tsx` (640 lines)

**Modified:**
- `app/app/group-detail.tsx` (+60 lines)
- `app/services/api.ts` (+15 lines)

**Total:** ~2,200+ lines of production code

## Next Steps

1. Run migration when DB is accessible
2. Test with 2+ physical devices
3. Add photo capture integration
4. Implement route replay feature
5. Add journey history for groups
6. Consider adding waypoints/checkpoints

---

**Status:** Implementation complete, ready for testing  
**Migration:** Pending database access  
**Testing:** Requires multi-device setup
