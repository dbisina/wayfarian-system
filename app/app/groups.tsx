import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton, SkeletonLine } from '../components/Skeleton';
import Header from '@/components/ui/Header';
import GroupCard from '@/components/ui/GroupCard';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
      Alert.alert(t('group.joinFailed'), e?.message || t('group.invalidCode'));
    }
  };

  return (
    <View style={styles.container}>
      <Header title={t('group.title')} />
      {loading ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: 20 }]}> 
          <View style={styles.myGroupsSection}>
            <Text style={styles.sectionTitle}>{t('group.myGroups')}</Text>
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
            <Text style={styles.sectionTitle}>{t('group.myGroups')}</Text>
            {groups.length === 0 ? (
              <Text style={styles.emptyText}>{t('group.noGroups')}</Text>
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
            <Text style={styles.sectionTitle}>{t('group.createOrJoin')}</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.createButton} onPress={handleCreateGroup}>
                <Text style={styles.createButtonText}>{t('group.createGroup')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.joinButton} onPress={handleJoinGroup}>
                <Text style={styles.joinButtonText}>{t('group.joinGroup')}</Text>
              </TouchableOpacity>
            </View>
            {showJoin && (
              <View style={styles.joinInline}>
                <TextInput
                  style={styles.joinInput}
                  placeholder={t('group.enterCode')}
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
                  <Text style={styles.joinConfirmText}>{t('group.join')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      )}
      
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/future-rides' as any)}
      >
        <Ionicons name="calendar" size={24} color="#fff" />
      </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});
