jest.mock('axios');
const axios = require('axios');

process.env.GOOGLE_MAPS_API_KEY = 'test-key';
const maps = require('../MapsService');

beforeEach(() => jest.resetAllMocks());

describe('MapsService on Places (New) and Routes', () => {
  test('nearby search posts to Places (New), closest first, and keeps the response shape', async () => {
    axios.post.mockResolvedValue({
      data: {
        places: [{
          id: 'p1', displayName: { text: 'TotalEnergies' }, shortFormattedAddress: 'Admiralty Way',
          location: { latitude: 6.43, longitude: 3.42 }, rating: 4.4, priceLevel: 'PRICE_LEVEL_MODERATE',
          types: ['gas_station'], currentOpeningHours: { openNow: true },
          photos: [{ name: 'places/p1/photos/abc', widthPx: 800, heightPx: 600 }],
        }],
      },
    });
    const out = await maps.findNearbyPlaces(6.4281, 3.4219, 'gas_station', 5000);
    const [url, body, cfg] = axios.post.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(body).toMatchObject({ includedTypes: ['gas_station'], rankPreference: 'DISTANCE', locationRestriction: { circle: { radius: 5000 } } });
    expect(cfg.headers['X-Goog-Api-Key']).toBe('test-key');
    expect(cfg.headers['X-Goog-FieldMask']).toContain('places.displayName');
    expect(out[0]).toMatchObject({
      id: 'p1', name: 'TotalEnergies', vicinity: 'Admiralty Way', rating: 4.4, priceLevel: 2, openNow: true,
      location: { latitude: 6.43, longitude: 3.42 },
      photos: [{ reference: 'places/p1/photos/abc', width: 800, height: 600 }],
    });
    expect(out[0].distance).toBeGreaterThan(0);
  });

  test('a generic search leaves the type out, the radius is capped, no results is an empty list', async () => {
    axios.post.mockResolvedValue({ data: {} });
    expect(await maps.findNearbyPlaces(1, 1, 'point_of_interest', 999999)).toEqual([]);
    const body = axios.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('includedTypes');
    expect(body.locationRestriction.circle.radius).toBe(50000);
  });

  test('autocomplete maps predictions to the shape the app reads and biases to the rider', async () => {
    axios.post.mockResolvedValue({
      data: { suggestions: [
        { placePrediction: { placeId: 'x1', text: { text: 'Lekki Phase 1, Lagos' }, structuredFormat: { mainText: { text: 'Lekki Phase 1' }, secondaryText: { text: 'Lagos' } }, types: ['neighborhood'] } },
        { queryPrediction: { text: { text: 'lekki beach' } } },
      ] },
    });
    const out = await maps.autocomplete('lekki', 6.45, 3.4, 20000);
    expect(axios.post.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(axios.post.mock.calls[0][1].locationBias.circle.center).toEqual({ latitude: 6.45, longitude: 3.4 });
    expect(out).toEqual([{ id: 'x1', placeId: 'x1', description: 'Lekki Phase 1, Lagos', structured: { main_text: 'Lekki Phase 1', secondary_text: 'Lagos' }, types: ['neighborhood'] }]);
  });

  test('place details map address, location and photos', async () => {
    axios.get.mockResolvedValue({ data: { id: 'p1', displayName: { text: 'Cafe' }, formattedAddress: '1 Road, Lagos', location: { latitude: 6.5, longitude: 3.3 }, nationalPhoneNumber: '0800', websiteUri: 'https://c.co', photos: [] } });
    const out = await maps.getPlaceDetails('p1');
    expect(axios.get.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places/p1');
    expect(out).toMatchObject({ id: 'p1', name: 'Cafe', address: '1 Road, Lagos', phone: '0800', website: 'https://c.co', location: { latitude: 6.5, longitude: 3.3 } });
  });

  test('directions use the Routes API with traffic for driving and return steps with a maneuver', async () => {
    axios.post.mockResolvedValue({
      data: { routes: [{
        distanceMeters: 12_400, duration: '1500s', polyline: { encodedPolyline: 'abc' },
        legs: [{ steps: [{
          distanceMeters: 800, staticDuration: '90s', polyline: { encodedPolyline: 'zz' },
          startLocation: { latLng: { latitude: 1, longitude: 2 } }, endLocation: { latLng: { latitude: 3, longitude: 4 } },
          navigationInstruction: { maneuver: 'TURN_RIGHT', instructions: 'Turn right onto Admiralty Way' },
        }] }],
      }] },
    });
    const out = await maps.getDirections({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, 'driving');
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' });
    expect(out.distance).toEqual({ text: '12.4 km', value: 12_400 });
    expect(out.duration).toEqual({ text: '25 min', value: 1500 });
    expect(out.polyline).toBe('abc');
    expect(out.steps[0]).toMatchObject({
      instruction: 'Turn right onto Admiralty Way', maneuver: 'TURN_RIGHT',
      startLocation: { lat: 1, lng: 2 }, endLocation: { lat: 3, lng: 4 }, distance: { value: 800, text: '800 m' },
    });
  });

  test('walking and cycling skip the traffic setting, and no route is an error', async () => {
    axios.post.mockResolvedValue({ data: { routes: [{ distanceMeters: 1, duration: '1s', legs: [{ steps: [] }] }] } });
    await maps.getDirections({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, 'bicycling');
    expect(axios.post.mock.calls[0][1]).toMatchObject({ travelMode: 'BICYCLE' });
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty('routingPreference');
    axios.post.mockResolvedValue({ data: {} });
    await expect(maps.getDirections({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 })).rejects.toThrow('Failed to get directions');
  });

  test('photos use the Places (New) media endpoint', () => {
    expect(maps.getPhotoUrl('places/p1/photos/abc', 300)).toBe('https://places.googleapis.com/v1/places/p1/photos/abc/media?maxWidthPx=300&key=test-key');
  });

  test('snap to roads needs two points and returns road-following points', async () => {
    expect(await maps.snapToRoads([{ latitude: 1, longitude: 1 }])).toEqual([]);
    axios.get.mockResolvedValue({ data: { snappedPoints: [{ location: { latitude: 1.1, longitude: 2.2 }, placeId: 'r1' }] } });
    const out = await maps.snapToRoads([{ latitude: 1, longitude: 1 }, { latitude: 1.001, longitude: 1.001 }]);
    expect(axios.get.mock.calls[0][1].params).toMatchObject({ path: '1,1|1.001,1.001', interpolate: true });
    expect(out).toEqual([{ latitude: 1.1, longitude: 2.2, placeId: 'r1' }]);
  });

  test('a missing key fails clearly', async () => {
    const m = new maps.MapsService();
    m.googleMapsApiKey = undefined;
    await expect(m.findNearbyPlaces(1, 1)).rejects.toThrow('Google Maps API key not configured');
  });
});
