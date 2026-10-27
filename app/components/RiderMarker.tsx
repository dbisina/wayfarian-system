// app/components/RiderMarker.tsx
// The rider on the live-ride map, as drawn in the design: a dark disc with a white ring and an amber
// arrow that points the way they are heading, inside a soft amber glow.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { AMBER, INK } from '../constants/design';

interface Props {
  coordinate: { latitude: number; longitude: number };
  /** Degrees clockwise from north. */
  heading: number;
}

export default function RiderMarker({ coordinate, heading }: Props) {
  // A marker is drawn to a bitmap; redraw for a moment so the first draw is complete, then freeze it.
  // Turning is done by the map (the `rotation` prop), which needs no redraw.
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFrozen(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker coordinate={coordinate} flat rotation={heading} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!frozen} zIndex={5} accessibilityLabel="Your position">
      <View style={{ width: 60, height: 60 }} collapsable={false}>
        <Svg width={60} height={60} viewBox="0 0 60 60">
          <Circle cx={30} cy={30} r={30} fill={AMBER} fillOpacity={0.18} />
          <Circle cx={30} cy={30} r={16} fill={INK} stroke="#FFFDF8" strokeWidth={3} />
          <Path d="M30 20 L37 37 L30 33 L23 37 Z" fill={AMBER} />
        </Svg>
      </View>
    </Marker>
  );
}
