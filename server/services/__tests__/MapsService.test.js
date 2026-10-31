// Google provider: Places (New) and Routes request shapes, response mapping, and error codes.
// axios is mocked, so no network and no key.

jest.mock('axios');
process.env.GOOGLE_MAPS_API_KEY = 'test-key';

const axios = require('axios');
const maps = require('../MapsService');
const { encodePolyline, decodePolyline } = require('../geo/normalize');

const { mapRoute, maneuverName, PHOTO_REF } = maps._internals;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const axiosError = (status, message = 'nope') => Object.assign(new Error(message), { response: { status, data: { error: { message } } } });

describe('autocomplete', () => {
  test('uses Places (New): sends the session token and a location bias, maps predictions', async () => {
    axios.post.mockResolvedValue({
      data: {
        suggestions: [
          { placePrediction: { placeId: 'ChIJabc', text: { text: 'Mama Cass, Yaba, Lagos' }, structuredFormat: { mainText: { text: 'Mama Cass' }, secondaryText: { text: 'Yaba, Lagos' } }, types: ['restaurant'] } },
          { queryPrediction: { text: { text: 'mama cass yaba' } } }, // a suggested search, not a place: dropped
        ],
      },
    });
    const out = await maps.autocomplete('mama cass', 6.5, 3.4, 20000, 'sess-1');

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(body.sessionToken).toBe('sess-1');
    expect(body.locationBias.circle).toEqual({ center: { latitude: 6.5, longitude: 3.4 }, radius: 20000 });
    expect(body.includedPrimaryTypes).toBeUndefined(); // no type filter: shops and landmarks must be found
    expect(config.headers['X-Goog-Api-Key']).toBe('test-key');
    expect(out).toEqual([
      { id: 'ChIJabc', placeId: 'ChIJabc', description: 'Mama Cass, Yaba, Lagos', structured: { main_text: 'Mama Cass', secondary_text: 'Yaba, Lagos' }, types: ['restaurant'] },
    ]);
  });

  test('no suggestions is an empty list', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await expect(maps.autocomplete('zzzz')).resolves.toEqual([]);
  });
});

describe('nearby', () => {
  test('asks only for the fields the app shows (the costly ones are left out) and sorts by distance', async () => {
    axios.post.mockResolvedValue({
      data: { places: [{ id: 'p1', displayName: { text: 'Total' }, shortFormattedAddress: 'Admiralty Way', formattedAddress: 'Long address', location: { latitude: 6.45, longitude: 3.47 }, types: ['gas_station'] }] },
    });
    const out = await maps.findNearbyPlaces(6.45, 3.47, 'gas_station', 5000);
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(body.includedTypes).toEqual(['gas_station']);
    expect(body.rankPreference).toBe('DISTANCE');
    const mask = config.headers['X-Goog-FieldMask'];
    expect(mask).toContain('places.displayName');
    expect(mask).not.toMatch(/rating|openingHours|phone|website|photos/);
    expect(out[0]).toMatchObject({ id: 'p1', name: 'Total', vicinity: 'Admiralty Way', location: { latitude: 6.45, longitude: 3.47 } });
    expect(out[0].distance).toBeCloseTo(0, 3);
  });

  test('"point_of_interest" means any type', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await maps.findNearbyPlaces(6.45, 3.47);
    expect(axios.post.mock.calls[0][1].includedTypes).toBeUndefined();
  });
});

describe('details and geocode', () => {
  test('details sends the session token and returns what the app reads', async () => {
    axios.get.mockResolvedValue({ data: { id: 'ChIJabc', displayName: { text: 'Mama Cass' }, formattedAddress: 'Yaba, Lagos', location: { latitude: 6.5, longitude: 3.38 } } });
    const out = await maps.getPlaceDetails('ChIJabc', 'sess-1');
    const [url, config] = axios.get.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJabc');
    expect(config.params).toEqual({ sessionToken: 'sess-1' });
    expect(config.headers['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location');
    expect(out).toMatchObject({ id: 'ChIJabc', name: 'Mama Cass', address: 'Yaba, Lagos', location: { latitude: 6.5, longitude: 3.38 } });
  });

  test('geocoding uses text search, not the Geocoding API', async () => {
    axios.post.mockResolvedValue({ data: { places: [{ id: 'p', formattedAddress: 'Lekki Phase 1, Lagos', location: { latitude: 6.44, longitude: 3.47 } }] } });
    const out = await maps.geocodeAddress('Lekki Phase 1');
    expect(axios.post.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(out).toEqual({ location: { latitude: 6.44, longitude: 3.47 }, formattedAddress: 'Lekki Phase 1, Lagos', addressComponents: [], placeId: 'p' });
  });

  test('an address Google cannot find is NO_RESULTS, not a failure', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await expect(maps.geocodeAddress('qwertyuiop')).rejects.toMatchObject({ code: 'NO_RESULTS' });
  });
});

describe('directions', () => {
  const line = (a, b) => ({ encodedPolyline: encodePolyline([a, b]) });
  const A = { latitude: 6.45, longitude: 3.47 };
  const B = { latitude: 6.46, longitude: 3.47 };
  const C = { latitude: 6.47, longitude: 3.48 };
  const latLng = (p) => ({ latLng: p });

  const route = {
    distanceMeters: 2500,
    duration: '300s',
    legs: [{
      steps: [
        { distanceMeters: 1100, polyline: line(A, B), endLocation: latLng(B), navigationInstruction: { maneuver: 'TURN_LEFT', instructions: 'Turn left onto Admiralty Way' } },
        { distanceMeters: 200, polyline: line(B, C), endLocation: latLng(C) }, // no instruction: the road simply continues
        { distanceMeters: 1200, polyline: line(C, A), endLocation: latLng(A), navigationInstruction: { maneuver: 'KEEP_RIGHT', instructions: 'Keep right' } },
      ],
    }],
  };

  test('maps a route to the app shape: blank steps merged, manoeuvres renamed, fine line kept', () => {
    const r = mapRoute(route);
    expect(r.distance).toEqual({ text: '2.5 km', value: 2500 });
    expect(r.duration).toEqual({ text: '5 min', value: 300 });
    expect(r.steps.map((s) => [s.instruction, s.maneuver, s.distanceM])).toEqual([
      ['Turn left onto Admiralty Way', 'turn-left', 1300],
      ['Keep right', 'fork-right', 1200],
    ]);
    expect(r.steps[0].end).toEqual(C); // the merged piece moved where the turn ends
    expect(decodePolyline(r.polyline).length).toBeGreaterThan(2);
  });

  test('manoeuvre names match what the app turn arrows read', () => {
    expect(maneuverName('TURN_SLIGHT_RIGHT')).toBe('turn-slight-right');
    expect(maneuverName('UTURN_LEFT')).toBe('uturn-left');
    expect(maneuverName('ROUNDABOUT_RIGHT')).toBe('roundabout-right');
    expect(maneuverName('KEEP_LEFT')).toBe('fork-left');
    expect(maneuverName(undefined)).toBeNull();
  });

  test('a motorcycle drives; driving asks for traffic; walking does not', async () => {
    axios.post.mockResolvedValue({ data: { routes: [route] } });
    await maps.getDirections(A, C, 'motorcycle');
    expect(axios.post.mock.calls[0][1].travelMode).toBe('DRIVE');
    expect(axios.post.mock.calls[0][1].routingPreference).toBe('TRAFFIC_AWARE');
    await maps.getDirections(A, C, 'walking');
    expect(axios.post.mock.calls[1][1].travelMode).toBe('WALK');
    expect(axios.post.mock.calls[1][1].routingPreference).toBeUndefined();
  });

  test('no route is NO_RESULTS', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await expect(maps.getDirections(A, C)).rejects.toMatchObject({ code: 'NO_RESULTS' });
  });
});

describe('errors', () => {
  test('a rejected key is DENIED and a quota hit is RATE_LIMITED, so the chain can rest the provider', async () => {
    axios.post.mockRejectedValueOnce(axiosError(403, 'API not enabled'));
    await expect(maps.autocomplete('x')).rejects.toMatchObject({ code: 'DENIED' });
    axios.post.mockRejectedValueOnce(axiosError(429));
    await expect(maps.autocomplete('x')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    axios.post.mockRejectedValueOnce(axiosError(503));
    await expect(maps.autocomplete('x')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  test('the key is never in a logged message', async () => {
    axios.post.mockRejectedValueOnce(axiosError(403, 'API not enabled'));
    await maps.autocomplete('x').catch(() => {});
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('test-key');
  });
});

describe('photos', () => {
  test('only Places (New) photo references are fetched', async () => {
    expect(PHOTO_REF.test('places/ChIJabc/photos/AUc7-x_y')).toBe(true);
    expect(PHOTO_REF.test('../../v1/places/x')).toBe(false);
    expect(PHOTO_REF.test('places/a/photos/b/../../c')).toBe(false);
    await expect(maps.fetchPlacePhoto('../../elsewhere')).rejects.toMatchObject({ status: 404 });
    expect(axios.get).not.toHaveBeenCalled();
  });
});
