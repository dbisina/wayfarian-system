import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface NavArrowMarkerProps {
  size?: number;
  color?: string;
  arrowColor?: string;
}

export default function NavArrowMarker({ 
  size = 48, 
  color = '#FF6B00', // Wayfarian Orange
  arrowColor = '#FFFFFF' 
}: NavArrowMarkerProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Background Circle */}
      <Circle cx="50" cy="50" r="48" fill={color} />
      
      {/* Arrow Path (rounded to match the provided design) */}
      <Path
        d="M50 22 L76 78 L50 64 L24 78 Z"
        fill={arrowColor}
        stroke={arrowColor}
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
