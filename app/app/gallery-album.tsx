// app/app/gallery-album.tsx — one ride's photos. Param: journeyId.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { journeyAPI } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { getFirebaseDownloadUrl } from '../utils/storage';
import Icon from '../components/dw/Icon';
import { AMBER, F, shadow, useDW } from '../constants/design';

const uri = (p: any) => getFirebaseDownloadUrl(p?.imageUrl || p?.firebasePath) || p?.imageUrl || p?.firebasePath;
const hm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export default function GalleryAlbumScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const { convertDistance, convertSpeed } = useSettings();
  const [journey, setJourney] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!journeyId) return;
    journeyAPI
      .getJourney(String(journeyId))
      .then((res: any) => setJourney(res?.journey))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [journeyId]);

  const photos: any[] = journey?.photos || [];
  const photo = photos[idx];
  const title = journey?.customTitle || journey?.title || 'Ride album';

  const meta = [
    { icon: 'route' as const, text: convertDistance(journey?.totalDistance || 0) },
    { icon: 'bolt' as const, text: `${convertSpeed(journey?.topSpeed || 0)} top` },
    { icon: 'user' as const, text: hm(photo?.takenAt) || '–' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <StatusBar barStyle={d.dark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { paddingTop: Math.max(56, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.round, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="back" size={20} color={d.ink} stroke={2} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: d.ink }]} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/journey-detail', params: { journeyId: String(journeyId) } })}
          accessibilityRole="button"
          style={[styles.route, shadow(d, 8), { backgroundColor: d.surface }]}
        >
          <Icon name="map" size={15} color={d.ink} stroke={2.2} />
          <Text style={[styles.routeText, { color: d.ink }]}>Route</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={AMBER} style={{ marginTop: 80 }} />
      ) : photos.length === 0 ? (
        <Text style={[styles.empty, { color: d.ink2 }]}>No photos in this ride yet.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs} contentContainerStyle={styles.thumbsContent}>
            {photos.map((p, i) => {
              const sel = i === idx;
              return (
                <TouchableOpacity key={p.id} onPress={() => setIdx(i)} accessibilityRole="button" accessibilityState={{ selected: sel }}>
                  <Image
                    source={{ uri: uri(p) }}
                    style={[
                      sel ? styles.thumbSel : styles.thumb,
                      sel && { borderWidth: 3, borderColor: AMBER },
                      { backgroundColor: d.surface2 },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.figure, shadow(d, 10), { backgroundColor: d.surface2 }]}>
            <Image source={{ uri: uri(photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {photo?.takenAt ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{hm(photo.takenAt)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.dots}>
            {photos.slice(0, 7).map((_, i) => (
              <View key={i} style={[i === idx ? styles.dotOn : styles.dot, { backgroundColor: i === idx ? d.ink : d.dark ? 'rgba(242,238,229,0.25)' : 'rgba(26,24,20,0.2)' }]} />
            ))}
          </View>

          <View style={styles.caption}>
            <Text style={[styles.cap, { color: d.ink }]}>{title}</Text>
            <Text style={[styles.capSub, { color: d.ink2 }]}>
              Photo {idx + 1} of {photos.length}
            </Text>
          </View>

          <View style={[styles.meta, shadow(d, 8), { backgroundColor: d.surface }]}>
            {meta.map((m) => (
              <View key={m.icon} style={styles.metaItem}>
                <Icon name={m.icon} size={15} color={d.ink2} stroke={2} />
                <Text style={[styles.metaText, { color: d.ink }]}>{m.text}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: F.black, fontSize: 17 },
  route: { height: 40, paddingHorizontal: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeText: { fontFamily: F.extra, fontSize: 13 },
  empty: { fontFamily: F.medium, fontSize: 14, textAlign: 'center', marginTop: 80 },
  thumbs: { marginTop: 16, height: 72, flexGrow: 0 },
  thumbsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  thumb: { width: 54, height: 54, borderRadius: 16 },
  thumbSel: { width: 68, height: 68, borderRadius: 20 },
  figure: { marginHorizontal: 16, marginTop: 16, height: 348, borderRadius: 28, overflow: 'hidden' },
  badge: { position: 'absolute', right: 14, bottom: 14, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(26,24,20,0.45)', justifyContent: 'center' },
  badgeText: { fontFamily: F.monoBold, fontSize: 12, color: '#FFFDF8' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotOn: { width: 18, height: 5, borderRadius: 3 },
  caption: { alignItems: 'center', marginTop: 16, paddingHorizontal: 24, gap: 2 },
  cap: { fontFamily: F.black, fontSize: 24, letterSpacing: -0.4, textAlign: 'center' },
  capSub: { fontFamily: F.regular, fontSize: 13 },
  meta: { marginHorizontal: 16, marginTop: 18, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center' },
  metaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  metaText: { fontFamily: F.extra, fontSize: 12 },
});
