// app/v2/mapStyle.ts
// Map look shared by every map screen: the calm warm style (Android / Google Maps only, as Apple
// Maps has no custom styles) and the mapping from the Settings "Map type" choice to what each
// platform's map understands.

export type MapTypeSetting = 'standard' | 'satellite' | 'terrain';
export type NativeMapType = 'standard' | 'hybrid' | 'terrain';

/** The map style in the app's own colours, light or dark. */
export const mapStyle = (dark: boolean) => {
  const c = dark
    ? { land: '#161513', poi: '#1E1C19', road: '#2A2723', major: '#38332B', water: '#132029', text: '#A29B8D', stroke: '#161513' }
    : { land: '#ECE6D9', poi: '#E2DBCB', road: '#FFFDF8', major: '#FFFDF8', water: '#C9DCDD', text: '#625C51', stroke: '#ECE6D9' };
  return [
    { elementType: 'geometry', stylers: [{ color: c.land }] },
    { elementType: 'labels.text.fill', stylers: [{ color: c.text }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: c.stroke }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: c.road }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: c.major }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: c.poi }] },
  ];
};

/**
 * Satellite is drawn with street labels on top ("hybrid"), which is what riders want. Terrain only
 * exists on Google Maps (Android); Apple Maps has no equivalent, so an iPhone shows standard.
 */
export function nativeMapType(type: MapTypeSetting, platform: string): NativeMapType {
  if (type === 'satellite') return 'hybrid';
  if (type === 'terrain') return platform === 'android' ? 'terrain' : 'standard';
  return 'standard';
}

/** The warm custom style only suits the standard layer; satellite and terrain keep their own imagery. */
export const usesCustomStyle = (native: NativeMapType, platform: string): boolean => native === 'standard' && platform === 'android';
