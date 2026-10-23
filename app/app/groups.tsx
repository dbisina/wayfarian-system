import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import TextInput from '../components/dw/DWTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { groupAPI } from '../services/api';
import { SkeletonLine } from '../components/Skeleton';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
  coverPhotoURL?: string;
  isAdmin: boolean;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'G';

export default function GroupsScreen(): React.JSX.Element {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const { t } = useTranslation();

  const loadGroups = async (silent = false) => {
    try {
      const res = await groupAPI.getUserGroups('active');
      if (res && Array.isArray(res.groups)) {
        const resolveMemberCount = (group: any) => {
          const directCount = group?.memberCount ?? group?.membersCount;
          if (typeof directCount === 'number' && !Number.isNaN(directCount)) return directCount;
          const countFromAggregate = group?._count?.members;
          if (typeof countFromAggregate === 'number' && !Number.isNaN(countFromAggregate)) return countFromAggregate;
          if (Array.isArray(group?.members)) return group.members.length;
          return 1;
        };
        setGroups(
          res.groups.map((g: any) => ({
            id: g.id,
            name: g.name,
            memberCount: resolveMemberCount(g),
            coverPhotoURL: g.coverPhotoURL,
            isAdmin: g.role === 'ADMIN' || g.myRole === 'ADMIN' || g.isAdmin === true,
          }))
        );
      } else {
        setGroups([]);
      }
    } catch (e) {
      if (!silent) console.warn('Failed to load groups:', e);
      setGroups([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // Silent background refresh every 10 seconds.
  useEffect(() => {
    const interval = setInterval(() => loadGroups(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmitJoin = async () => {
    const code = joinCode.trim();
    if (!code) return;
    try {
      const res = await groupAPI.joinGroup(code);
      const gid = res?.group?.id || res?.groupId || res?.id;
      if (!gid) throw new Error('Invalid join response');
      setJoinCode('');
      router.push(`/group-detail?groupId=${gid}`);
    } catch (e: any) {
      Alert.alert(t('group.joinFailed'), e?.message || t('group.invalidCode'));
    }
  };

  const top = Math.max(56, insets.top + 8);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <View style={[styles.header, { paddingTop: top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={[styles.h1, { color: d.ink }]}>{t('group.title')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/new-group' as never)}
          accessibilityRole="button"
          style={[styles.newBtn, { backgroundColor: d.ink }]}
        >
          <Icon name="plus" size={14} color={d.bg} stroke={3} />
          <Text style={[styles.newText, { color: d.bg }]}>New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: 18, gap: 18 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.codeBar, shadow(d, 8), { backgroundColor: d.surface }]}>
          <Text style={[styles.codeLabel, { color: d.ink2 }]}>Got a code?</Text>
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder="WF-7K2Q"
            placeholderTextColor={d.ink2}
            autoCapitalize="characters"
            accessibilityLabel="Group code"
            onSubmitEditing={handleSubmitJoin}
            style={[styles.codeInput, { color: d.ink }]}
          />
          <TouchableOpacity
            onPress={handleSubmitJoin}
            disabled={!joinCode.trim()}
            accessibilityRole="button"
            style={[styles.joinBtn, { backgroundColor: d.ink, opacity: joinCode.trim() ? 1 : 0.5 }]}
          >
            <Text style={[styles.joinText, { color: d.bg }]}>{t('group.join')}</Text>
          </TouchableOpacity>
        </View>

        <View>
          <Text style={[styles.eyebrow, { color: d.ink2 }]}>{t('group.myGroups')}</Text>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={[styles.row, { borderTopColor: d.line }]}>
                <SkeletonLine width={56} height={56} />
                <SkeletonLine width={160} height={16} />
              </View>
            ))
          ) : groups.length === 0 ? (
            <Text style={[styles.empty, { color: d.ink2 }]}>{t('group.noGroups')}</Text>
          ) : (
            groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => router.push(`/group-detail?groupId=${g.id}`)}
                style={[styles.row, { borderTopColor: d.line }]}
                accessibilityRole="button"
              >
                <View style={styles.coverWrap}>
                  {g.coverPhotoURL ? (
                    <Image source={{ uri: g.coverPhotoURL }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, { backgroundColor: d.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="route" size={22} color={d.ink2} stroke={2} />
                    </View>
                  )}
                  <View
                    style={[
                      styles.mark,
                      { backgroundColor: g.isAdmin ? AMBER : INK, borderColor: d.bg },
                    ]}
                  >
                    <Text style={[styles.markText, { color: g.isAdmin ? INK : AMBER }]}>{initials(g.name)}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: d.ink }]} numberOfLines={1}>{g.name}</Text>
                  <Text style={[styles.meta, { color: d.ink2 }]}>
                    {g.memberCount} {g.memberCount === 1 ? 'rider' : 'riders'}
                    {g.isAdmin ? ' · you are admin' : ''}
                  </Text>
                </View>
                <Icon name="chevron" size={18} color={d.ink2} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, fontFamily: F.black, fontSize: 28, letterSpacing: -0.6 },
  newBtn: { height: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newText: { fontFamily: F.black, fontSize: 14 },
  codeBar: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: 6 },
  codeLabel: { fontFamily: F.extra, fontSize: 13 },
  codeInput: { flex: 1, fontFamily: F.monoBold, fontSize: 16, letterSpacing: 1.9, padding: 0 },
  joinBtn: { height: 42, paddingHorizontal: 18, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontFamily: F.black, fontSize: 13 },
  eyebrow: { fontFamily: F.extra, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginHorizontal: 4, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 78, borderTopWidth: 1, paddingHorizontal: 4 },
  coverWrap: { width: 56, height: 56 },
  cover: { width: 56, height: 56, borderRadius: 18 },
  mark: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 8, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: F.black, fontSize: 9 },
  name: { fontFamily: F.extra, fontSize: 16 },
  meta: { fontFamily: F.regular, fontSize: 12 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
});
