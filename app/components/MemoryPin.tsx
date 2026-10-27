// app/components/MemoryPin.tsx
// A photo pin for the map's Memories layer: the photo as a rounded square with a tail, a count when
// several photos were taken in the same spot, and a stack behind it to show there are more.
//
// Map markers are drawn to a bitmap once and then frozen. A photo arrives over the network after the
// first draw, so the marker has to keep redrawing until the picture has loaded (and be rebuilt if it
// fails); freezing it too early is why photo pins show up empty or not at all.

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { AMBER, F, INK } from '../constants/design';

interface Props {
  coordinate: { latitude: number; longitude: number };
  uri?: string | null;
  count: number;
  selected: boolean;
  label: string;
  surface: string;
  onPress: () => void;
}

const PAD = 12; // room around the pin for the badge, stack and tail: a marker is clipped to its own box

export default function MemoryPin({ coordinate, uri, count, selected, label, surface, onPress }: Props) {
  const size = selected ? 64 : 48;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(uri ? 'loading' : 'failed');
  const [frozen, setFrozen] = useState(false);

  useEffect(() => { setState(uri ? 'loading' : 'failed'); }, [uri]);

  // Redraw while the photo loads and just after the pin changes size, then freeze (keeps Android fast).
  useEffect(() => {
    setFrozen(false);
    if (state === 'loading') {
      const giveUp = setTimeout(() => setFrozen(true), 12000); // never redraw forever on a dead connection
      return () => clearTimeout(giveUp);
    }
    const t = setTimeout(() => setFrozen(true), 300);
    return () => clearTimeout(t);
  }, [state, selected, count]);

  const ring = selected ? AMBER : surface;
  const badge = count > 1 ? (selected ? String(count) : `+${count - 1}`) : '';

  return (
    // Rebuilt when the photo finishes (or fails), so the frozen bitmap always has the final picture.
    <Marker
      key={state}
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={!frozen}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={selected ? 3 : 1}
      accessibilityLabel={label}
    >
      <View style={{ width: size + PAD * 2, height: size + PAD * 2 }} collapsable={false}>
        {count > 1 && !selected && (
          <>
            <View style={[styles.stack, { top: PAD, left: PAD, width: size, height: size, backgroundColor: surface, transform: [{ rotate: '9deg' }, { translateX: 6 }, { translateY: -3 }] }]} />
            <View style={[styles.stack, { top: PAD, left: PAD, width: size, height: size, backgroundColor: surface, transform: [{ rotate: '-7deg' }, { translateX: -4 }, { translateY: -2 }] }]} />
          </>
        )}
        <View style={[styles.tail, { backgroundColor: ring, left: PAD + size / 2 - 7, top: PAD + size - 7 }]} />
        <View style={[styles.frame, { top: PAD, left: PAD, width: size, height: size, borderColor: ring, backgroundColor: surface }]}>
          {state !== 'failed' && uri ? (
            <Image
              source={{ uri }}
              style={styles.photo}
              resizeMode="cover"
              onLoad={() => setState('ready')}
              onError={() => setState('failed')}
            />
          ) : (
            <View style={styles.placeholder}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
                <Circle cx={12} cy={13} r={3.5} stroke={INK} strokeWidth={2} />
              </Svg>
            </View>
          )}
        </View>
        {badge !== '' && (
          <View style={[styles.badge, { backgroundColor: selected ? AMBER : INK, borderColor: surface, top: PAD - 8, left: PAD + size - 16 }]}>
            <Text style={[styles.badgeText, { color: selected ? INK : '#F2EEE5' }]}>{badge}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderRadius: 14, borderWidth: 3, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  stack: { position: 'absolute', borderRadius: 14 },
  tail: { position: 'absolute', width: 14, height: 14, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  badge: { position: 'absolute', minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.monoBold, fontSize: 11 },
});
