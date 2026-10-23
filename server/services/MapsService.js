// server/services/MapsService.js
// Google Maps Platform access for the app. Every call goes through here so the key never reaches a
// phone and the app sees one stable response shape.
//
// Uses the current APIs: Places API (New) for search, autocomplete, details and photos, Routes API
// for directions, Geocoding for addresses and Roads for snapping a trail to the road. The older
// "legacy" Places and Directions APIs are not used, because new keys no longer have them enabled.

const axios = require('axios');

const PLACES = 'https://places.googleapis.com/v1';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROADS = 'https://roads.googleapis.com/v1';

const NEARBY_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress', 'places.location',
  'places.rating', 'places.priceLevel', 'places.types', 'places.currentOpeningHours.openNow', 'places.photos',
].join(',');

const DETAIL_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'websiteUri', 'regularOpeningHours',
  'rating', 'priceLevel', 'photos', 'location',
].join(',');

const ROUTE_FIELDS = [
  'routes.distanceMeters', 'routes.duration', 'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters', 'routes.legs.steps.staticDuration', 'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.startLocation', 'routes.legs.steps.endLocation', 'routes.legs.steps.navigationInstruction',
].join(',');

const TRAVEL_MODES = { driving: 'DRIVE', walking: 'WALK', bicycling: 'BICYCLE', transit: 'TRANSIT' };
const PRICE_LEVELS = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

/** "1234s" -> 1234 */
const parseSeconds = (d) => (typeof d === 'string' ? parseInt(d, 10) || 0 : 0);

const distanceText = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const durationText = (s) => {
  const mins = Math.max(1, Math.round(s / 60));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h} hr ${mins % 60} min` : `${mins} min`;
};

const latLng = (p) => (p && p.latLng ? { lat: p.latLng.latitude, lng: p.latLng.longitude } : null);

const photoList = (photos) =>
  (photos || []).map((p) => ({ reference: p.name, width: p.widthPx, height: p.heightPx }));

function mapNearbyPlace(place, fromLat, fromLng, distance) {
  const loc = place.location || {};
  return {
    id: place.id,
    name: place.displayName?.text,
    vicinity: place.shortFormattedAddress || place.formattedAddress,
    location: { latitude: loc.latitude, longitude: loc.longitude },
    rating: place.rating,
    priceLevel: PRICE_LEVELS[place.priceLevel],
    types: place.types,
    openNow: place.currentOpeningHours?.openNow,
    photos: photoList(place.photos),
    distance: distance(fromLat, fromLng, loc.latitude, loc.longitude),
  };
}

function mapRoute(route) {
  const leg = route.legs?.[0] || { steps: [] };
  const meters = route.distanceMeters || 0;
  const seconds = parseSeconds(route.duration);
  return {
    distance: { text: distanceText(meters), value: meters },
    duration: { text: durationText(seconds), value: seconds },
    startAddress: '',
    endAddress: '',
    polyline: route.polyline?.encodedPolyline || '',
    steps: (leg.steps || []).map((s) => {
      const m = s.distanceMeters || 0;
      const sec = parseSeconds(s.staticDuration);
      return {
        instruction: s.navigationInstruction?.instructions || '',
        maneuver: s.navigationInstruction?.maneuver || null,
        distance: { text: distanceText(m), value: m },
        duration: { text: durationText(sec), value: sec },
        startLocation: latLng(s.startLocation),
        endLocation: latLng(s.endLocation),
        polyline: s.polyline?.encodedPolyline || '',
      };
    }),
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
    if (!this.googleMapsApiKey) throw new Error('Google Maps API key not configured');
  }

  headers(fieldMask) {
    return { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.googleMapsApiKey, ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}) };
  }

  /**
   * Search nearby places (Places API New), closest first.
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
      const response = await axios.post(`${PLACES}/places:searchNearby`, body, { headers: this.headers(NEARBY_FIELDS), timeout: 10000 });
      return (response.data.places || []).map((p) => mapNearbyPlace(p, latitude, longitude, (a, b, c, d) => this.calculateDistance(a, b, c, d)));
    } catch (error) {
      console.error('Find nearby places error:', error.response?.data?.error?.message || error.message);
      throw new Error('Failed to find nearby places');
    }
  }

  /** Place details by place id (Places API New). */
  async getPlaceDetails(placeId) {
    this.requireKey();
    try {
      const response = await axios.get(`${PLACES}/places/${encodeURIComponent(placeId)}`, { headers: this.headers(DETAIL_FIELDS), timeout: 10000 });
      const p = response.data;
      return {
        id: p.id || placeId,
        name: p.displayName?.text,
        address: p.formattedAddress,
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
        location: { latitude: p.location?.latitude, longitude: p.location?.longitude },
        rating: p.rating,
        priceLevel: PRICE_LEVELS[p.priceLevel],
        openingHours: p.regularOpeningHours,
        photos: photoList(p.photos),
      };
    } catch (error) {
      console.error('Get place details error:', error.response?.data?.error?.message || error.message);
      throw new Error('Failed to get place details');
    }
  }

  /** Address to coordinates (Geocoding API). */
  async geocodeAddress(address) {
    this.requireKey();
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address, key: this.googleMapsApiKey },
        timeout: 10000,
      });
      if (response.data.status !== 'OK') throw new Error(`Geocoding API error: ${response.data.status}`);
      const result = response.data.results[0];
      return {
        location: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components,
        placeId: result.place_id,
      };
    } catch (error) {
      console.error('Geocode address error:', error.message);
      throw new Error('Failed to geocode address');
    }
  }

  /** Coordinates to address (Geocoding API). */
  async reverseGeocode(latitude, longitude) {
    this.requireKey();
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { latlng: `${latitude},${longitude}`, key: this.googleMapsApiKey },
        timeout: 10000,
      });
      if (response.data.status !== 'OK') throw new Error(`Reverse geocoding API error: ${response.data.status}`);
      const result = response.data.results[0];
      return {
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components,
        placeId: result.place_id,
        types: result.types,
      };
    } catch (error) {
      console.error('Reverse geocode error:', error.message);
      throw new Error('Failed to reverse geocode coordinates');
    }
  }

  /**
   * Route between two points (Routes API), with turn instructions and live traffic for driving.
   * Steps carry a `maneuver` (for example TURN_LEFT) and their own encoded polyline.
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
      const response = await axios.post(ROUTES, body, { headers: this.headers(ROUTE_FIELDS), timeout: 15000 });
      const route = response.data.routes && response.data.routes[0];
      if (!route) throw new Error('No route found');
      return mapRoute(route);
    } catch (error) {
      console.error('Get directions error:', error.response?.data?.error?.message || error.message);
      throw new Error('Failed to get directions');
    }
  }

  /** Snaps a recorded trail to the roads it followed (Roads API). Returns [] when nothing could be snapped. */
  async snapToRoads(points) {
    this.requireKey();
    if (!Array.isArray(points) || points.length < 2) return [];
    try {
      const path = points.slice(0, 100).map((p) => `${p.latitude},${p.longitude}`).join('|');
      const response = await axios.get(`${ROADS}/snapToRoads`, { params: { path, interpolate: true, key: this.googleMapsApiKey }, timeout: 10000 });
      return (response.data.snappedPoints || []).map((p) => ({ latitude: p.location.latitude, longitude: p.location.longitude, placeId: p.placeId }));
    } catch (error) {
      console.error('Snap to roads error:', error.response?.data?.error?.message || error.message);
      throw new Error('Failed to snap to roads');
    }
  }

  /** A place photo url. `reference` is a Places (New) photo name like places/<id>/photos/<ref>. */
  getPhotoUrl(reference, maxWidth = 400) {
    this.requireKey();
    return `${PLACES}/${reference}/media?maxWidthPx=${maxWidth}&key=${this.googleMapsApiKey}`;
  }

  /** Fetches a place photo and returns the raw image payload. */
  async fetchPlacePhoto(reference, maxWidth = 400) {
    this.requireKey();
    try {
      const response = await axios.get(`${PLACES}/${reference}/media`, {
        params: { maxWidthPx: maxWidth, key: this.googleMapsApiKey },
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
      });
      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const lengthHeader = response.headers['content-length'];
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

  /** Place predictions as you type (Places API New), biased to where the rider is. */
  async autocomplete(input, latitude, longitude, radius = 20000) {
    this.requireKey();
    try {
      const body = {
        input,
        languageCode: 'en',
        ...(this.isValidCoordinate(latitude, longitude)
          ? { locationBias: { circle: { center: { latitude, longitude }, radius: Math.min(Math.max(radius, 1), 50000) } } }
          : {}),
      };
      const response = await axios.post(`${PLACES}/places:autocomplete`, body, { headers: this.headers(), timeout: 8000 });
      return (response.data.suggestions || [])
        .filter((s) => s.placePrediction)
        .map(({ placePrediction: p }) => ({
          id: p.placeId,
          placeId: p.placeId,
          description: p.text?.text,
          structured: {
            main_text: p.structuredFormat?.mainText?.text,
            secondary_text: p.structuredFormat?.secondaryText?.text,
          },
          types: p.types,
        }));
    } catch (error) {
      console.error('Autocomplete service error:', error.response?.data?.error?.message || error.message);
      throw new Error(`Failed to get autocomplete predictions: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new MapsService();
module.exports.MapsService = MapsService;
module.exports._internals = { mapRoute, mapNearbyPlace, parseSeconds, distanceText, durationText };
