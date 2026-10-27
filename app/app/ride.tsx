// app/app/ride.tsx
// Record a ride on the v2 engine, laid out as the "Live ride" board: full-bleed map with the route,
// a REC pill, an amber next-turn card, and a dark ride dash with the speed gauge, destination
// progress, stats and a hold-to-finish button. Works with no connection: every fix is saved on the
// phone and uploaded later. Stats come from the same ride-core code the server uses.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Localization from 'expo-localization';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Icon from '../components/dw/Icon';
import RiderMarker from '../components/RiderMarker';
import { useAuth } from '../contexts/AuthContext';
import { AMBER, F, INK, shadow, useDW } from '../constants/design';
import { useLiveRide, useSyncState } from '../v2/hooks';
import { endRide, pauseRide, resumeRide, startRide, takeRidePhoto } from '../v2/rideController';
import { formatDistance, formatDuration } from '../v2/format';
import { fallbackRegion } from '../v2/countryRegion';
import { bearingDeg, regionAt } from '../v2/mapCamera';
import { advanceStep, fetchNavRoute, haversineM, locateOnRoute, remainingRouteM, turnKind, type NavRoute, type TurnKind } from '../v2/navigation';

const hms = (s: number) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

const HOLD_MS = 1200;
const MIN_RIDE_M = 100; // the server rejects shorter rides, so there is nothing to summarise
const MAX_TRAIL = 6000;
const ZOOM = 16;
const OFF_ROUTE_M = 70;
const REC_RED = '#E5484D';
const GAUGE_MAX_KMH = 180;
const DASH_BG = '#161513';
const DASH_INK = '#F2EEE5';
const DASH_MUTED = '#A29B8D';

/** Arrow for a turn, drawn on a 24 grid. */
function TurnIcon({ kind, color, size = 30 }: { kind: TurnKind; color: string; size?: number }) {
  const rot = kind === 'left' ? -90 : kind === 'right' ? 90 : kind === 'slight-left' ? -45 : kind === 'slight-right' ? 45 : kind === 'uturn' ? 180 : 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: `${rot}deg` }] }}>
      <Path d="M12 20V6M6 11l6-6 6 6" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const arcPoint = (frac: number, r = 128) => {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return { x: 150 + r * Math.cos(a), y: 150 - r * Math.sin(a) };
};

/** Speed gauge: a half-circle track, an amber arc up to the current speed and a tick at the top speed. */
function Gauge({ kmh, topKmh }: { kmh: number; topKmh: number }) {
  const f = kmh / GAUGE_MAX_KMH;
  const end = arcPoint(f);
  const t0 = arcPoint(topKmh / GAUGE_MAX_KMH, 116);
  const t1 = arcPoint(topKmh / GAUGE_MAX_KMH, 138);
  return (
    <Svg width={300} height={160} viewBox="0 0 300 160">
      <Path d="M22 150 A128 128 0 0 1 278 150" fill="none" stroke="rgba(242,238,229,0.1)" strokeWidth={12} strokeLinecap="round" />
      {/* Ticks are placed one by one: a dashed arc loses the one that lands exactly on its far end,
          which left the 180 end of the dial bare. A big tick every 20 km/h, a small one every 5. */}
      {Array.from({ length: 37 }, (_, i) => {
        const major = i % 4 === 0;
        const a = arcPoint(i / 36, major ? 110.5 : 112);
        const b = arcPoint(i / 36, major ? 117.5 : 116);
        return (
          <Line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={major ? 'rgba(242,238,229,0.28)' : 'rgba(242,238,229,0.12)'}
            strokeWidth={major ? 1.5 : 1}
          />
        );
      })}
      {f > 0.01 && <Path d={`M22 150 A128 128 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`} fill="none" stroke={AMBER} strokeWidth={12} strokeLinecap="round" />}
      {topKmh > 5 && <Path d={`M${t0.x.toFixed(1)} ${t0.y.toFixed(1)} L${t1.x.toFixed(1)} ${t1.y.toFixed(1)}`} stroke={DASH_INK} strokeWidth={3} strokeLinecap="round" />}
      {f > 0.01 && <Circle cx={end.x} cy={end.y} r={8} fill={AMBER} stroke={DASH_BG} strokeWidth={3} />}
    </Svg>
  );
}

export default function RideScreen() {
  const d = useDW();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groupRideId, vehicleId, vehicleType, title, destName, destLat, destLng } = useLocalSearchParams<{
    groupRideId?: string; vehicleId?: string; vehicleType?: string; title?: string; destName?: string; destLat?: string; destLng?: string;
  }>();
  const dest = useMemo(
    () =>
      destLat && destLng && Number.isFinite(Number(destLat)) && Number.isFinite(Number(destLng))
        ? { latitude: Number(destLat), longitude: Number(destLng), name: String(destName || '').split(',')[0].trim() }
        : null,
    [destLat, destLng, destName]
  );
  const live = useLiveRide();
  const sync = useSyncState();
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const mapRef = useRef<MapView | null>(null);
  const hold = useRef(new Animated.Value(0)).current;
  const finishing = useRef(false);
  const frozenAt = useRef<number | null>(null);

  // Start once on open, unless a ride (for example one recovered after a crash) is already running.
  useEffect(() => {
    if (started) return;
    setStarted(true);
    if (live && live.status !== 'ENDED') return;
    startRide({ groupRideId, vehicleId, vehicleType, title: title || undefined }).then((res) => {
      if (res.ok) return;
      if (res.reason === 'permission') {
        Alert.alert('Location needed', 'Wayfarian needs location access to record your ride. Turn it on in Settings.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    });
  }, [started, live, groupRideId, vehicleId, vehicleType, title, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Zoom in on the rider as soon as the phone knows where they are: the last known position first,
  // so the map never sits on a country-wide view while waiting for the first GPS fix.
  const zoomed = useRef(false);
  const flyTo = useCallback((lat: number, lng: number) => {
    zoomed.current = true;
    // A region, not camera `zoom`: Apple Maps (iOS) ignores zoom and stayed zoomed out over the country.
    mapRef.current?.animateToRegion(regionAt(lat, lng, ZOOM), 500);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const last = await Location.getLastKnownPositionAsync();
        if (!cancelled && last && !zoomed.current) flyTo(last.coords.latitude, last.coords.longitude);
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled && !zoomed.current) flyTo(cur.coords.latitude, cur.coords.longitude);
      } catch { /* the first recorded fix will zoom the map instead */ }
    })();
    return () => { cancelled = true; };
  }, [flyTo]);

  // Draw the route as fixes arrive and keep the camera on the rider.
  const fix = live?.lastFix;
  // Which way the rider is heading, from their last two positions at least 5 m apart (a stopped
  // rider's GPS jitter would otherwise spin the arrow).
  const [heading, setHeading] = useState(0);
  const lastPos = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    if (!fix) return;
    const cur = { latitude: fix.lat, longitude: fix.lng };
    if (!lastPos.current) lastPos.current = cur;
    else if (haversineM(lastPos.current, cur) >= 5) {
      setHeading(bearingDeg(lastPos.current, cur));
      lastPos.current = cur;
    }
  }, [fix]);
  useEffect(() => {
    if (!fix) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.latitude === fix.lat && last.longitude === fix.lng) return prev;
      const next = prev.length >= MAX_TRAIL ? prev.slice(prev.length - MAX_TRAIL + 1) : prev;
      return [...next, { latitude: fix.lat, longitude: fix.lng }];
    });
    if (!zoomed.current) flyTo(fix.lat, fix.lng);
    else mapRef.current?.animateCamera({ center: { latitude: fix.lat, longitude: fix.lng } }, { duration: 600 });
  }, [fix?.lat, fix?.lng, fix, flyTo]);

  // Turn-by-turn: fetch the route to the destination, follow the current step, and fetch a fresh
  // route if the rider stays off it. A failed fetch keeps the old route on screen and waits longer
  // before the next try (10 s, 20 s, 40 s, then every 60 s), so a dead network never spams requests.
  const [navRoute, setNavRoute] = useState<NavRoute | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [routeLeftM, setRouteLeftM] = useState<number | null>(null);
  const fetching = useRef(false);
  const offSince = useRef<number | null>(null);
  const retryAt = useRef(0);
  const failures = useRef(0);
  const routeTotalM = useRef(0);
  useEffect(() => {
    if (!dest || !fix || live?.status !== 'RECORDING') return;
    const pos = { latitude: fix.lat, longitude: fix.lng };
    if (navRoute) {
      setStepIdx((i) => advanceStep(pos, navRoute.steps, i));
      const at = locateOnRoute(pos, navRoute.coordinates);
      if (at.offRouteM <= OFF_ROUTE_M) {
        offSince.current = null;
        setRouteLeftM(remainingRouteM(at, navRoute.coordinates));
        return;
      }
      offSince.current = offSince.current ?? Date.now();
      if (Date.now() - offSince.current < 8000) return;
    }
    if (fetching.current || Date.now() < retryAt.current) return;
    fetching.current = true;
    fetchNavRoute(pos, dest, vehicleType)
      .then((r) => {
        if (!r) {
          failures.current++;
          retryAt.current = Date.now() + Math.min(60000, 10000 * 2 ** (failures.current - 1));
          return;
        }
        failures.current = 0;
        retryAt.current = 0;
        offSince.current = null;
        setNavRoute(r);
        setStepIdx(0);
        setRouteLeftM(r.distanceM);
        routeTotalM.current = r.distanceM;
      })
      .finally(() => { fetching.current = false; });
  }, [fix, dest, live?.status, navRoute, vehicleType]);

  const paused = live?.status === 'PAUSED';
  if (paused && frozenAt.current == null) frozenAt.current = now;
  if (!paused) frozenAt.current = null;
  const elapsed = live ? Math.max(0, Math.round(((frozenAt.current ?? now) - live.startedAt) / 1000)) : 0;

  const region = useMemo(
    () => fallbackRegion({ profileCountryCode: user?.countryCode, deviceRegionCode: Localization.getLocales()[0]?.regionCode }),
    [user?.countryCode]
  );

  const onPause = useCallback(async () => {
    setBusy(true);
    try { live?.status === 'PAUSED' ? await resumeRide(vehicleType) : await pauseRide(); } finally { setBusy(false); }
  }, [live?.status, vehicleType]);

  const onPhoto = useCallback(async () => {
    const res = await takeRidePhoto();
    if (!res.ok && res.reason === 'permission') {
      Alert.alert('Camera needed', 'Allow camera access in Settings to add photos to your ride.');
    }
  }, []);

  const distanceRef = useRef(0);
  distanceRef.current = live?.distanceM ?? 0;

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    const tooShort = distanceRef.current < MIN_RIDE_M;
    let rideId: string | null = null;
    try { rideId = await endRide(); } finally { setBusy(false); }
    if (tooShort) {
      Alert.alert('Ride too short', 'Rides under 100 m are not saved. Start again when you are ready to go.');
      router.replace('/(tabs)' as never);
      return;
    }
    router.replace(rideId ? ({ pathname: '/ride-summary', params: { rideId } } as never) : ('/(tabs)/log' as never));
  }, [router]);

  const holdStart = () => {
    if (busy) return;
    hold.setValue(0);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) finish();
    });
  };
  const holdCancel = () => {
    hold.stopAnimation();
    Animated.timing(hold, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };

  const recenter = async () => {
    if (fix) return flyTo(fix.lat, fix.lng);
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) flyTo(last.coords.latitude, last.coords.longitude);
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      flyTo(cur.coords.latitude, cur.coords.longitude);
    } catch {
      Alert.alert('Location unavailable', 'Turn on location for Wayfarian in Settings to centre the map on you.');
    }
  };

  if (!live) {
    return <View style={[styles.center, { backgroundColor: d.bg }]}><ActivityIndicator color={AMBER} /></View>;
  }

  const here = fix ? { latitude: fix.lat, longitude: fix.lng } : null;
  // Road distance left along the route; straight-line only while there is no route yet.
  const toDestM = routeLeftM ?? (dest && here ? haversineM(here, dest) : null);
  const step = navRoute?.steps[stepIdx] ?? null;
  const then = navRoute?.steps[stepIdx + 1] ?? null;
  const toTurnM = step && here ? haversineM(here, step.end) : null;
  // The route's own pace (it knows road speeds) until the rider has a moving average of their own.
  const routePaceMps = navRoute && navRoute.durationS > 0 ? navRoute.distanceM / navRoute.durationS : 0;
  const paceMps = live.movingTimeS > 120 && live.avgSpeedMps > 1.5 ? live.avgSpeedMps : routePaceMps;
  const eta = toDestM != null && paceMps > 0
    ? new Date(now + (toDestM / paceMps) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;
  const progress = toDestM != null && routeTotalM.current > 0 ? Math.min(1, Math.max(0, 1 - toDestM / routeTotalM.current)) : 0;
  const kmh = Math.round(Math.max(0, fix?.speedMps ?? 0) * 3.6);
  const topKmh = Math.round(live.topSpeedMps * 3.6);
  const avgKmh = Math.round(live.avgSpeedMps * 3.6);
  const [distValue, distUnit] = formatDistance(live.distanceM).split(' ');
  const [turnValue, turnUnit] = formatDistance(toTurnM ?? 0).split(' ');
  const sh = shadow(d, 8);
  const topInset = Math.max(56, insets.top + 8);
  const fill = hold.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const dashBg = d.dark ? '#1C1A17' : DASH_BG;
  const dashHeight = (dest ? 404 : 340) + Math.max(0, insets.bottom);

  return (
    <View style={[styles.root, { backgroundColor: d.bg }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsUserLocation={!fix}
        showsMyLocationButton={false}
        showsCompass={false}
        initialRegion={fix ? { latitude: fix.lat, longitude: fix.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 } : region}
        mapPadding={{ top: 0, left: 0, right: 0, bottom: dashHeight - 40 }}
      >
        {navRoute && <Polyline coordinates={navRoute.coordinates} strokeColor={AMBER} strokeWidth={5} lineDashPattern={[2, 8]} lineCap="round" />}
        {trail.length > 1 && <Polyline coordinates={trail} strokeColor={AMBER} strokeWidth={6} lineCap="round" lineJoin="round" />}
        {dest && <Marker coordinate={{ latitude: dest.latitude, longitude: dest.longitude }} title={dest.name || 'Destination'} pinColor={AMBER} />}
        {fix && <RiderMarker coordinate={{ latitude: fix.lat, longitude: fix.lng }} heading={heading} />}
      </MapView>

      <View style={[styles.topBar, { top: topInset }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)' as never)}
          accessibilityRole="button"
          accessibilityLabel="Minimise ride"
          style={[styles.round, { backgroundColor: d.surface }, sh]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="m6 9 6 6 6-6" stroke={d.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <View style={[styles.rec, { backgroundColor: d.surface }, sh]} accessibilityRole="text">
          <View style={[styles.recHalo, paused && { backgroundColor: 'transparent' }]}>
            <View style={[styles.recDot, { backgroundColor: paused ? d.ink2 : REC_RED }]} />
          </View>
          <Text style={[styles.recLabel, { color: d.ink }]}>{paused ? 'PAUSED' : 'REC'}</Text>
          <Text style={[styles.recTime, { color: d.ink }]}>{hms(elapsed)}</Text>
        </View>
        {groupRideId ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/group-live', params: { id: String(groupRideId) } } as never)}
            accessibilityRole="button"
            accessibilityLabel="Group live view"
            style={[styles.round, { backgroundColor: d.surface }, sh]}
          >
            <Icon name="route" size={20} color={d.ink} stroke={1.9} />
          </TouchableOpacity>
        ) : (
          <View style={styles.round} />
        )}
      </View>

      {step && (
        <View style={[styles.turn, { top: topInset + 56 }, sh]} accessibilityRole="text" accessibilityLabel={`${step.instruction} in ${toTurnM != null ? formatDistance(toTurnM) : ''}`}>
          <View style={styles.turnIcon}><TurnIcon kind={turnKind(step.maneuver)} color={AMBER} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.turnDist}>{turnValue}<Text style={styles.turnUnit}> {turnUnit}</Text></Text>
            <Text style={styles.turnText} numberOfLines={1}>{step.instruction}</Text>
          </View>
          {then && (
            <View style={styles.then}>
              <Text style={styles.thenLabel}>THEN</Text>
              <TurnIcon kind={turnKind(then.maneuver)} color={INK} size={20} />
            </View>
          )}
        </View>
      )}

      {sync.pending > 0 && (
        <View style={[styles.syncChip, { top: topInset + (step ? 144 : 56), backgroundColor: d.surface }, sh]}>
          <Text style={[styles.syncText, { color: d.ink2 }]}>{sync.pending} waiting to upload</Text>
        </View>
      )}

      <View style={[styles.rail, { top: topInset + (step ? 156 : 64) }]}>
        <TouchableOpacity onPress={recenter} accessibilityRole="button" accessibilityLabel="Recenter" style={[styles.railBtn, { backgroundColor: d.surface }, sh]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 2v3M12 19v3M2 12h3M19 12h3" stroke={d.ink} strokeWidth={1.9} strokeLinecap="round" />
            <Path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill={d.ink} />
          </Svg>
        </TouchableOpacity>
      </View>

      <View style={[styles.dash, { backgroundColor: dashBg, height: dashHeight, paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.handle} />

        {dest && (
          <View style={styles.destBlock}>
            <View style={styles.destRow}>
              <Text style={styles.destName} numberOfLines={1}><Text style={{ color: DASH_MUTED, fontFamily: F.bold }}>To </Text>{dest.name || 'Destination'}</Text>
              <Text style={styles.destMeta}>{toDestM != null ? formatDistance(toDestM) : '--'}{eta ? ` · ETA ${eta}` : ''}</Text>
            </View>
            <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
              <View style={styles.progressTrack} />
              <View style={[styles.progressDone, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressYou, { left: `${progress * 100}%` }]} />
              <View style={styles.progressEnd} />
            </View>
          </View>
        )}

        <View style={styles.gaugeWrap}>
          <Gauge kmh={kmh} topKmh={topKmh} />
          <View style={styles.gaugeCenter} pointerEvents="none">
            <Text style={styles.speed}>{kmh}</Text>
            <Text style={styles.speedUnit}>KM/H</Text>
          </View>
          <Text style={[styles.gaugeEdge, { left: 18 }]}>0</Text>
          <Text style={[styles.gaugeEdge, { right: 14 }]}>{GAUGE_MAX_KMH}</Text>
          {topKmh > 5 && (
            <Text style={styles.gaugeTop}>top{'\n'}<Text style={{ color: DASH_INK, fontFamily: F.monoBold }}>{topKmh}</Text></Text>
          )}
        </View>

        <View style={styles.stats}>
          <Stat label="DISTANCE" value={distValue} unit={distUnit} first />
          <Stat label="MOVING" value={formatDuration(live.movingTimeS)} />
          <Stat label="AVERAGE" value={String(avgKmh)} unit="km/h" />
        </View>

        <View style={styles.controls}>
          <TouchableOpacity disabled={busy} onPress={onPhoto} accessibilityRole="button" accessibilityLabel="Take a photo" style={styles.square}>
            <Icon name="camera" size={22} color={DASH_INK} stroke={1.9} />
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={onPause} accessibilityRole="button" accessibilityLabel={paused ? 'Resume' : 'Pause'} style={styles.square}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              {paused
                ? <Path d="M8 5.5v13l11-6.5z" fill={DASH_INK} />
                : <Path d="M9 6v12M15 6v12" stroke={DASH_INK} strokeWidth={2.4} strokeLinecap="round" />}
            </Svg>
          </TouchableOpacity>
          <Pressable
            disabled={busy}
            onPressIn={holdStart}
            onPressOut={holdCancel}
            accessibilityRole="button"
            accessibilityLabel="Hold to finish ride"
            accessibilityHint="Press and hold to end and save the ride"
            style={styles.finish}
          >
            <Animated.View pointerEvents="none" style={[styles.finishFill, { width: fill }]} />
            <View style={styles.stop} />
            <Text style={styles.finishText}>Hold to finish</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value, unit, first }: { label: string; value: string; unit?: string; first?: boolean }) {
  return (
    <View style={[styles.stat, !first && { borderLeftWidth: 1, borderLeftColor: 'rgba(242,238,229,0.1)', paddingLeft: 16 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rec: { height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  recHalo: { width: 16, height: 16, borderRadius: 8, marginLeft: -4, backgroundColor: 'rgba(229,72,77,0.18)', alignItems: 'center', justifyContent: 'center' },
  recLabel: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.2 },
  recTime: { fontFamily: F.monoBold, fontSize: 14 },
  turn: { position: 'absolute', left: 16, right: 16, height: 80, borderRadius: 22, backgroundColor: AMBER, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  turnIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  turnDist: { fontFamily: F.monoBold, fontSize: 26, lineHeight: 30, color: INK, letterSpacing: -0.5 },
  turnUnit: { fontSize: 14 },
  turnText: { fontFamily: F.extra, fontSize: 14, color: INK },
  then: { alignItems: 'center', gap: 2, paddingLeft: 12, borderLeftWidth: 1.5, borderLeftColor: 'rgba(26,24,20,0.3)', borderStyle: 'dashed' },
  thenLabel: { fontFamily: F.black, fontSize: 10, letterSpacing: 1.2, color: 'rgba(26,24,20,0.72)' },
  syncChip: { position: 'absolute', alignSelf: 'center', height: 28, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  syncText: { fontFamily: F.semi, fontSize: 12 },
  rail: { position: 'absolute', right: 16, gap: 10 },
  railBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dash: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(242,238,229,0.2)' },
  destBlock: { marginTop: 14, gap: 12 },
  destRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  destName: { flex: 1, fontFamily: F.extra, fontSize: 15, color: DASH_INK },
  destMeta: { fontFamily: F.monoBold, fontSize: 13, color: DASH_MUTED },
  progress: { height: 12, justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(242,238,229,0.22)' },
  progressDone: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: AMBER },
  progressYou: { position: 'absolute', width: 12, height: 12, marginLeft: -6, borderRadius: 3, backgroundColor: DASH_INK, transform: [{ rotate: '45deg' }] },
  progressEnd: { position: 'absolute', right: -2, width: 10, height: 10, borderRadius: 2, borderWidth: 2, borderColor: AMBER, transform: [{ rotate: '45deg' }] },
  gaugeWrap: { alignSelf: 'center', width: 300, height: 160, marginTop: 8 },
  gaugeCenter: { position: 'absolute', left: 0, right: 0, top: 60, alignItems: 'center' },
  speed: { fontFamily: F.black, fontSize: 78, lineHeight: 80, letterSpacing: -3, color: DASH_INK },
  speedUnit: { fontFamily: F.extra, fontSize: 12, letterSpacing: 1.7, color: DASH_MUTED },
  gaugeEdge: { position: 'absolute', bottom: -4, fontFamily: F.monoSemi, fontSize: 11, color: DASH_MUTED },
  gaugeTop: { position: 'absolute', right: -14, top: 78, fontFamily: F.monoSemi, fontSize: 11, color: DASH_MUTED, textAlign: 'right' },
  stats: { flexDirection: 'row', marginTop: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(242,238,229,0.1)' },
  stat: { flex: 1, gap: 3 },
  statLabel: { fontFamily: F.bold, fontSize: 11, letterSpacing: 0.9, color: DASH_MUTED },
  statValue: { fontFamily: F.monoBold, fontSize: 19, color: DASH_INK },
  statUnit: { fontFamily: F.monoBold, fontSize: 12, color: DASH_MUTED },
  controls: { flexDirection: 'row', gap: 10, marginTop: 14 },
  square: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(242,238,229,0.08)', alignItems: 'center', justifyContent: 'center' },
  finish: { flex: 1, height: 56, borderRadius: 18, overflow: 'hidden', backgroundColor: DASH_INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  finishFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: AMBER },
  stop: { width: 12, height: 12, borderRadius: 3, backgroundColor: INK },
  finishText: { fontFamily: F.extra, fontSize: 15, color: INK },
});
