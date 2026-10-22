// app/v2/V2Provider.tsx
//
// Mounts the v2 runtime for the signed-in user: binds the device data to the account (wiping
// another account's leftovers), starts uploads, restores a ride interrupted by a crash, keeps
// the query cache persisted per device, and blocks the app behind an "Update required" screen
// when the server says this build is too old.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useAuth } from '../contexts/AuthContext';
import { getRuntime, startSyncTriggers } from './runtime';
import { recoverRide } from './rideController';
import { isUpdateRequired } from './version';
import { startLiveActivityBridge } from './liveActivity';

const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/wayfarian/id6756589598',
  default: 'https://play.google.com/store/apps/details?id=com.wayfarian.wayfarianadventures',
})!;

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

function UpdateRequired() {
  return (
    <View style={styles.block}>
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.body}>
        This version of Wayfarian is no longer supported. Update to keep recording rides and to get your stats corrected.
      </Text>
      <Pressable style={styles.button} onPress={() => Linking.openURL(STORE_URL)} accessibilityRole="button">
        <Text style={styles.buttonText}>Update now</Text>
      </Pressable>
    </View>
  );
}

export function V2Provider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const rt = getRuntime();
  const [gate, setGate] = useState<'checking' | 'ok' | 'update'>('checking');
  const [bound, setBound] = useState(false);

  // Version gate: only a definite "too old" answer blocks. Offline or a server error lets the app run.
  useEffect(() => {
    let cancelled = false;
    rt.probeServer().then((c) => {
      if (!cancelled) setGate(c && isUpdateRequired(APP_VERSION, c.minAppVersion) ? 'update' : 'ok');
    });
    return () => { cancelled = true; };
  }, [rt]);

  // While the server has no v2 API (not deployed yet), keep checking so the app switches over by itself.
  useEffect(() => {
    const timer = setInterval(() => { if (rt.probe.state !== 'available') void rt.probeServer(); }, 60_000);
    return () => clearInterval(timer);
  }, [rt]);

  // Tie the on-device data to the signed-in account.
  useEffect(() => {
    let cancelled = false;
    setBound(false);
    if (!user?.id) return;
    rt.session.bind(user.id)
      .then(async () => {
        if (cancelled) return;
        setBound(true);
        rt.engine.resumeAfterAuth();
        await recoverRide().catch((e) => console.warn('[v2] ride recovery failed', e));
      })
      .catch((e) => console.warn('[v2] session bind failed', e));
    return () => { cancelled = true; };
  }, [user?.id, rt]);

  useEffect(() => (user?.id && bound ? startSyncTriggers() : undefined), [user?.id, bound]);
  useEffect(() => (user?.id && bound ? startLiveActivityBridge() : undefined), [user?.id, bound]);

  if (gate === 'checking') return <View style={styles.block}><ActivityIndicator /></View>;
  if (gate === 'update') return <UpdateRequired />;

  return (
    <PersistQueryClientProvider
      client={rt.queryClient}
      persistOptions={{ persister: rt.persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: `v2-${APP_VERSION}` }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  block: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0B0B0C' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  body: { color: '#C9C9CC', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  button: { backgroundColor: '#2196F3', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
