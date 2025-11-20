import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { Skeleton, SkeletonLine } from '../components/Skeleton';
import Header from '@/components/ui/Header';
import GroupCard from '@/components/ui/GroupCard';
import { router } from 'expo-router';
import { groupAPI } from '../services/api';

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
  coverPhotoURL?: string;
}

export default function GroupsScreen(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const loadGroups = async (silent = false) => {
    try {
      const res = await groupAPI.getUserGroups('active');
      if (res && Array.isArray(res.groups)) {
        const resolveMemberCount = (group: any) => {
          const directCount = group?.memberCount ?? group?.membersCount;
          if (typeof directCount === 'number' && !Number.isNaN(directCount)) {
            return directCount;
          }

          const countFromAggregate = group?._count?.members;
          if (typeof countFromAggregate === 'number' && !Number.isNaN(countFromAggregate)) {
            return countFromAggregate;
          }

          if (Array.isArray(group?.members)) {
            return group.members.length;
          }

          return 1;
        };

        setGroups(res.groups.map((g: any) => ({ 
          id: g.id, 
          name: g.name, 
          memberCount: resolveMemberCount(g),
          coverPhotoURL: g.coverPhotoURL
        })));
      } else {
        setGroups([]);
      }
    } catch (e) {
      if (!silent) {
        console.warn('Failed to load groups:', e);
      }
      setGroups([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // Auto-refresh groups every 10 seconds (silent background updates)
  useEffect(() => {
    const interval = setInterval(() => {
      loadGroups(true); // Silent refresh - no loading state change
    }, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleCreateGroup = () => router.push('/new-group');
  const handleJoinGroup = () => setShowJoin((prev) => !prev);
  const handleSubmitJoin = async () => {
    const code = joinCode.trim();
    if (!code) return;
    try {
      const res = await groupAPI.joinGroup(code);
      const gid = res?.group?.id || res?.groupId || res?.id;
      if (!gid) throw new Error('Invalid join response');
      setJoinCode('');
      setShowJoin(false);
      router.push(`/group-detail?groupId=${gid}`);
    } catch (e: any) {
      Alert.alert('Join failed', e?.message || 'Invalid or expired code');
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Groups" />
      {loading ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 20 }]}> 
          <View style={styles.myGroupsSection}>
            <Text style={styles.sectionTitle}>My Groups</Text>
            <View style={styles.groupsList}>
              {Array.from({ length: 3 }).map((_, idx) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <Skeleton height={80} borderRadius={12} />
                  <View style={{ position: 'absolute', left: 16, top: 16, right: 16 }}>
                    <SkeletonLine width={160} height={16} style={{ marginBottom: 8 }} />
                    <SkeletonLine width={100} height={12} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.myGroupsSection}>
            <Text style={styles.sectionTitle}>My Groups</Text>
            {groups.length === 0 ? (
              <Text style={styles.emptyText}>You are not in any groups yet.</Text>
            ) : (
              <View style={styles.groupsList}>
                {groups.map((group) => (
                  <GroupCard
                    key={group.id}
                    name={group.name}
                    memberCount={group.memberCount}
                    icon="people"
                    coverPhotoURL={group.coverPhotoURL}
                    onPress={() => router.push(`/group-detail?groupId=${group.id}`)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.createJoinSection}>
            <Text style={styles.sectionTitle}>Create or Join</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.createButton} onPress={handleCreateGroup}>
                <Text style={styles.createButtonText}>Create Group</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.joinButton} onPress={handleJoinGroup}>
                <Text style={styles.joinButtonText}>Join Group</Text>
              </TouchableOpacity>
            </View>
            {showJoin && (
              <View style={styles.joinInline}>
                <TextInput
                  style={styles.joinInput}
                  placeholder="Enter code"
                  placeholderTextColor="#999999"
                  value={joinCode}
                  onChangeText={setJoinCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.joinConfirm, !joinCode.trim() && styles.joinConfirmDisabled]}
                  onPress={handleSubmitJoin}
                  disabled={!joinCode.trim()}
                >
                  <Text style={styles.joinConfirmText}>Join</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 24 },
  myGroupsSection: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: '#000000', fontFamily: 'Space Grotesk', lineHeight: 28, marginBottom: 12 },
  groupsList: { gap: 0 },
  emptyText: { fontSize: 16, color: '#666666', fontFamily: 'Space Grotesk', paddingVertical: 12 },
  createJoinSection: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12 },
  actionButtons: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  createButton: { width: 181, height: 40, backgroundColor: '#F9A825', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  createButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Space Grotesk', lineHeight: 21 },
  joinButton: { width: 165, height: 40, backgroundColor: '#3E4751', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  joinButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Space Grotesk', lineHeight: 21 },
  joinInline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  joinInput: { flex: 1, height: 40, backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 12, color: '#000000', fontFamily: 'Space Grotesk' },
  joinConfirm: { height: 40, paddingHorizontal: 16, backgroundColor: '#F9A825', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  joinConfirmDisabled: { backgroundColor: '#E0E0E0' },
  joinConfirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, fontFamily: 'Space Grotesk' },
});
