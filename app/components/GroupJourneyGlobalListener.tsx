import { useEffect } from 'react';
import { Alert } from 'react-native';
import { connectSocket, on as socketOn, off as socketOff, joinGroupJourneyRoom, leaveGroupJourneyRoom } from '../services/socket';
import { router } from 'expo-router';
import { addEvent } from '../utils/recentEvents';
import { setJourneyGroupMap, removeJourneyGroupMap, resolveGroupId } from '../utils/journeyMap';

export default function GroupJourneyGlobalListener() {
  useEffect(() => {
    let mounted = true;
    const joinedJourneys = new Set<string>(); // track rooms we joined globally
    (async () => {
      try {
        await connectSocket();
      } catch {}
    })();

    const handleStarted = (data: any) => {
      if (!mounted) return;
      try {
        // Cache a recent event for offline timeline
        if (data?.groupId) {
          addEvent(String(data.groupId), {
            type: 'journey_started',
            groupJourneyId: data?.groupJourneyId,
            message: `${data?.title || 'Group Ride'} started`,
            meta: { title: data?.title },
          });
        }
        if (data?.groupJourneyId && data?.groupId) {
          setJourneyGroupMap(String(data.groupJourneyId), String(data.groupId));
        }
        // Join journey room to receive rich events (messages/photos/status)
        if (data?.groupJourneyId && !joinedJourneys.has(data.groupJourneyId)) {
          joinGroupJourneyRoom(String(data.groupJourneyId));
          joinedJourneys.add(String(data.groupJourneyId));
        }
        Alert.alert(
          'Journey Started!',
          `${data?.title || 'Group Ride'} has begun. Join now?`,
          [
            {
              text: 'Join Journey',
              onPress: () => {
                try {
                  if (data?.groupId && data?.groupJourneyId) {
                    router.push({ 
                      pathname: '/journey', 
                      params: { 
                        groupId: String(data.groupId), 
                        groupJourneyId: String(data.groupJourneyId) 
                      } 
                    });
                  } else {
                    console.warn('[GroupJourney] Missing groupId or groupJourneyId in alert data');
                  }
                } catch (error) {
                  console.error('[GroupJourney] Navigation error:', error);
                  Alert.alert('Error', 'Failed to navigate to journey. Please try again.');
                }
              },
            },
            { text: 'Later', style: 'cancel' },
          ]
        );
      } catch {}
    };

    const handleCompleted = (data: any) => {
      if (!mounted) return;
      try {
        if (data?.groupId) {
          addEvent(String(data.groupId), {
            type: 'journey_completed',
            groupJourneyId: data?.groupJourneyId,
            message: `${data?.title || 'Group Ride'} completed`,
            meta: { title: data?.title },
          });
        }
        if (data?.groupJourneyId) {
          removeJourneyGroupMap(String(data.groupJourneyId));
        }
        if (data?.groupJourneyId && joinedJourneys.has(String(data.groupJourneyId))) {
          leaveGroupJourneyRoom(String(data.groupJourneyId));
          joinedJourneys.delete(String(data.groupJourneyId));
        }
      } catch {}
    };

    const handleMemberJoined = (data: any) => {
      if (!mounted) return;
      try {
        const gid = data?.groupId || data?.group?.id;
        if (gid) {
          addEvent(String(gid), {
            type: 'member_joined',
            userId: data?.userId || data?.user?.id,
            userName: data?.user?.displayName || data?.displayName || undefined,
            userPhotoURL: data?.user?.photoURL || undefined,
            message: `${data?.user?.displayName || 'A member'} joined the group`,
            meta: { user: data?.user },
          });
        }
      } catch {}
    };

    // Journey timeline events (messages/photos/status)
    const handleJourneyEvent = async (evt: any) => {
      if (!mounted) return;
      try {
        const gjId = evt?.groupJourneyId ? String(evt.groupJourneyId) : undefined;
        if (!gjId) return;
        // Derive groupId from payload or mapping
        let groupId = evt?.group?.id || evt?.data?.groupId || evt?.groupId;
        if (!groupId) {
          const mapped = await resolveGroupId(gjId);
          if (mapped) groupId = mapped;
        }
        if (!groupId) return;

        const base = {
          groupJourneyId: gjId,
          userId: evt?.user?.id,
          userName: evt?.user?.displayName,
          userPhotoURL: evt?.user?.photoURL,
          meta: { latitude: evt?.latitude, longitude: evt?.longitude, mediaUrl: evt?.mediaUrl, rawType: evt?.type, data: evt?.data },
        } as const;

        const t = String(evt?.type || '').toUpperCase();
        if (t === 'MESSAGE') {
          addEvent(String(groupId), { type: 'message', message: evt?.message || 'Message', ...base });
          return;
        }
        if (t === 'PHOTO') {
          addEvent(String(groupId), { type: 'photo_uploaded', message: evt?.message || 'Photo shared', ...base });
          return;
        }
        if (t === 'STATUS') {
          const statusCode = String(evt?.data?.status || evt?.data?.code || '').toUpperCase();
          if (statusCode === 'PAUSED' || statusCode === 'PAUSE') {
            addEvent(String(groupId), { type: 'instance_paused', message: evt?.message || 'Paused', ...base });
            return;
          }
          if (statusCode === 'RESUMED' || statusCode === 'RESUME') {
            addEvent(String(groupId), { type: 'instance_resumed', message: evt?.message || 'Resumed', ...base });
            return;
          }
          // Fallback to message with provided content
          addEvent(String(groupId), { type: 'message', message: evt?.message || statusCode || 'Status update', ...base });
          return;
        }
        // Fallback for unknown types
        addEvent(String(groupId), { type: 'message', message: evt?.message || 'Event', ...base });
      } catch {}
    };

    // Instance pause/resume in journey room
    const handleInstancePaused = (data: any) => {
      try {
        const gid = data?.groupId; // may be missing; skip if unknown
        if (!gid) return;
        addEvent(String(gid), { type: 'instance_paused', userId: data?.userId, message: 'A rider paused' });
      } catch {}
    };

    const handleInstanceResumed = (data: any) => {
      try {
        const gid = data?.groupId; // may be missing; skip if unknown
        if (!gid) return;
        addEvent(String(gid), { type: 'instance_resumed', userId: data?.userId, message: 'A rider resumed' });
      } catch {}
    };

    socketOn('group-journey:started', handleStarted);
    socketOn('group-journey:completed', handleCompleted);
    socketOn('group:member-joined', handleMemberJoined);
    socketOn('group-journey:event', handleJourneyEvent);
    socketOn('member:instance-paused', handleInstancePaused);
    socketOn('member:instance-resumed', handleInstanceResumed);

    return () => {
      mounted = false;
      socketOff('group-journey:started', handleStarted);
      socketOff('group-journey:completed', handleCompleted);
      socketOff('group:member-joined', handleMemberJoined);
      socketOff('group-journey:event', handleJourneyEvent);
      socketOff('member:instance-paused', handleInstancePaused);
      socketOff('member:instance-resumed', handleInstanceResumed);
    };
  }, []);

  return null;
}
