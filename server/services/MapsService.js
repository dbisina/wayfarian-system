// server/services/MapsService.js
// Google Maps Platform access, used as the fallback behind the provider chain in services/geo.
// Every call goes through here so the key never reaches a phone and the app sees one stable shape.
//
// Uses the current APIs: Places API (New) for autocomplete, nearby search, text search, details and
// photos, and the Routes API for directions. The older "legacy" Places, Directions and Geocoding
// APIs are not used: new Google Cloud projects no longer have them enabled, which is why the old
// code answered REQUEST_DENIED in production.
//
// Field masks are kept to the fields the app shows. Google bills Places requests by the most
// expensive field asked for, and rating, hours, phone and website are the costly ones.

const axios = require('axios');
const { GeoError, fromAxios, decodePolyline, encodePolyline } = require('./geo/normalize');

const PLACES = 'https://places.googleapis.com/v1';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const NEARBY_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress',
  'places.location', 'places.types',
].join(',');
const DETAIL_FIELDS = ['id', 'displayName', 'formattedAddress', 'location'].join(',');
const SEARCH_FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location'].join(',');
const ROUTE_FIELDS = [
  'routes.distanceMeters', 'routes.duration', 'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters', 'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.endLocation', 'routes.legs.steps.navigationInstruction',
].join(',');

// Routes has no motorcycle profile for most countries (TWO_WHEELER is limited), so it drives.
const TRAVEL_MODES = { driving: 'DRIVE', motorcycle: 'DRIVE', walking: 'WALK', bicycling: 'BICYCLE' };

// A Places (New) photo reference: places/<place id>/photos/<photo id>. Anything else is refused so
// the proxy cannot be pointed at some other path on Google's host.
const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/** "1234s" -> 1234 */
const parseSeconds = (d) => (typeof d === 'string' ? parseInt(d, 10) || 0 : 0);

const distanceText = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const durationText = (s) => {
  const mins = Math.max(1, Math.round(s / 60));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h} hr ${mins % 60} min` : `${mins} min`;
};

/** TURN_SLIGHT_LEFT -> turn-slight-left, the names the app's turn arrows read. */
const MANEUVER_ALIASES = { KEEP_LEFT: 'fork-left', KEEP_RIGHT: 'fork-right' };
const maneuverName = (m) => (m ? MANEUVER_ALIASES[m] || String(m).toLowerCase().replace(/_/g, '-') : null);

const point = (loc) => (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) ? { latitude: loc.latitude, longitude: loc.longitude } : null);

/** A Places (New) place as the app's nearby-place shape. */
function mapNearbyPlace(place, fromLat, fromLng, distance) {
  const loc = place.location || {};
  return {
    id: place.id,
    name: place.displayName?.text,
    vicinity: place.shortFormattedAddress || place.formattedAddress,
    location: { latitude: loc.latitude, longitude: loc.longitude },
    rating: undefined,
    priceLevel: undefined,
    types: place.types || [],
    openNow: undefined,
    photos: [],
    distance: distance(fromLat, fromLng, loc.latitude, loc.longitude),
  };
}

/**
 * A Routes API route as the app's route shape. Steps with no instruction (road continues, name
 * changes) extend the manoeuvre before them instead of becoming blank turn cards, as for Geoapify.
 */
function mapRoute(route) {
  const raw = route.legs?.[0]?.steps || [];
  const path = [];
  const steps = [];
  for (const s of raw) {
    if (s.polyline?.encodedPolyline) path.push(...decodePolyline(s.polyline.encodedPolyline));
    const end = point(s.endLocation?.latLng);
    const text = s.navigationInstruction?.instructions;
    const metres = s.distanceMeters || 0;
    if (text || !steps.length) {
      steps.push({
        instruction: text || 'Continue',
        maneuver: maneuverName(s.navigationInstruction?.maneuver),
        distanceM: metres,
        end,
        speedLimitKmh: null,
      });
    } else {
      const prev = steps[steps.length - 1];
      prev.distanceM += metres;
      if (end) prev.end = end;
    }
  }
  const meters = route.distanceMeters || 0;
  const seconds = parseSeconds(route.duration);
  return {
    distance: { text: distanceText(meters), value: meters },
    duration: { text: durationText(seconds), value: seconds },
    startAddress: undefined,
    endAddress: undefined,
    // The steps' own lines together are finer than the overview line, which matters for off-route
    // checks on winding roads.
    polyline: path.length > 1 ? encodePolyline(path) : route.polyline?.encodedPolyline || '',
    steps: steps.filter((s) => s.end),
  };
}

class MapsService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

    if (!this.googleMapsApiKey && !this.mapboxToken) {
      console.warn('Warning: No maps API keys configured');
    }
  }

  requireKey() {
    if (!this.googleMapsApiKey) throw new GeoError('NOT_CONFIGURED', 'Google Maps API key not configured');
  }

  headers(fieldMask) {
    return {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.googleMapsApiKey,
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
    };
  }

  /** Logs Google's own message (never the key) and returns a GeoError the chain understands. */
  fail(label, error) {
    const detail = error?.response?.data?.error?.message || error?.message;
    console.error(`${label}:`, detail);
    return fromAxios('google', error);
  }

  /**
   * Nearby places (Places API New), closest first.
   * @param {string} type - A Places type such as gas_station, lodging, restaurant. 'point_of_interest' means any.
   */
  async findNearbyPlaces(latitude, longitude, type = 'point_of_interest', radius = 5000) {
    this.requireKey();
    try {
      const body = {
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude, longitude }, radius: Math.min(Math.max(radius, 1), 50000) } },
        ...(type && type !== 'point_of_interest' ? { includedTypes: [type] } : {}),
      };
      const res = await axios.post(`${PLACES}/places:searchNearby`, body, { headers: this.headers(NEARBY_FIELDS), timeout: 10000 });
      return (res.data.places || []).map((p) => mapNearbyPlace(p, latitude, longitude, (a, b, c, d) => this.calculateDistance(a, b, c, d)));
    } catch (error) {
      throw this.fail('Find nearby places error', error);
    }
  }

  /** Place details by place id (Places API New). `sessionToken` closes the autocomplete session. */
  async getPlaceDetails(placeId, sessionToken) {
    this.requireKey();
    try {
      const res = await axios.get(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
        headers: this.headers(DETAIL_FIELDS),
        params: sessionToken ? { sessionToken } : undefined,
        timeout: 10000,
      });
      const p = res.data;
      return {
        id: p.id || placeId,
        name: p.displayName?.text,
        address: p.formattedAddress,
        location: { latitude: p.location?.latitude, longitude: p.location?.longitude },
        photos: [],
      };
    } catch (error) {
      throw this.fail('Get place details error', error);
    }
  }

  /** Address or place name to coordinates (Places API New text search). */
  async geocodeAddress(address) {
    this.requireKey();
    try {
      const res = await axios.post(`${PLACES}/places:searchText`, { textQuery: address, maxResultCount: 1, languageCode: 'en' }, {
        headers: this.headers(SEARCH_FIELDS),
        timeout: 10000,
      });
      const p = res.data.places?.[0];
      if (!p || !point(p.location)) throw new GeoError('NO_RESULTS', 'google: address not found');
      return {
        location: { latitude: p.location.latitude, longitude: p.location.longitude },
        formattedAddress: p.formattedAddress,
        addressComponents: [],
        placeId: p.id,
      };
    } catch (error) {
      if (error instanceof GeoError) throw error;
      throw this.fail('Geocode address error', error);
    }
  }

  /**
   * Route between two points (Routes API), with turn instructions and live traffic for driving.
   * Returns steps as { instruction, maneuver, distanceM, end }.
   */
  async getDirections(origin, destination, mode = 'driving') {
    this.requireKey();
    try {
      const travelMode = TRAVEL_MODES[mode] || 'DRIVE';
      const body = {
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode,
        ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
        languageCode: 'en',
        units: 'METRIC',
      };
      const res = await axios.post(ROUTES, body, { headers: this.headers(ROUTE_FIELDS), timeout: 15000 });
      const route = res.data.routes && res.data.routes[0];
      if (!route) throw new GeoError('NO_RESULTS', 'google: no route');
      const mapped = mapRoute(route);
      if (!mapped.steps.length) throw new GeoError('NO_RESULTS', 'google: route has no steps');
      return mapped;
    } catch (error) {
      if (error instanceof GeoError) throw error;
      throw this.fail('Get directions error', error);
    }
  }

  /** A place photo url. `reference` is a Places (New) photo name like places/<id>/photos/<ref>. */
  getPhotoUrl(reference, maxWidth = 400) {
    this.requireKey();
    if (!PHOTO_REF.test(String(reference))) throw new Error('Invalid photo reference');
    return `${PLACES}/${reference}/media?maxWidthPx=${maxWidth}&key=${this.googleMapsApiKey}`;
  }

  /** Fetches a place photo and returns the raw image payload. */
  async fetchPlacePhoto(reference, maxWidth = 400) {
    this.requireKey();
    if (!PHOTO_REF.test(String(reference))) {
      const notFound = new Error('Photo not found');
      notFound.status = 404;
      throw notFound;
    }
    try {
      const res = await axios.get(`${PLACES}/${reference}/media`, {
        params: { maxWidthPx: maxWidth, key: this.googleMapsApiKey },
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
      });
      const buffer = Buffer.from(res.data);
      const contentType = res.headers['content-type'] || 'image/jpeg';
      const lengthHeader = res.headers['content-length'];
      const length = typeof lengthHeader === 'string' ? parseInt(lengthHeader, 10) : buffer.length;
      return { buffer, length: Number.isFinite(length) ? length : buffer.length, contentType };
    } catch (error) {
      if (error.response?.status === 404) {
        const notFound = new Error('Photo not found');
        notFound.status = 404;
        throw notFound;
      }
      console.error('Fetch place photo error:', error.message);
      throw new Error('Failed to fetch place photo');
    }
  }

  /** Kilometres between two coordinates (haversine). */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  isValidCoordinate(latitude, longitude) {
    return (
      typeof latitude === 'number' && typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    );
  }

  /**
   * Place predictions as you type (Places API New), biased to where the rider is. No type filter:
   * riders search for shops, landmarks and addresses alike. `sessionToken` groups the keystrokes
   * and the final details call into one billed session.
   */
  async autocomplete(input, latitude, longitude, radius = 20000, sessionToken) {
    this.requireKey();
    try {
      const body = {
        input,
        languageCode: 'en',
        ...(sessionToken ? { sessionToken } : {}),
        ...(this.isValidCoordinate(latitude, longitude)
          ? { locationBias: { circle: { center: { latitude, longitude }, radius: Math.min(Math.max(radius, 1), 50000) } } }
          : {}),
      };
      const res = await axios.post(`${PLACES}/places:autocomplete`, body, { headers: this.headers(), timeout: 8000 });
      return (res.data.suggestions || [])
        .filter((s) => s.placePrediction)
        .map(({ placePrediction: p }) => ({
          id: p.placeId,
          placeId: p.placeId,
          description: p.text?.text,
          structured: {
            main_text: p.structuredFormat?.mainText?.text,
            secondary_text: p.structuredFormat?.secondaryText?.text,
          },
          types: p.types || [],
        }));
    } catch (error) {
      throw this.fail('Autocomplete service error', error);
    }
  }
}

module.exports = new MapsService();
module.exports.MapsService = MapsService;
module.exports._internals = { mapRoute, mapNearbyPlace, parseSeconds, distanceText, durationText, maneuverName, PHOTO_REF };
