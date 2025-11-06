import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Share,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonLine } from '../components/Skeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { groupAPI, apiRequest, groupJourneyAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LocationPicker from '../components/LocationPicker';
import { getSocket, joinGroupJourneyRoom, leaveGroupJourneyRoom } from '../services/socket';
import { setJourneyGroupMap } from '../utils/journeyMap';
import RecentEventsPanel from '../components/RecentEventsPanel';

interface GroupMember {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    displayName: string | null;
    photoURL: string | null;
  };
}

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  code: string;
  isPrivate: boolean;
  maxMembers: number;
  coverPhotoURL?: string | null;
  creator: {
    id: string;
    displayName: string | null;
    photoURL: string | null;
  };
  members: GroupMember[];
  _count: {
    members: number;
    journeys?: number;
  };
}

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupData | null>(null);
  const [userMembership, setUserMembership] = useState<GroupMember | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [endLocation, setEndLocation] = useState<{ latitude: number; longitude: number; address?: string } | null>(null);
  const [journeyTitle, setJourneyTitle] = useState('');
  const [activeGroupJourneyId, setActiveGroupJourneyId] = useState<string | null>(null);
  const [activeSoloJourney, setActiveSoloJourney] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastManualRefreshRef = useRef<number>(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Load persisted journey state on mount
  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const key = `active_journey_${groupId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          console.log('[Persistence] Restored active journey:', stored);
          setActiveGroupJourneyId(stored);
        }
      } catch (e) {
        console.warn('[Persistence] Failed to load stored journey:', e);
      }
    })();
  }, [groupId]);
  
  // Persist journey state whenever it changes
  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const key = `active_journey_${groupId}`;
        if (activeGroupJourneyId) {
          await AsyncStorage.setItem(key, activeGroupJourneyId);
          console.log('[Persistence] Saved active journey:', activeGroupJourneyId);
        } else {
          await AsyncStorage.removeItem(key);
          console.log('[Persistence] Cleared active journey');
        }
      } catch (e) {
        console.warn('[Persistence] Failed to persist journey:', e);
      }
    })();
  }, [groupId, activeGroupJourneyId]);

  const loadGroupData = React.useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await groupAPI.getGroup(groupId!);
      if (res?.success && res?.group) {
        setGroup(res.group);
        // Find current user's membership
        let membership = res.group.members?.find((m: GroupMember) => m.userId === user?.id);
        
        // If user is the creator but not a member, auto-add them
        if (!membership && res.group.creator.id === user?.id) {
          try {
            // Call the server to add creator as member
            const addRes = await apiRequest(`/group/${groupId}/add-creator-member`, {
              method: 'POST',
            });
            if (addRes.success) {
              // Reload group data
              const reloadRes = await groupAPI.getGroup(groupId!);
              if (reloadRes?.success && reloadRes?.group) {
                setGroup(reloadRes.group);
                membership = reloadRes.group.members?.find((m: GroupMember) => m.userId === user?.id);
              }
            }
          } catch {
            // Silent fail - membership will be handled by UI
          }
        }
        
        setUserMembership(membership || null);
      }
    } catch (e: any) {
      if (!silent) {
        console.error('Failed to load group:', e);
        Alert.alert('Error', e?.message || 'Failed to load group details');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [groupId, user?.id]);

  useEffect(() => {
    if (groupId) {
      loadGroupData();
    }
  }, [groupId, loadGroupData]);

  // Auto-refresh group data every 30 seconds (silent background updates)
  useEffect(() => {
    if (!groupId) return;
    
    const interval = setInterval(() => {
      loadGroupData(true); // Silent refresh - no loading spinner
    }, 30000); // Refresh every 30 seconds to reduce rate-limit pressure
    
    return () => clearInterval(interval);
  }, [groupId, loadGroupData]);

  

  // Check for active group journey for this group
  const checkActiveJourney = useCallback(async (silent = false) => {
    if (!groupId) return;
    try {
      const res = await groupJourneyAPI.getActiveForGroup(groupId);
      if (res?.success && res?.groupJourney?.id) {
        // Only update if we have a valid journey ID
        setActiveGroupJourneyId(res.groupJourney.id);
        if (!silent) console.log('[Group Journey] Active journey found:', res.groupJourney.id);
      } else if (res?.success === false || res?.groupJourney === null) {
        // Only clear if explicitly no journey (not network error)
        setActiveGroupJourneyId(null);
        if (!silent) console.log('[Group Journey] No active journey');
      }
      // If response is undefined/malformed, keep existing state (don't clear)
    } catch (e: any) {
      // Only clear on explicit 404 (no journey exists)
      // Keep existing state on network errors or other issues
      if (e?.status === 404) {
        setActiveGroupJourneyId(null);
        if (!silent) console.log('[Group Journey] 404 - No active journey');
      } else {
        // Network error or other issue - keep existing state
        if (!silent) console.warn('[Group Journey] Error checking journey (keeping current state):', e?.message);
      }
    }
  }, [groupId]);

  useEffect(() => {
    checkActiveJourney();
  }, [checkActiveJourney]);

  // Debounced refresh to coalesce socket-triggered refreshes
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return; // already scheduled
    refreshTimerRef.current = setTimeout(async () => {
      refreshTimerRef.current = null;
      try {
        await Promise.all([
          loadGroupData(true),
          checkActiveJourney(true),
        ]);
      } catch {}
    }, 1500); // 1.5s debounce window
  }, [loadGroupData, checkActiveJourney]);

  // Auto-refresh active journey status every 30 seconds (silent background checks)
  useEffect(() => {
    if (!groupId) return;
    
    const interval = setInterval(() => {
      checkActiveJourney(true); // Silent check - no UI disruption
    }, 30000); // Check journey status every 30 seconds
    
    return () => clearInterval(interval);
  }, [groupId, checkActiveJourney]);

  // Pull-to-refresh handler with 30s throttle for manual refreshes
  const onRefresh = useCallback(async () => {
    const now = Date.now();
    const minInterval = 30_000; // 30 seconds
    if (now - lastManualRefreshRef.current < minInterval) {
      setRefreshing(false);
      Alert.alert('Please wait', 'You can refresh again in a few seconds to avoid rate limits.');
      return;
    }
    try {
      setRefreshing(true);
      await Promise.all([
        loadGroupData(true),
        checkActiveJourney(true),
      ]);
      lastManualRefreshRef.current = Date.now();
    } finally {
      setRefreshing(false);
    }
  }, [loadGroupData, checkActiveJourney]);

  // Check for active solo journey
  const checkActiveSoloJourney = useCallback(async () => {
    try {
      const res = await apiRequest('/journey/active', { method: 'GET' });
      if (res?.journey) {
        setActiveSoloJourney(res.journey);
      } else {
        setActiveSoloJourney(null);
      }
    } catch {
      setActiveSoloJourney(null);
    }
  }, []);

  useEffect(() => {
    checkActiveSoloJourney();
  }, [checkActiveSoloJourney]);

  // Auto-refresh solo journey status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkActiveSoloJourney();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [checkActiveSoloJourney]);

  // Join the journey room while this screen is active to capture timeline events
  useEffect(() => {
    if (!activeGroupJourneyId) return;
    joinGroupJourneyRoom(String(activeGroupJourneyId));
    // Also persist the journey->group mapping for reliable event attribution
    if (groupId) {
      setJourneyGroupMap(String(activeGroupJourneyId), String(groupId));
    }
    return () => {
      leaveGroupJourneyRoom(String(activeGroupJourneyId));
    };
  }, [activeGroupJourneyId, groupId]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!groupId) return;
    
    const socket = getSocket();
    if (!socket) return;
    
    // Join group room for real-time updates
    socket.emit('join-group', groupId);
    
    // Listen for member joins (silent updates)
    const handleMemberJoined = () => {
      console.log('[Socket] Member joined group');
      scheduleRefresh(); // coalesce multiple joins
    };
    
    // Listen for journey updates
    const handleJourneyStarted = (data: any) => {
      console.log('[Socket] Group journey started:', data);
      // Immediately set the journey ID from socket event
      if (data?.groupJourneyId) {
        setActiveGroupJourneyId(data.groupJourneyId);
      }
  // Schedule a debounced refresh to get full data
  scheduleRefresh();
    };
    
    const handleJourneyCompleted = (data: any) => {
      console.log('[Socket] Group journey completed:', data);
      // Clear the active journey
      setActiveGroupJourneyId(null);
  // Debounced refresh to sync state
  scheduleRefresh();
    };

    socket.on('group:member-joined', handleMemberJoined);
    socket.on('group-journey:started', handleJourneyStarted);
    socket.on('group-journey:completed', handleJourneyCompleted);
    
    return () => {
      socket.emit('leave-group', groupId);
  socket.off('group:member-joined', handleMemberJoined);
  socket.off('group-journey:started', handleJourneyStarted);
  socket.off('group-journey:completed', handleJourneyCompleted);
    };
  }, [groupId, loadGroupData, checkActiveJourney, scheduleRefresh]);

  // Preload current location for better UX in pickers
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setCurrentLocation(coords);
        }
      } catch {}
    })();
  }, []);

  const handleStartGroupJourney = async () => {
    if (!groupId || !group) return;
    // Open modal to pick start/destination and title
    const hour = new Date().getHours();
    let defaultTitle = 'Group Ride';
    if (hour < 12) defaultTitle = 'Morning Ride';
    else if (hour < 17) defaultTitle = 'Afternoon Ride';
    else defaultTitle = 'Evening Ride';
    setJourneyTitle(defaultTitle);
    setShowStartModal(true);
  };

  // No cancel flow by design

  const confirmStartGroupJourney = async () => {
    if (!groupId || !group) return;
    // V2: Only need destination (no start location)
    if (!endLocation) {
      Alert.alert('Select destination', 'Please set the destination location');
      return;
    }
    try {
      // Call using the options-based apiRequest signature
      const response = await apiRequest('/group-journey/start', {
        method: 'POST',
        body: JSON.stringify({
          groupId,
          title: journeyTitle || 'Group Ride',
          description: `Group journey with ${group.name}`,
          endLatitude: endLocation.latitude,
          endLongitude: endLocation.longitude,
        }),
      });

      if (response.success) {
        const journeyId = response.groupJourney?.id;
        // Cache a minimal active journey meta for better offline UX (title, destination)
        try {
          const metaKey = `active_journey_meta_${groupId}`;
          const meta = {
            id: journeyId,
            title: response.groupJourney?.title || (group?.name ? `${group.name} Ride` : 'Group Ride'),
            endLatitude: endLocation?.latitude,
            endLongitude: endLocation?.longitude,
            startedAt: response.groupJourney?.startedAt || new Date().toISOString(),
          };
          await AsyncStorage.setItem(metaKey, JSON.stringify(meta));
        } catch {}
        console.log('[Group Journey] Journey created successfully:', journeyId);
        
        // Immediately set the active journey ID
        setActiveGroupJourneyId(journeyId);
        
        // Close the modal
        setShowStartModal(false);
        
        // Force refresh to ensure UI is in sync
        await checkActiveJourney(true);
        await loadGroupData(true);
        
        Alert.alert('🚀 Journey Created!', 'Destination set! Now click "Start Riding" when you\'re ready to begin.', [
          {
            text: 'OK',
            onPress: () => {},
          },
        ]);
      } else {
        Alert.alert('Error', response?.message || 'Failed to start group journey');
      }
    } catch (error: any) {
      console.error('[Group Journey] Start journey error:', error);
      
      // If error is about existing journey, inform admin to complete it first (no cancel flow)
      if (error?.message?.includes('Complete or cancel') || error?.message?.includes('current journey')) {
        Alert.alert('Active Journey Exists', 'There\'s already an active journey for this group. Please complete the current journey before creating a new one.', [
          { text: 'OK', onPress: () => setShowStartModal(false) }
        ]);
      } else {
        Alert.alert('Error', error?.message || 'Failed to start journey');
      }
    }
  };

  const handleStartRiding = async () => {
    if (!activeGroupJourneyId) return;
    
    // Check for active solo journey first
    if (activeSoloJourney) {
      Alert.alert(
        '⚠️ Active Journey Detected',
        `You have an active solo journey "${activeSoloJourney.title || 'Untitled'}". Please complete or pause it before starting a group journey.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Solo Journey',
            onPress: () => router.push('/journey'),
          },
        ]
      );
      return;
    }
    
    try {
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to start riding');
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      // Call new V2 endpoint to start user's instance
      const response = await apiRequest(`/group-journey/${activeGroupJourneyId}/start-my-instance`, {
        method: 'POST',
        body: JSON.stringify({
          startLatitude: location.coords.latitude,
          startLongitude: location.coords.longitude,
        }),
      });

      if (response.success) {
        // Persist minimal instance data for offline restore
        try {
          const inst = response.instance;
          const cached = {
            id: inst?.id,
            status: inst?.status,
            groupJourneyId: activeGroupJourneyId,
            groupId: groupId,
            groupJourney: {
              id: activeGroupJourneyId,
              groupId: groupId,
              title: group?.name ? `${group.name} Ride` : 'Group Ride',
            },
          };
          await AsyncStorage.setItem('cachedMyGroupInstance', JSON.stringify(cached));
        } catch {}

        // Navigate immediately to the Journey screen
        router.push({ pathname: '/journey', params: { groupId, groupJourneyId: activeGroupJourneyId } });
      } else {
        Alert.alert('Error', response?.message || 'Failed to start riding');
      }
    } catch (error: any) {
      console.error('Start riding error:', error);
      Alert.alert('Error', error?.message || 'Failed to start riding');
    }
  };

  const handleShareCode = async () => {
    if (!group) return;
    try {
      await Share.share({
        message: `Join my group "${group.name}" on Wayfarian! Use code: ${group.code}`,
      });
    } catch (e) {
      console.warn('Share failed:', e);
    }
  };

  const handleUploadCoverPhoto = async () => {
    if (!group || !isAdmin) return;
    
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need access to your photos to set a cover.');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [2, 1], // 2:1 aspect ratio for cover photos
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const imageUri = result.assets[0].uri;
      console.log('[Group Cover] Selected image:', imageUri);

      // Show loading
      Alert.alert('Uploading...', 'Please wait while we upload your cover photo.');

      // Upload to server
      const uploadResult = await groupAPI.uploadGroupCover(group.id, imageUri);
      console.log('[Group Cover] Upload successful:', uploadResult?.imageUrl);

      // Reload group data to show new cover
      await loadGroupData(true);

      Alert.alert('Success', 'Cover photo updated successfully!');
    } catch (e: any) {
      console.error('[Group Cover] Upload failed:', e);
      Alert.alert('Upload Failed', e?.message || 'Failed to upload cover photo. Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.headerContainer}>
            <Skeleton height={160} />
            <View style={[styles.headerOverlay, { justifyContent: 'flex-end', padding: 16 }]}>
              <SkeletonLine width={200} height={24} style={{ marginBottom: 8 }} />
              <SkeletonLine width={120} height={14} />
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>Members</Text>
              {Array.from({ length: 5 }).map((_, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <SkeletonCircle size={40} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <SkeletonLine width={160} height={14} style={{ marginBottom: 6 }} />
                    <SkeletonLine width={100} height={12} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loader}>
          <Text style={styles.errorText}>Group not found</Text>
          <TouchableOpacity style={styles.backButtonSimple} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Check if user is creator (by membership role or by being the group creator)
  const isCreator = userMembership?.role === 'CREATOR' || group.creator.id === user?.id;
  const isAdmin = userMembership?.role === 'ADMIN' || isCreator;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header with Cover Photo Background */}
        <View style={styles.headerContainer}>
          {/* Background: Cover Photo or Gradient */}
          {group.coverPhotoURL ? (
            <Image
              source={{ uri: group.coverPhotoURL }}
              style={styles.coverPhoto}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#4A5568', '#2D3748']}
              style={styles.coverPhoto}
            />
          )}
          
          {/* Overlay with Gradient for Text Readability */}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']}
            style={styles.headerOverlay}
          >
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            <View style={styles.headerContent}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <View style={styles.groupMeta}>
                <MaterialIcons name="people" size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.memberCount}>{group._count.members} / {group.maxMembers} members</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {isAdmin && (
                <>
                  <TouchableOpacity style={styles.editCoverButton} onPress={handleUploadCoverPhoto}>
                    <MaterialIcons name="edit" size={20} color="#FFFFFF" />
                    <Text style={styles.editCoverText}>Edit Cover</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareButton} onPress={handleShareCode}>
                    <MaterialIcons name="share" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          

          {/* Description */}
          {group.description && (
            <View style={styles.descriptionCard}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{group.description}</Text>
            </View>
          )}

          {/* Members Section */}
          <View style={styles.membersSection}>
            <Text style={styles.sectionTitle}>Members ({group._count.members})</Text>
            <View style={styles.membersList}>
              {group.members.slice(0, 10).map((member) => (
                <View key={member.id} style={styles.memberItem}>
                  <Image
                    source={{ uri: member.user.photoURL || 'https://via.placeholder.com/40' }}
                    style={styles.memberAvatar}
                  />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.user.displayName || 'Wayfarian User'}
                      {member.userId === user?.id && ' (You)'}
                    </Text>
                    {member.role === 'CREATOR' && (
                      <Text style={styles.memberRole}>Creator</Text>
                    )}
                    {member.role === 'ADMIN' && (
                      <Text style={styles.memberRole}>Admin</Text>
                    )}
                  </View>
                </View>
              ))}
              {group._count.members > 10 && (
                <Text style={styles.moreMembers}>+{group._count.members - 10} more</Text>
              )}
            </View>
          </View>

          {/* Recent Activity */}
          {groupId && (
            <RecentEventsPanel groupId={String(groupId)} groupJourneyId={activeGroupJourneyId || undefined} />
          )}

          {/* Group Code Card - polished */}
          {isAdmin && (
            <View style={styles.codeCardEnhanced}>
              <View style={styles.codeHeaderRow}>
                <Text style={styles.sectionTitle}>Invite Members</Text>
                <TouchableOpacity onPress={handleShareCode} style={styles.copyCodeButton}>
                  <MaterialIcons name="share" size={18} color="#111827" />
                  <Text style={styles.copyCodeText}>Share</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.codeValueRow}>
                <Text style={styles.codeBig}>{group.code}</Text>
                <TouchableOpacity onPress={() => Share.share({ message: group.code })} style={styles.copyOnlyButton}>
                  <MaterialIcons name="content-copy" size={18} color="#4B5563" />
                </TouchableOpacity>
              </View>
              <Text style={styles.codeHint}>Use this code to join the group</Text>
            </View>
          )}

          

          {/* Active Journey Card - Shows active journey info */}
          {activeGroupJourneyId && isAdmin && (
            <View style={styles.activeJourneyCard}>
              <View style={styles.activeJourneyHeader}>
                <MaterialIcons name="directions-bike" size={24} color="#10B981" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.activeJourneyTitle}>Active Group Journey</Text>
                </View>
              </View>
              <Text style={styles.activeJourneyHint}>
                Journey is active. Members can start riding.
              </Text>
            </View>
          )}

          {/* Start Journey Button - Only for creators/admins when no active journey */}
          {isAdmin && !activeGroupJourneyId && (
            <TouchableOpacity style={styles.startJourneyButton} onPress={handleStartGroupJourney}>
              <MaterialIcons name="navigation" size={24} color="#FFFFFF" />
              <Text style={styles.startJourneyText}>Start Group Journey</Text>
            </TouchableOpacity>
          )}

          {/* Active Solo Journey Warning */}
          {activeSoloJourney && (
            <View style={styles.warningCard}>
              <MaterialIcons name="warning" size={20} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningText}>
                  You have an active solo journey. Complete it before starting a group journey.
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/journey')} style={styles.viewJourneyLink}>
                <Text style={styles.viewJourneyText}>View</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Start Riding Button - For ALL members (including creator) when active journey exists */}
          {activeGroupJourneyId && !activeSoloJourney && (
            <TouchableOpacity style={styles.startJourneyButton} onPress={handleStartRiding}>
              <MaterialIcons name="directions-bike" size={24} color="#FFFFFF" />
              <Text style={styles.startJourneyText}>Start Riding</Text>
            </TouchableOpacity>
          )}

          {/* Info for when no active journey */}
          {!activeGroupJourneyId && !isAdmin && (
            <View style={styles.infoCard}>
              <MaterialIcons name="info-outline" size={20} color="#6366f1" />
              <Text style={styles.infoText}>
                The group journey hasn&apos;t started yet. You&apos;ll be able to start riding as soon as the admin creates it.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Start Journey Modal - V2: Only destination needed */}
      <Modal visible={showStartModal} animationType="slide" transparent onRequestClose={() => setShowStartModal(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Destination</Text>
            <Text style={styles.modalSubtitle}>Choose where the group should ride to. Each member will start from their own location.</Text>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Destination</Text>
              <LocationPicker
                placeholder="Choose destination"
                value={endLocation?.address || ''}
                onLocationSelect={(loc) => setEndLocation({ latitude: loc.latitude, longitude: loc.longitude, address: loc.address })}
                currentLocation={currentLocation || undefined}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowStartModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, !endLocation && { opacity: 0.6 }]} onPress={confirmStartGroupJourney}>
                <Text style={styles.modalConfirmText}>Create Journey</Text>
              </TouchableOpacity>
            </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F6',
  },
  scrollView: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
    fontFamily: 'Space Grotesk',
  },
  errorText: {
    fontSize: 16,
    color: '#999999',
    fontFamily: 'Space Grotesk',
    marginBottom: 20,
  },
  backButtonSimple: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#F9A825',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
  headerContainer: {
    marginBottom: 20,
    position: 'relative',
    height: 200,
    overflow: 'hidden',
  },
  coverPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerContent: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberCount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Space Grotesk',
  },
  headerActions: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  editCoverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    gap: 6,
  },
  editCoverText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 40,
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  codeLabel: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Space Grotesk',
    marginBottom: 8,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4A5568',
    fontFamily: 'Space Grotesk',
    letterSpacing: 4,
    marginBottom: 8,
  },
  codeHint: {
    fontSize: 12,
    color: '#999999',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
  },
  descriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Space Grotesk',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Space Grotesk',
    lineHeight: 20,
  },
  membersSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  membersList: {
    gap: 12,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Space Grotesk',
  },
  memberRole: {
    fontSize: 12,
    color: '#F9A825',
    fontFamily: 'Space Grotesk',
    marginTop: 2,
  },
  moreMembers: {
    fontSize: 14,
    color: '#999999',
    fontFamily: 'Space Grotesk',
    textAlign: 'center',
    paddingVertical: 8,
  },
  startJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9A825',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  startJourneyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
  },
  joinJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  joinJourneyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Space Grotesk',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6366f1',
    fontFamily: 'Space Grotesk',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#fef3c7',
    marginBottom: 16,
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    fontFamily: 'Space Grotesk',
    lineHeight: 20,
  },
  activeJourneyCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  activeJourneyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeJourneyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
    fontFamily: 'Space Grotesk',
  },
  activeJourneyId: {
    fontSize: 12,
    color: '#10B981',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  activeJourneyHint: {
    fontSize: 13,
    color: '#047857',
    fontFamily: 'Space Grotesk',
  },
  cancelJourneyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  cancelJourneyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    fontFamily: 'Space Grotesk',
  },
  viewJourneyLink: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewJourneyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Space Grotesk',
  },
  // Enhanced code card styles
  codeCardEnhanced: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  codeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  copyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyCodeText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  codeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeBig: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#111827',
    flex: 1,
  },
  copyOnlyButton: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'Space Grotesk',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalField: {
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirm: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
