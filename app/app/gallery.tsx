// app/app/gallery.tsx — ride gallery. Albums are the user's rides that have photos.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { userAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { getFirebaseDownloadUrl } from '../utils/storage';
import Icon from '../components/dw/Icon';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';

const FILTERS = ['All', 'Solo', 'Group', 'Night'] as const;
const ROT = [-4, 3, -2, 4, -3];

const photoUri = (p: any) => getFirebaseDownloadUrl(p?.thumbnailUrl || p?.imageUrl || p?.firebasePath) || p?.thumbnailUrl || p?.imageUrl || p?.firebasePath;

export default function GalleryScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { convertDistance } = useSettings();
  const [journeys, setJourneys] = useState<any[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      userAPI
        .getJourneyHistory({ limit: 60, sortBy: 'startTime', sortOrder: 'desc' })
        .then((res: any) => setJourneys((res?.journeys || []).filter((j: any) => (j.photos?.length || 0) > 0 || j.coverPhotoUrl)))
        .catch(() => {});
    }, [])
  );

  const shown = useMemo(
    () =>
      journeys.filter((j) => {
        if (filter === 'Solo' && j.group) return false;
        if (filter === 'Group' && !j.group) return false;
        if (filter === 'Night' && new Date(j.startTime).getHours() < 19 && new Date(j.startTime).getHours() > 5) return false;
        const q = query.trim().toLowerCase();
        return !q || (j.customTitle || j.title || '').toLowerCase().includes(q);
      }),
    [journeys, filter, query]
  );

  const latest = shown[0];
  const name = user?.displayName || 'Your';
  const initials = (user?.displayName || 'W').split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]!.toUpperCase()).join('');
  const cover = latest ? photoUri({ imageUrl: latest.coverPhotoUrl }) || photoUri(latest.photos?.[0]) : null;
  const open = (j: any) => router.push({ pathname: '/gallery-album', params: { journeyId: j.id } } as never);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{ paddingTop: Math.max(56, insets.top + 8), paddingBottom: 120, gap: 18 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: d.ink2 }]}>{name}&apos;s</Text>
            <Text style={[styles.h1, { color: d.ink }]}>Ride gallery</Text>
          </View>
        </View>

        {shown.length > 0 && (
          <View style={styles.strip} accessibilityRole="list">
            {shown.slice(0, 5).map((j, i) => (
              <TouchableOpacity key={j.id} onPress={() => open(j)} accessibilityRole="button" accessibilityLabel={`Open ${j.customTitle || j.title} album`}>
                <Image
                  source={{ uri: photoUri({ imageUrl: j.coverPhotoUrl }) || photoUri(j.photos?.[0]) }}
                  style={[styles.stripImg, { borderColor: d.bg, transform: [{ rotate: `${ROT[i % ROT.length]}deg` }] }]}
                />
              </TouchableOpacity>
            ))}
            {shown.length > 5 && (
              <View style={[styles.stripMore, { backgroundColor: d.surface2, borderColor: d.bg }]}>
                <Text style={[styles.stripMoreText, { color: d.ink2 }]}>+{shown.length - 5}</Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.search, shadow(d, 8), { backgroundColor: d.surface }]}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={d.ink2} strokeWidth={2} strokeLinecap="round">
            <Path d="M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.2-4.2" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search places, rides, people"
            placeholderTextColor={d.ink2}
            accessibilityLabel="Search gallery"
            style={[styles.searchInput, { color: d.ink }]}
          />
        </View>

        <View style={styles.chips} accessibilityRole="radiogroup">
          {FILTERS.map((f) => {
            const on = f === filter;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on ? { backgroundColor: d.ink } : { borderWidth: 1.5, borderColor: d.line2 }]}
              >
                <Text style={[styles.chipText, { color: on ? d.bg : d.ink }]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.headRow}>
          <Text style={[styles.h2, { color: d.ink }]}>Latest album</Text>
        </View>

        {latest ? (
          <TouchableOpacity
            onPress={() => open(latest)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Open ${latest.customTitle || latest.title} album`}
            style={styles.album}
          >
            <View style={[styles.layer2, { backgroundColor: d.dark ? '#221F1C' : '#E8E2D5' }]} />
            <View style={[styles.layer1, { backgroundColor: d.dark ? '#2C2925' : '#DCD5C6' }]} />
            <View style={[styles.albumBody, { backgroundColor: d.surface2 }]}>
              {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : null}
              <View style={styles.albumShade} />
              <View style={styles.albumPill}>
                <Text style={styles.albumPillText}>
                  {latest.photos?.length || 1} photos · {convertDistance(latest.totalDistance || 0)} ·{' '}
                  {new Date(latest.startTime).toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
              </View>
              <View style={styles.albumGo}>
                <Icon name="chevron" size={18} color={INK} stroke={2.4} />
              </View>
            </View>
            <Text style={[styles.albumTitle, { color: d.ink }]} numberOfLines={1}>{latest.customTitle || latest.title}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.empty, { color: d.ink2 }]}>No photos yet. Take some on your next ride.</Text>
        )}
      </ScrollView>

      {latest && (
        <TouchableOpacity
          onPress={() => open(latest)}
          accessibilityRole="button"
          style={[styles.openBtn, { backgroundColor: d.ink, bottom: Math.max(34, insets.bottom + 14) }]}
        >
          <Text style={[styles.openText, { color: d.bg }]}>Open album</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.black, fontSize: 14, color: AMBER },
  small: { fontFamily: F.regular, fontSize: 12 },
  h1: { fontFamily: F.black, fontSize: 20, letterSpacing: -0.2 },
  strip: { flexDirection: 'row', paddingLeft: 16, alignItems: 'center' },
  stripImg: { width: 58, height: 58, borderRadius: 16, borderWidth: 3, marginRight: -10 },
  stripMore: { width: 58, height: 58, borderRadius: 16, borderWidth: 3, marginLeft: 14, alignItems: 'center', justifyContent: 'center' },
  stripMoreText: { fontFamily: F.monoBold, fontSize: 13 },
  search: { marginHorizontal: 16, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontFamily: F.regular, fontSize: 15, padding: 0 },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.extra, fontSize: 13 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, alignItems: 'baseline' },
  h2: { fontFamily: F.black, fontSize: 18 },
  album: { marginHorizontal: 16, marginTop: 6 },
  layer2: { position: 'absolute', top: -14, left: 196, right: 22, height: 40, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  layer1: { position: 'absolute', top: -7, left: 186, right: 11, height: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  albumBody: { height: 380, borderRadius: 28, overflow: 'hidden' },
  albumShade: { ...StyleSheet.absoluteFillObject, top: 240, backgroundColor: 'rgba(17,16,14,0.35)' },
  albumTitle: { position: 'absolute', top: 14, left: 14, fontFamily: F.black, fontSize: 16, color: '#FFFDF8' },
  albumPill: { position: 'absolute', left: 14, bottom: 14, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(26,24,20,0.45)', justifyContent: 'center' },
  albumPillText: { fontFamily: F.monoBold, fontSize: 12, color: '#FFFDF8' },
  albumGo: { position: 'absolute', right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
  openBtn: { position: 'absolute', left: 16, right: 16, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  openText: { fontFamily: F.black, fontSize: 15 },
});
