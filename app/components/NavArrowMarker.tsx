import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';

interface NavArrowMarkerProps {
  size?: number;
  color?: string;
  arrowColor?: string;
  showHalo?: boolean;
}

export default function NavArrowMarker({
  size = 48,
  color = '#FF6B00',
  arrowColor = '#FFFFFF',
  showHalo = true,
}: NavArrowMarkerProps) {
  const haloSize = size * 1.6;

  return (
    <View style={{ width: haloSize, height: haloSize, alignItems: 'center', justifyContent: 'center' }}>
      {showHalo && (
        <Svg
          width={haloSize}
          height={haloSize}
          viewBox="0 0 100 100"
          style={{ position: 'absolute' }}
        >
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <Stop offset="60%" stopColor={color} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="48" fill="url(#halo)" />
        </Svg>
      )}

      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="44" fill={color} />
        <Circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" strokeWidth="4" />
        {/* Arrow points UP (north in local frame). Rotation is applied by the parent. */}
        <Path
          d="M50 20 L72 72 L50 60 L28 72 Z"
          fill={arrowColor}
          stroke={arrowColor}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
