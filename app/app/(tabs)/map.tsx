// app/app/(tabs)/map.tsx
// The Map tab, laid out as the "Map" board: a calm map, a "Where to?" search, nearby-place chips,
// square place pins, and a card for the selected place with "Ride here". A Places | Memories switch
// swaps the nearby places for the rider's own geotagged photos, pinned where they were taken.
// Rides themselves are recorded on the ride screen; this tab only finds places and hands a
// destination over.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ClipCard from '../../components/dw/ClipCard';
import Icon from '../../components/dw/Icon';
import MemoryPin from '../../components/MemoryPin';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { AMBER, F, INK, shadow, useDW } from '../../constants/design';
import { newSearchSession, placesAPI } from '../../services/api';
import { getFirebaseDownloadUrl } from '../../utils/storage';
import { fallbackRegion } from '../../v2/countryRegion';
import { regionAt } from '../../v2/mapCamera';
import { mapStyle, nativeMapType, usesCustomStyle } from '../../v2/mapStyle';
import { haversineM } from '../../v2/navigation';
import { formatDistance } from '../../v2/format';
import { clockDuration, clusterPhotos, defaultYear } from '../../v2/memories';
import { getRuntime } from '../../v2/runtime';

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

// Photo urls come back either whole or as a storage path; the album screen resolves them the same way.
const photoUri = (u?: string | null) => (u ? getFirebaseDownloadUrl(u) || u : undefined);

const initialsOf = (name?: string | null) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'W';

export default function MapScreen() {
  const d = useDW();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mapType } = useSettings();
  const nativeType = nativeMapType(mapType, Platform.OS);
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
  // What went wrong last, shown instead of an empty map: 'none' = searched and found nothing,
  // 'down' = search unavailable, so the rider can long-press the map to drop a pin instead.
  const [notice, setNotice] = useState<'none' | 'down' | null>(null);
  const latestSearch = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(newSearchSession());
  // Last good results per chip, so switching back shows them at once and a failed refresh keeps them.
  const lastNearby = useRef<Record<string, Place[]>>({});

  // Memories layer: the rider's geotagged photos.
  const [layer, setLayer] = useState<'places' | 'memories'>('places');
  const memoriesOn = layer === 'memories';
  const [year, setYear] = useState<number | null>(null);
  const [regionDelta, setRegionDelta] = useState(0.05);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const fitted = useRef('');
  const photoQuery = useQuery({
    queryKey: ['map-photos'],
    queryFn: () => getRuntime().client.photoMap(),
    enabled: memoriesOn,
    staleTime: 60_000,
  });
  const years = useMemo(() => photoQuery.data?.years ?? [], [photoQuery.data]);
  useEffect(() => { if (year == null && years.length) setYear(defaultYear(years) ?? null); }, [year, years]);
  const shownPhotos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (photoQuery.data?.items ?? []).filter(
      (p) => (year == null || new Date(p.takenAt).getUTCFullYear() === year) && (!q || (p.ride.title ?? '').toLowerCase().includes(q))
    );
  }, [photoQuery.data, year, query]);
  const clusters = useMemo(() => clusterPhotos(shownPhotos, regionDelta), [shownPhotos, regionDelta]);
  const cluster = clusters.find((c) => c.photos.some((p) => p.id === photoId)) ?? clusters[0] ?? null;
  const photoIdx = cluster ? Math.max(0, cluster.photos.findIndex((p) => p.id === photoId)) : 0;
  const photo = cluster?.photos[photoIdx] ?? null;

  const region = useMemo(
    () => fallbackRegion({ profileCountryCode: user?.countryCode, deviceRegionCode: Localization.getLocales()[0]?.regionCode }),
    [user?.countryCode]
  );

  const flyTo = useCallback((latitude: number, longitude: number, zoom = 15) => {
    // A region, not camera `zoom`: Apple Maps (iOS) ignores zoom, so the map moved but stayed zoomed out.
    mapRef.current?.animateToRegion(regionAt(latitude, longitude, zoom), 500);
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
    const kept = lastNearby.current[def.key];
    if (kept?.length) setPlaces(kept);
    setNotice(null);
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
        if (list.length) lastNearby.current[def.key] = list;
        setPlaces(list);
        setNotice(list.length ? null : 'none');
        setSelected((s) => (s && list.some((p) => p.id === s.id) ? s : list[0] ?? null));
      })
      .catch(() => {
        // Keep whatever was already on the map; only say so when there is nothing to show.
        if (!cancelled && !kept?.length) { setPlaces([]); setNotice('down'); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chip, me?.latitude, me?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom markers draw once, then stop re-rendering (keeps Android fast).
  useEffect(() => {
    setMarkersLive(true);
    const t = setTimeout(() => setMarkersLive(false), 800);
    return () => clearTimeout(t);
  }, [places, selected?.id]);

  // Show every pinned photo of the chosen year when the layer opens or the year changes: the pins sit
  // wherever the rides were, which is usually nowhere near the rider's current position.
  useEffect(() => {
    if (!memoriesOn || !shownPhotos.length) return;
    const key = `${year}:${photoQuery.dataUpdatedAt}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        shownPhotos.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        { edgePadding: { top: 230, right: 70, bottom: 360, left: 70 }, animated: true }
      );
    }, 250);
    return () => clearTimeout(t);
  }, [memoriesOn, shownPhotos, year, photoQuery.dataUpdatedAt]);

  const switchLayer = (next: 'places' | 'memories') => {
    if (next === layer) return;
    setQuery('');
    setSuggestions([]);
    setSearching(false);
    latestSearch.current++;
    setLayer(next);
  };

  const cycleYear = () => {
    if (years.length < 2 || year == null) return;
    setYear(years[(years.indexOf(year) + 1) % years.length]);
    setPhotoId(null);
  };

  const nextPhoto = () => {
    if (!cluster || cluster.photos.length < 2) return;
    setPhotoId(cluster.photos[(photoIdx + 1) % cluster.photos.length].id);
  };

  const onRegion = (r: Region) => setRegionDelta((prev) => (Math.abs(Math.log(r.latitudeDelta / prev)) > 0.2 ? r.latitudeDelta : prev));

  // v2 photos open their ride's album, v1 photos their journey's. A v1 photo whose journey was
  // deleted has no album, so the button is not shown.
  const albumParams = photo?.rideId ? { rideId: photo.rideId } : photo?.journeyId ? { journeyId: photo.journeyId } : null;
  const openAlbum = () => {
    if (albumParams) router.push({ pathname: '/gallery-album', params: albumParams } as never);
  };

  const rideItAgain = () => {
    if (!photo || !cluster) return;
    router.push({ pathname: '/new-journey', params: { destName: photo.ride.title || 'Photo spot', destLat: String(cluster.latitude), destLng: String(cluster.longitude) } } as never);
  };

  const onQuery = (text: string) => {
    setQuery(text);
    if (memoriesOn) return; // memories are filtered on the phone as you type
    if (debounce.current) clearTimeout(debounce.current);
    // Two letters match half the map; wait for a third before spending a lookup.
    if (text.trim().length < 3) { latestSearch.current++; setSuggestions([]); setSearching(false); return; }
    debounce.current = setTimeout(async () => {
      const id = ++latestSearch.current;
      setSearching(true);
      try {
        const res: any = await placesAPI.autocomplete({
          input: text.trim(),
          sessionToken: session.current,
          ...(me ? { latitude: me.latitude, longitude: me.longitude, radius: 20000 } : {}),
        });
        if (id !== latestSearch.current) return;
        const list = (res?.predictions ?? []).slice(0, 5).map((p: any) => ({ id: p.placeId, description: p.description }));
        setSuggestions(list);
        setNotice(list.length ? null : 'none');
      } catch {
        if (id === latestSearch.current) { setSuggestions([]); setNotice('down'); }
      } finally {
        if (id === latestSearch.current) setSearching(false);
      }
    }, 300);
  };

  const showPlace = (place: Place) => {
    setChip(null);
    setPlaces([place]);
    setSelected(place);
    setNotice(null);
    flyTo(place.latitude, place.longitude, 14);
  };

  const pick = async (s: { id: string; description: string }) => {
    setQuery(s.description);
    setSuggestions([]);
    const token = session.current;
    session.current = newSearchSession(); // the next search is a new billing session
    try {
      const res: any = await placesAPI.placeDetails(s.id, token);
      const c = coord(res?.place);
      if (!c) throw new Error('no position');
      showPlace({ id: s.id, name: s.description.split(',')[0], ...c, kind: 'pin', subtitle: res?.place?.address || s.description });
    } catch {
      // Details failed: try the words themselves before giving up.
      try {
        const g: any = await placesAPI.geocode(s.description);
        const c = coord(g?.result);
        if (!c) throw new Error('no position');
        showPlace({ id: s.id, name: s.description.split(',')[0], ...c, kind: 'pin', subtitle: g?.result?.formattedAddress || s.description });
      } catch {
        setNotice('down');
      }
    }
  };

  // Long-press anywhere to ride there: the fallback when search can't find (or reach) a place.
  const dropPin = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const c = e.nativeEvent.coordinate;
    setSuggestions([]);
    showPlace({ id: `pin-${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`, name: 'Dropped pin', ...c, kind: 'pin', subtitle: `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` });
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
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={nativeType}
        customMapStyle={usesCustomStyle(nativeType, Platform.OS) ? mapStyle(d.dark) : undefined}
        userInterfaceStyle={d.dark ? 'dark' : 'light'}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={me ? { ...me, latitudeDelta: 0.05, longitudeDelta: 0.05 } : region}
        onPress={() => setSuggestions([])}
        onLongPress={memoriesOn ? undefined : dropPin}
        onRegionChangeComplete={memoriesOn ? onRegion : undefined}
      >
        {memoriesOn && clusters.map((c) => (
          <MemoryPin
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            uri={photoUri(c.photos[0].thumbnailUrl || c.photos[0].imageUrl)}
            count={c.photos.length}
            selected={c.id === cluster?.id}
            label={`${c.photos[0].ride.title || 'Ride photos'}, ${c.photos.length} ${c.photos.length === 1 ? 'photo' : 'photos'}`}
            surface={d.surface}
            onPress={() => setPhotoId(c.photos[0].id)}
          />
        ))}
        {!memoriesOn && places.map((p) => {
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
            placeholder={memoriesOn ? "Find a place you've been" : 'Where to?'}
            placeholderTextColor={d.ink2}
            accessibilityLabel={memoriesOn ? 'Search your memories' : 'Search destination'}
            returnKeyType="search"
            style={[styles.input, { color: d.ink }]}
          />
          {searching ? <ActivityIndicator size="small" color={AMBER} /> : null}
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        </View>

        <View style={styles.layerRow}>
          <View accessibilityRole="tablist" style={[styles.layer, { backgroundColor: d.surface }, sh]}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: !memoriesOn }}
              onPress={() => switchLayer('places')}
              style={[styles.layerTab, !memoriesOn && { backgroundColor: INK }]}
            >
              <Text style={[styles.layerText, { color: !memoriesOn ? AMBER : d.ink2, fontFamily: !memoriesOn ? F.black : F.extra }]}>Places</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: memoriesOn }}
              onPress={() => switchLayer('memories')}
              style={[styles.layerTab, memoriesOn && { backgroundColor: INK }]}
            >
              {memoriesOn && (
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke={AMBER} strokeWidth={2.2} strokeLinejoin="round" />
                  <Path d="M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke={AMBER} strokeWidth={2.2} />
                </Svg>
              )}
              <Text style={[styles.layerText, { color: memoriesOn ? AMBER : d.ink2, fontFamily: memoriesOn ? F.black : F.extra }]}>Memories</Text>
            </TouchableOpacity>
          </View>
          {memoriesOn && year != null && (
            <TouchableOpacity
              onPress={cycleYear}
              disabled={years.length < 2}
              accessibilityRole="button"
              accessibilityLabel={`Year ${year}${years.length > 1 ? ', tap for the next year' : ''}`}
              style={[styles.yearBtn, { backgroundColor: d.surface }, sh]}
            >
              <Text style={[styles.layerText, { color: d.ink, fontFamily: F.extra }]}>{year}</Text>
              {years.length > 1 && (
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"><Path d="m6 9 6 6 6-6" stroke={d.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              )}
            </TouchableOpacity>
          )}
        </View>

        {!memoriesOn && suggestions.length > 0 && (
          <View style={[styles.suggestions, { backgroundColor: d.surface }, sh]}>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={s.id} onPress={() => pick(s)} accessibilityRole="button" style={[styles.suggestion, i > 0 && { borderTopWidth: 1, borderTopColor: d.line }]}>
                <Icon name="nav" size={16} color={d.ink2} />
                <Text style={[styles.suggestionText, { color: d.ink }]} numberOfLines={2}>{s.description}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.attribution, { color: d.ink2, borderTopWidth: 1, borderTopColor: d.line }]}>© OpenStreetMap contributors · Geoapify · Google</Text>
          </View>
        )}

        {!memoriesOn && (
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
        )}
      </View>

      <View style={[styles.rail, { bottom: (memoriesOn ? (photo ? 302 : 146) : selected ? 262 : 146) + Math.max(0, insets.bottom - 20) }]}>
        <TouchableOpacity onPress={() => locate(true)} accessibilityRole="button" accessibilityLabel="Centre on me" style={[styles.railBtn, { backgroundColor: d.surface }, sh]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 2v3M12 19v3M2 12h3M19 12h3" stroke={d.ink} strokeWidth={1.9} strokeLinecap="round" />
            <Path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill={d.ink} />
          </Svg>
        </TouchableOpacity>
      </View>

      {memoriesOn && photoQuery.isPending && (
        <View style={[styles.loading, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]}>
          <ActivityIndicator size="small" color={AMBER} />
          <Text style={[styles.loadingText, { color: d.ink2 }]}>Finding your photos</Text>
        </View>
      )}

      {memoriesOn && photoQuery.isError && (
        <TouchableOpacity
          onPress={() => photoQuery.refetch()}
          accessibilityRole="button"
          style={[styles.notice, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]}
        >
          <Text style={[styles.loadingText, { color: d.ink2 }]}>Couldn't load your photos. Tap to try again</Text>
        </TouchableOpacity>
      )}

      {memoriesOn && photoQuery.isSuccess && !cluster && (
        <View style={[styles.notice, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]} accessibilityRole="text">
          <Text style={[styles.loadingText, { color: d.ink2 }]}>
            {query.trim() ? 'No photos match that search' : 'No pinned photos yet. Photos you take during a ride appear here'}
          </Text>
        </View>
      )}

      {memoriesOn && cluster && photo && (
        <ClipCard color={d.surface} corner={20} radius={24} style={[styles.card, { bottom: 104 + Math.max(0, insets.bottom - 20) }, sh]}>
          <View style={[styles.cardBody, { padding: 14 }]}>
            <View style={styles.memTop}>
              <TouchableOpacity
                onPress={nextPhoto}
                disabled={cluster.photos.length < 2}
                accessibilityRole="button"
                accessibilityLabel={cluster.photos.length > 1 ? `Photo ${photoIdx + 1} of ${cluster.photos.length}, tap for the next` : 'Ride photo'}
                style={styles.memThumbWrap}
              >
                <Image source={{ uri: photoUri(photo.thumbnailUrl || photo.imageUrl) }} style={styles.memThumb} resizeMode="cover" />
                <View style={styles.memCount}>
                  <Text style={styles.memCountText}>{photoIdx + 1}/{cluster.photos.length}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.memInfo}>
                <Text style={[styles.memTitle, { color: d.ink }]} numberOfLines={2}>{photo.ride.title || 'Ride photo'}</Text>
                <Text style={[styles.cardSub, { color: d.ink2 }]} numberOfLines={1}>
                  {`Taken here · ${new Date(photo.takenAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(photo.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                </Text>
                {photo.ride.distanceM > 0 && (
                  <Text style={[styles.memStats, { color: d.ink2 }]} numberOfLines={1}>
                    {`${formatDistance(photo.ride.distanceM)} · ${clockDuration(photo.ride.elapsedTimeS)}`}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.memActions}>
              {albumParams && (
                <TouchableOpacity onPress={openAlbum} accessibilityRole="button" style={[styles.albumBtn, { borderColor: d.line }]}>
                  <Text style={[styles.albumText, { color: d.ink }]}>Open album</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={rideItAgain} accessibilityRole="button" style={[styles.rideBtn, { flex: 1.3 }]}>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 3 20 20 12 15.5 4 20z" fill={INK} /></Svg>
                <Text style={styles.rideText}>Ride it again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ClipCard>
      )}

      {!memoriesOn && notice && !loading && !selected && suggestions.length === 0 && (
        <View style={[styles.notice, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]} accessibilityRole="text" accessibilityLiveRegion="polite">
          <Text style={[styles.loadingText, { color: d.ink2 }]}>
            {notice === 'none' ? 'Nothing found here. Long-press the map to drop a pin' : 'Search is having trouble. Long-press the map to drop a pin'}
          </Text>
        </View>
      )}

      {!memoriesOn && loading && !selected && (
        <View style={[styles.loading, { bottom: 122 + Math.max(0, insets.bottom - 20), backgroundColor: d.surface }, sh]}>
          <ActivityIndicator size="small" color={AMBER} />
          <Text style={[styles.loadingText, { color: d.ink2 }]}>Finding places nearby</Text>
        </View>
      )}

      {!memoriesOn && selected && (
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
  layerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  layer: { width: 216, height: 40, borderRadius: 20, padding: 4, flexDirection: 'row' },
  layerTab: { flex: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  layerText: { fontSize: 13 },
  yearBtn: { height: 40, paddingHorizontal: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  memTop: { flexDirection: 'row', gap: 14 },
  memThumbWrap: { width: 96, height: 96 },
  memThumb: { width: 96, height: 96, borderRadius: 18, backgroundColor: AMBER },
  memCount: { position: 'absolute', left: 6, bottom: 6, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(26,24,20,0.55)', justifyContent: 'center' },
  memCountText: { color: '#FFFDF8', fontFamily: F.monoBold, fontSize: 11 },
  memInfo: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 },
  memTitle: { fontFamily: F.black, fontSize: 18, lineHeight: 22, letterSpacing: -0.2 },
  memStats: { fontFamily: F.monoBold, fontSize: 12 },
  memActions: { flexDirection: 'row', gap: 8 },
  albumBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  albumText: { fontFamily: F.extra, fontSize: 14 },
  chips: { gap: 6, paddingRight: 16 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.extra, fontSize: 13 },
  pin: { borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: 16 },
  railBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loading: { position: 'absolute', alignSelf: 'center', height: 40, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontFamily: F.semi, fontSize: 13 },
  notice: { position: 'absolute', left: 16, right: 16, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center' },
  attribution: { fontFamily: F.regular, fontSize: 10, paddingHorizontal: 16, paddingVertical: 6, textAlign: 'right' },
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
