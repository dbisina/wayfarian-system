# Ride Events API Reference

Real-time event timeline for group journeys. All endpoints require authentication.

## Endpoints

### List Events
**GET** `/api/group-journey/:id/events`

Retrieve timeline events for a group journey, ordered by most recent first.

**Query Parameters:**
- `since` (optional): ISO 8601 timestamp; return events created after this date
- `limit` (optional): Max events to return (default 50, max 100)

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "id": "evt_abc123",
      "groupJourneyId": "gj_xyz",
      "type": "MESSAGE",
      "message": "On my way!",
      "latitude": null,
      "longitude": null,
      "mediaUrl": null,
      "data": null,
      "createdAt": "2025-11-03T14:30:00Z",
      "user": {
        "id": "user_123",
        "displayName": "Jane Doe",
        "photoURL": "https://..."
      }
    }
  ]
}
```

**Authorization:**
- Must be a member of the group that owns this journey.

**Errors:**
- 404: Group journey not found
- 403: Not a group member

---

### Create Event
**POST** `/api/group-journey/:id/events`

Post a new event to the group journey timeline. Emits a `group-journey:event` socket broadcast to all connected participants.

**Request Body:**
```json
{
  "type": "MESSAGE",
  "message": "Taking a quick break",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "mediaUrl": "https://example.com/photo.jpg",
  "data": { "custom": "field" }
}
```

**Fields:**
- `type` (required): One of: MESSAGE, PHOTO, CHECKPOINT, STATUS, EMERGENCY, CUSTOM
- `message` (optional): Text content (max 500 chars)
- `latitude` (optional): GPS latitude (-90 to 90)
- `longitude` (optional): GPS longitude (-180 to 180)
- `mediaUrl` (optional): URL to media file (max 2048 chars)
- `data` (optional): JSON object for custom metadata

**Response:**
```json
{
  "success": true,
  "event": {
    "id": "evt_def456",
    "groupJourneyId": "gj_xyz",
    "type": "MESSAGE",
    "message": "Taking a quick break",
    "latitude": 51.5074,
    "longitude": -0.1278,
    "mediaUrl": null,
    "data": null,
    "createdAt": "2025-11-03T14:32:00Z",
    "user": {
      "id": "user_123",
      "displayName": "Jane Doe",
      "photoURL": "https://..."
    }
  }
}
```

**Authorization:**
- Must be a member of the group that owns this journey.

**Errors:**
- 400: Invalid event type or validation failure
- 404: Group journey not found
- 403: Not a group member

---

## Socket Events

All participants in a group journey can subscribe to real-time events.

### Join Room
**Emit:** `group-journey:join`
```json
{ "groupJourneyId": "gj_xyz" }
```

**Response:** `group-journey:joined`
```json
{
  "groupJourneyId": "gj_xyz",
  "roomName": "group-journey-gj_xyz",
  "memberLocations": [ ... ],
  "timestamp": "2025-11-03T14:35:00Z"
}
```

### Leave Room
**Emit:** `group-journey:leave`
```json
{ "groupJourneyId": "gj_xyz" }
```

**Response:** `group-journey:left`

### Receive Events
**Listen:** `group-journey:event`

Broadcast to all room participants when a new event is created.

```json
{
  "id": "evt_ghi789",
  "groupJourneyId": "gj_xyz",
  "user": {
    "id": "user_456",
    "displayName": "John Smith",
    "photoURL": "https://..."
  },
  "type": "CHECKPOINT",
  "message": "Reached halfway point!",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "mediaUrl": null,
  "data": null,
  "createdAt": "2025-11-03T14:36:00Z"
}
```

### Optional: Post Event via Socket
**Emit:** `group-journey:post-event`

Alternative to REST POST for creating events.

```json
{
  "groupJourneyId": "gj_xyz",
  "type": "MESSAGE",
  "message": "Quick update",
  "latitude": 51.5074,
  "longitude": -0.1278
}
```

No response; event broadcasts via `group-journey:event` if successful.

---

## Event Types

- **MESSAGE**: Text messages from participants
- **PHOTO**: Photo shared on timeline (mediaUrl should reference uploaded photo)
- **CHECKPOINT**: Milestone or waypoint reached
- **STATUS**: User status update (e.g., "paused", "resumed")
- **EMERGENCY**: SOS or urgent alert
- **CUSTOM**: Application-defined event types

---

## Client Usage (React Native)

```typescript
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';

function MyComponent({ groupJourneyId }: { groupJourneyId: string }) {
  const { events, loading, postEvent } = useRealtimeEvents({ groupJourneyId });

  const sendMessage = (text: string) => {
    postEvent({ type: 'MESSAGE', message: text });
  };

  return (
    <View>
      {events.map(evt => (
        <Text key={evt.id}>{evt.user.displayName}: {evt.message}</Text>
      ))}
      <Button onPress={() => sendMessage('Hello!')} title="Send" />
    </View>
  );
}
```

---

## Testing

Quick manual test with curl (replace tokens and IDs):

```bash
# List events
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/group-journey/<id>/events

# Create event
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"MESSAGE","message":"Test event"}' \
  http://localhost:3001/api/group-journey/<id>/events
```

For socket testing, use a WebSocket client or the app's `postGroupJourneyEvent` helper.

---

## Notes

- Events are immutable; no update or delete endpoints yet.
- Pagination: Use `since` + `limit` for cursor-based loading (full cursor pagination TBD).
- Media uploads: Separate endpoint; reference resulting URL in `mediaUrl` field.
- Rate limiting: Standard API rate limits apply (100 req/15min by default).
