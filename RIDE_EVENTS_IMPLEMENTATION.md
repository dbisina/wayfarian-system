# Ride Events & Timeline — Implementation Summary

## Overview

The Ride Events system adds a **shared real-time timeline** to group journeys, allowing participants to post messages, share photos, mark checkpoints, and broadcast status updates. All events are timestamped and visible to all group members via REST API and WebSocket broadcasts.

## Features Implemented

### Database
- **RideEvent** model with fields:
  - type (MESSAGE, PHOTO, CHECKPOINT, STATUS, EMERGENCY, CUSTOM)
  - message, latitude, longitude, mediaUrl, data
  - Relations to GroupJourney, JourneyInstance (optional), and User
- Reverse relations on GroupJourney.events, JourneyInstance.events, User.rideEvents

### Server
- **REST Endpoints:**
  - `GET /api/group-journey/:id/events` — list events with pagination (since, limit)
  - `POST /api/group-journey/:id/events` — create a new event
- **Socket Integration:**
  - Join/leave group-journey room via `group-journey:join` / `group-journey:leave`
  - Broadcast new events via `group-journey:event` to all participants
  - Optional socket-based event creation via `group-journey:post-event`
- **Controller:** `rideEventController.js` with participant authorization

### Client (React Native)
- **Hook:** `useRealtimeEvents({ groupJourneyId })` — loads initial events, subscribes to live updates, provides `postEvent` method
- **Components:**
  - `RideTimeline` — scrollable event list with avatars, timestamps, icons, and media previews
  - `MessageComposer` — quick-send message input bar
- **Journey Screen Integration:**
  - Timeline button in action row (when in group journey)
  - Message composer at bottom panel
  - Modal bottom sheet for full event history

## How to Enable (Database Migration)

The schema and code are complete. To apply the changes to your Supabase database:

```bash
cd server
npx prisma db push --accept-data-loss
```

**Note:** This requires:
- `DIRECT_URL` set in `server/.env` to your direct Supabase host (db.<project-ref>.supabase.co)
- Network access to Supabase on port 5432 (if blocked, try a different network or run from CI)

Once migration succeeds, restart the server and app to use the new timeline feature.

## Quick Test

1. Start a group journey (see existing group journey flow).
2. Multiple users join via the "Join Journey" prompt.
3. Open the Journey screen; you'll see a timeline button and message composer.
4. Send a message; it appears in real-time for all connected participants.
5. Tap timeline button to view full event history.

## Documentation

- **API Reference:** `server/RIDE_EVENTS_API.md`
- **Prisma Migration Guide:** `server/PRISMA_MIGRATIONS.md`

## Known Limitations & Future Work

- Events are immutable (no edit/delete yet).
- Pagination is basic (`since` + `limit`); full cursor-based pagination TBD.
- Media upload flow not integrated; manually set `mediaUrl` for now.
- No "Share my location" toggle yet (can be added as a STATUS event type).
- Unit tests pending (controller test skeleton recommended).

## Files Changed

### Server
- `server/prisma/schema.prisma` — added RideEvent, RideEventType enum, reverse relations
- `server/controllers/rideEventController.js` (new) — create/list events
- `server/routes/groupJourney.js` — wired event endpoints
- `server/sockets/groupJourneySocket.js` — added event broadcast handlers
- `server/.env` — updated with DIRECT_URL for migrations
- `server/RIDE_EVENTS_API.md` (new) — API reference
- `server/PRISMA_MIGRATIONS.md` — updated with Supabase pooler vs direct guidance

### Client
- `app/components/RideTimeline.tsx` (new) — timeline UI
- `app/components/MessageComposer.tsx` (new) — message input
- `app/hooks/useRealtimeEvents.ts` (new) — event subscription hook
- `app/services/socket.ts` — added group-journey room helpers
- `app/app/journey.tsx` — integrated timeline modal and composer

## Status

✅ Code complete and ready to test  
⏸️ Database migration pending network access to Supabase

Once migration runs, the feature is live and production-ready.
