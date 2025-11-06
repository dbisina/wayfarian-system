# Cancel Journey Implementation

## Overview
Implemented the missing backend cancel endpoint for group journeys. This allows group creators and admins to cancel stale journeys that are blocking new journey creation.

## Changes Made

### Backend Changes

#### 1. Controller Function (`server/controllers/groupJourneyControllerV2.js`)
Added `cancelGroupJourney` function with the following features:
- **Authorization**: Only group creators and admins can cancel journeys
- **Journey Validation**: Checks if journey exists and belongs to the group
- **Instance Cancellation**: Cancels all active/paused journey instances
- **Status Update**: Sets journey status to 'CANCELLED' with completion timestamp
- **Cache Clearing**: Removes journey from Redis cache
- **Real-time Notification**: Emits `group-journey:cancelled` socket event to all group members
- **Logging**: Comprehensive logging for debugging

**Key Code:**
```javascript
const cancelGroupJourney = async (req, res) => {
  try {
    const { id: groupJourneyId } = req.params;
    const userId = req.user.id;

    // Get group journey with membership check
    const groupJourney = await prisma.groupJourney.findUnique({
      where: { id: groupJourneyId },
      include: {
        group: {
          include: {
            members: { where: { userId } },
          },
        },
        instances: true,
      },
    });

    // Verify creator/admin role
    const membership = groupJourney.group.members[0];
    if (!membership || !['CREATOR', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only group creators and admins can cancel journeys',
      });
    }

    // Cancel all active instances
    await prisma.journeyInstance.updateMany({
      where: {
        groupJourneyId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    // Update group journey status
    await prisma.groupJourney.update({
      where: { id: groupJourneyId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    // Clear Redis cache
    await redisService.del(redisService.key('group-journey', groupJourneyId));
    await redisService.del(redisService.key('active-group-journey', groupJourney.groupId));

    // Notify all group members
    const io = req.app.get('io');
    if (io) {
      io.to(`group-${groupJourney.groupId}`).emit('group-journey:cancelled', {
        groupJourneyId,
        groupId: groupJourney.groupId,
        cancelledBy: userId,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Group journey cancelled successfully',
      cancelledInstances: cancelledInstances.count,
    });
  } catch (error) {
    logger.error('[GroupJourney] Cancel error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel group journey',
      message: error.message,
    });
  }
};
```

#### 2. Route Addition (`server/routes/groupJourney.js`)
Added POST `/:id/cancel` route with:
- Parameter validation for group journey ID
- Authentication middleware
- Proper documentation

**Route:**
```javascript
/**
 * @route POST /api/group-journey/:id/cancel
 * @desc Cancel a group journey
 * @access Private (Creator/Admin only)
 */
router.post(
  '/:id/cancel',
  [
    param('id')
      .isString()
      .notEmpty()
      .withMessage('Valid group journey ID required')
  ],
  handleValidationErrors,
  cancelGroupJourney
);
```

### Frontend Changes

#### Socket Listener (`app/app/group-detail.tsx`)
Added `group-journey:cancelled` socket event handler:
- Clears active journey state
- Refreshes group data
- Shows alert notification to user

**Handler:**
```typescript
const handleJourneyCancelled = (data: any) => {
  console.log('[Socket] Group journey cancelled:', data);
  // Clear the active journey
  setActiveGroupJourneyId(null);
  // Refresh to sync state
  checkActiveJourney(true);
  loadGroupData(true);
  // Show notification to user
  Alert.alert('Journey Cancelled', 'The group journey has been cancelled by an admin.');
};

socket.on('group-journey:cancelled', handleJourneyCancelled);

// Cleanup
socket.off('group-journey:cancelled', handleJourneyCancelled);
```

## API Endpoint

### Cancel Group Journey
**POST** `/api/group-journey/:id/cancel`

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id` (path): Group journey ID (string, required)

**Response:**
```json
{
  "success": true,
  "message": "Group journey cancelled successfully",
  "cancelledInstances": 3
}
```

**Error Responses:**
- `404`: Journey not found
- `403`: User is not creator/admin
- `500`: Server error

## Socket Events

### Emitted: `group-journey:cancelled`
Sent to all members in the group room when a journey is cancelled.

**Payload:**
```json
{
  "groupJourneyId": "journey-id",
  "groupId": "group-id",
  "cancelledBy": "user-id",
  "timestamp": "2025-01-05T20:30:00.000Z"
}
```

## User Flow

1. **Problem**: User sees "Complete or cancel the current journey first" error
2. **Solution**: Click "Cancel Journey" button on Active Journey Card (admin only)
3. **Backend**: 
   - Validates user is creator/admin
   - Cancels all active journey instances
   - Updates journey status to 'CANCELLED'
   - Clears Redis cache
   - Emits socket event
4. **Frontend**:
   - Receives socket event
   - Clears active journey state
   - Shows "Journey Cancelled" alert
   - Refreshes group data
5. **Result**: User can now create a new journey

## Journey Location Storage

The destination location is properly stored in the backend when the creator starts a group journey:

### Storage in Database
- `endLatitude`: Destination latitude (required)
- `endLongitude`: Destination longitude (required)

### Validation
```javascript
if (endLatitude == null || endLongitude == null) {
  return res.status(400).json({
    error: 'Missing destination coordinates',
    message: 'endLatitude and endLongitude are required'
  });
}
```

### Persistence
```javascript
const groupJourney = await prisma.groupJourney.create({
  data: {
    groupId,
    createdById: userId,
    status: 'WAITING',
    endLatitude,
    endLongitude,
    startLatitude: null,  // Individual starts from their location
    startLongitude: null,
  },
});
```

### Response
The destination is returned in all journey responses:
```javascript
{
  groupJourneyId: journey.id,
  status: journey.status,
  endLatitude: journey.endLatitude,
  endLongitude: journey.endLongitude,
  // ... other fields
}
```

## Testing

### Manual Test Steps
1. Start a group journey (destination set)
2. Let it become stale or encounter blocking error
3. As admin/creator, click "Cancel Journey" button
4. Verify:
   - Journey status changes to 'CANCELLED'
   - All instances cancelled
   - Socket event received by other members
   - Can create new journey after cancellation
   - Destination coordinates properly stored and accessible

### Backend Verification
Check the logs for:
```
[GroupJourney] Cancel request for <journey-id> by user <user-id>
[GroupJourney] Cancelled journey <journey-id>, X instances cancelled
```

## Security Considerations
- ✅ Only creators and admins can cancel journeys
- ✅ Journey ownership verified before cancellation
- ✅ All active instances cancelled atomically
- ✅ Cache cleared to prevent stale data
- ✅ All group members notified in real-time

## Future Enhancements
- [ ] Add cancellation reason field
- [ ] Track cancellation history
- [ ] Allow members to vote for cancellation
- [ ] Add undo functionality (within time window)
- [ ] Send push notifications for cancellations
