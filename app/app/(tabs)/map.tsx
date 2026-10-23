// app/app/(tabs)/map.tsx
// The Map tab, laid out as the "Map" board: a calm map, a "Where to?" search, nearby-place chips,
// square place pins, and a card for the selected place with "Ride here". Rides themselves are
// recorded on the ride screen; this tab only finds places and hands a destination over.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ClipCard from '../../components/dw/ClipCard';
import Icon from '../../components/dw/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { AMBER, F, INK, shadow, useDW } from '../../constants/design';
import { mapLook } from '../../constants/mapStyle';
import { placesAPI } from '../../services/api';
import { fallbackRegion } from '../../v2/countryRegion';
import { haversineM } from '../../v2/navigation';
import { formatDistance } from '../../v2/format';

interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: string;
  rating?: number;
  subtitle?: string;
}

// Icon paths from the board (24 grid).
const ICONS: Record<string, string> = {
  fuel: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-3-3',
  hotel: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11',
  sight: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  shop: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0',
  pin: 'M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
};

const CHIPS = [
  { key: 'fuel', label: 'Fuel', type: 'gas_station', noun: 'Fuel' },
  { key: 'food', label: 'Food', type: 'restaurant', noun: 'Restaurant' },
  { key: 'hotel', label: 'Hotels', type: 'lodging', noun: 'Hotel' },
  { key: 'sight', label: 'Sights', type: 'tourist_attraction', noun: 'Attraction' },
  { key: 'shop', label: 'Shops', type: 'shopping_mall', noun: 'Shopping' },
] as const;

const coord = (p: any) => {
  const lat = p?.latitude ?? p?.location?.latitude ?? p?.geometry?.location?.lat;
  const lng = p?.longitude ?? p?.location?.longitude ?? p?.geometry?.location?.lng;
  return typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null;
};

const initialsOf = (name?: string | null) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'W';

export default function MapScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const mapRef = useRef<MapView | null>(null);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [chip, setChip] = useState<(typeof CHIPS)[number]['key'] | null>('fuel');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; description: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [markersLive, setMarkersLive] = useState(true);
  const latestSearch = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const region = useMemo(
    () => fallbackRegion({ profileCountryCode: user?.countryCode, deviceRegionCode: Localization.getLocales()[0]?.regionCode }),
    [user?.countryCode]
  );

  const flyTo = useCallback((latitude: number, longitude: number, zoom = 15) => {
    mapRef.current?.animateCamera({ center: { latitude, longitude }, zoom }, { duration: 500 });
  }, []);

  // Find the rider: last known position first, then a fresh fix.
  const locate = useCallback(async (prompt: boolean) => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && prompt) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const p = { latitude: last.coords.latitude, longitude: last.coords.longitude };
        setMe(p);
        flyTo(p.latitude, p.longitude);
      }
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { latitude: cur.coords.latitude, longitude: cur.coords.longitude };
      setMe(p);
      flyTo(p.latitude, p.longitude);
      return p;
    } catch {
      return null;
    }
  }, [flyTo]);

  useEffect(() => { locate(true); }, [locate]);

  // Nearby places for the active chip, around the rider.
  useEffect(() => {
    const def = CHIPS.find((c) => c.key === chip);
    if (!def || !me) { setPlaces([]); return; }
    let cancelled = false;
    setLoading(true);
    placesAPI
      .searchNearby({ latitude: me.latitude, longitude: me.longitude, type: def.type, radius: 5000 })
      .then((res: any) => {
        if (cancelled) return;
        const list: Place[] = (res?.places ?? [])
          .map((p: any, i: number) => {
            const c = coord(p);
            if (!c) return null;
            return { id: String(p.id || p.place_id || `${def.key}-${i}`), name: p.name || def.noun, ...c, kind: def.key, rating: typeof p.rating === 'number' ? p.rating : undefined, subtitle: p.vicinity || p.address } as Place;
          })
          .filter(Boolean)
          .slice(0, 20);
        setPlaces(list);
        setSelected((s) => (s && list.some((p) => p.id === s.id) ? s : list[0] ?? null));
      })
      .catch(() => { if (!cancelled) setPlaces([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chip, me?.latitude, me?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom markers draw once, then stop re-rendering (keeps Android fast).
  useEffect(() => {
    setMarkersLive(true);
    const t = setTimeout(() => setMarkersLive(false), 800);
    return () => clearTimeout(t);
  }, [places, selected?.id]);

  const onQuery = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text.trim()) { latestSearch.current++; setSuggestions([]); setSearching(false); return; }
    debounce.current = setTimeout(async () => {
      const id = ++latestSearch.current;
      setSearching(true);
      try {
        const res: any = await placesAPI.autocomplete({ input: text.trim(), ...(me ? { latitude: me.latitude, longitude: me.longitude, radius: 20000 } : {}) });
        if (id !== latestSearch.current) return;
        setSuggestions((res?.predictions ?? []).slice(0, 5).map((p: any) => ({ id: p.placeId, description: p.description })));
      } catch {
        if (id === latestSearch.current) setSuggestions([]);
      } finally {
        if (id === latestSearch.current) setSearching(false);
      }
    }, 140);
  };

  const pick = async (s: { id: string; description: string }) => {
    setQuery(s.description);
    setSuggestions([]);
    try {
      const res: any = await placesAPI.placeDetails(s.id);
      const c = coord(res?.place);
      if (!c) return;
      const place: Place = { id: s.id, name: s.description.split(',')[0], ...c, kind: 'pin', subtitle: res?.place?.address || s.description };
      setChip(null);
      setPlaces([place]);
      setSelected(place);
      flyTo(c.latitude, c.longitude, 14);
    } catch { /* leave the search as typed */ }
  };

  const rideHere = () => {
    if (!selected) return;
    router.push({ pathname: '/new-journey', params: { destName: selected.subtitle || selected.name, destLat: String(selected.latitude), destLng: String(selected.longitude) } } as never);
  };

  const sh = shadow(d, 8);
  const topInset = Math.max(56, insets.top + 8);
  const initials = initialsOf(user?.displayName);
  const distM = selected && me ? haversineM(me, selected) : null;
  const selDef = CHIPS.find((c) => c.key === selected?.kind);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        {...mapLook(d.dark)}
        userInterfaceStyle={d.dark ? 'dark' : 'light'}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={me ? { ...me, latitudeDelta: 0.05, longitudeDelta: 0.05 } : region}
        onPress={() => setSuggestions([])}
      >
        {places.map((p) => {
          const on = p.id === selected?.id;
          const size = on ? 44 : 36;
          return (
            <Marker key={p.id} coordinate={p} onPress={() => setSelected(p)} tracksViewChanges={markersLive} anchor={{ x: 0.5, y: 0.5 }} zIndex={on ? 2 : 1}>
              <View style={[styles.pin, { width: size, height: size, backgroundColor: on ? AMBER : d.surface, borderColor: on ? INK : d.surface }, sh]}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d={ICONS[p.kind] ?? ICONS.pin} stroke={on ? INK : d.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.top, { top: topInset }]}>
        <View style={[styles.search, { backgroundColor: d.surface }, sh]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2" stroke={d.ink2} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Where to?"
            placeholderTextColor={d.ink2}
            accessibilityLabel="Search destination"
            returnKeyType="search"
            style={[styles.input, { color: d.ink }]}
          />
          {searching ? <ActivityIndicator size="small" color={AMBER} /> : null}
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        </View>

        {suggestions.length > 0 && (
          <View style={[styles.suggestions, { backgroundColor: d.surface }, sh]}>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={s.id} onPress={() => pick(s)} accessibilityRole="button" style={[styles.suggestion, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}>
                <Icon name="nav" size={16} color={d.ink2} />
                <Text style={[styles.suggestionText, { color: d.ink }]} numberOfLines={2}>{s.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
          {CHIPS.map((c) => {
            const on = chip === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => { setSelected(null); setChip(on ? null : c.key); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { backgroundColor: on ? INK : d.surface }, sh]}
              >
                <Text style={[styles.chipText, { color: on ? AMBER : d.ink }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.rail, { bottom: (selected ? 262 : 146) + Math.max(0, insets.bottom - 20) }]}>
        <TouchableOpacity onPress={() => locate(true)} accessibilityRole="button" accessibilityLabel="Centre on me" style={[styles.railBtn, { backgroundColor: d.surface }, sh]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 2v3M12 19v3M2 12h3M19 12h3" stroke={d.ink} strokeWidth={1.9} strokeLinecap="round" />
            <Path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill={d.ink} />
          </Svg>
        </TouchableOpacity>
      </View>

      {loading && !selected && (
        <View style={[styles.loading, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]}>
          <ActivityIndicator size="small" color={AMBER} />
          <Text style={[styles.loadingText, { color: d.ink2 }]}>Finding places nearby</Text>
        </View>
      )}

      {selected && (
        <ClipCard color={d.surface} corner={20} radius={24} style={[styles.card, { bottom: 104 + Math.max(0, insets.bottom - 20) }, sh]}>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path d={ICONS[selected.kind] ?? ICONS.pin} stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: d.ink }]} numberOfLines={1}>{selected.name}</Text>
                <Text style={[styles.cardSub, { color: d.ink2 }]} numberOfLines={1}>
                  {[selDef?.noun ?? 'Destination', selected.rating ? `${selected.rating.toFixed(1)}★` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {distM != null && <Text style={[styles.cardDist, { color: d.ink }]}>{formatDistance(distM)}</Text>}
            </View>
            <TouchableOpacity onPress={rideHere} accessibilityRole="button" style={styles.rideBtn}>
              <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 3 20 20 12 15.5 4 20z" fill={INK} /></Svg>
              <Text style={styles.rideText}>Ride here</Text>
            </TouchableOpacity>
          </View>
        </ClipCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 16, right: 16, gap: 10 },
  search: { height: 52, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8 },
  input: { flex: 1, minWidth: 0, fontFamily: F.extra, fontSize: 16, padding: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: AMBER, fontFamily: F.black, fontSize: 11 },
  suggestions: { borderRadius: 18, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  suggestionText: { flex: 1, fontFamily: F.semi, fontSize: 14 },
  chips: { gap: 6, paddingRight: 16 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.extra, fontSize: 13 },
  pin: { borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: 16 },
  railBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loading: { position: 'absolute', alignSelf: 'center', height: 40, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontFamily: F.semi, fontSize: 13 },
  card: { position: 'absolute', left: 16, right: 16 },
  cardBody: { padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: F.black, fontSize: 17, letterSpacing: -0.2 },
  cardSub: { fontFamily: F.regular, fontSize: 13 },
  cardDist: { fontFamily: F.monoBold, fontSize: 14 },
  rideBtn: { height: 48, borderRadius: 14, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rideText: { color: INK, fontFamily: F.black, fontSize: 14 },
});
