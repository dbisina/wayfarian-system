// server/services/MapsService.js

const axios = require('axios');

class MapsService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    
    if (!this.googleMapsApiKey && !this.mapboxToken) {
      console.warn('Warning: No maps API keys configured');
    }
  }

  /**
   * Search nearby places using Google Places API
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {string} type - Place type (gas_station, hospital, restaurant, etc.)
   * @param {number} radius - Search radius in meters (default: 5000)
   * @returns {Promise<Array>} Array of nearby places
   */
  async findNearbyPlaces(latitude, longitude, type = 'point_of_interest', radius = 5000) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
        params: {
          location: `${latitude},${longitude}`,
          radius,
          type,
          key: this.googleMapsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      return response.data.results.map(place => ({
        id: place.place_id,
        name: place.name,
        vicinity: place.vicinity,
        location: {
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
        },
        rating: place.rating,
        priceLevel: place.price_level,
        types: place.types,
        openNow: place.opening_hours?.open_now,
        photos: place.photos?.map(photo => ({
          reference: photo.photo_reference,
          width: photo.width,
          height: photo.height,
        })) || [],
        distance: this.calculateDistance(
          latitude, longitude,
          place.geometry.location.lat, place.geometry.location.lng
        ),
      }));
    } catch (error) {
      console.error('Find nearby places error:', error);
      throw new Error('Failed to find nearby places');
    }
  }

  /**
   * Get place details by place ID
   * @param {string} placeId - Google Places ID
   * @returns {Promise<object>} Place details
   */
  async getPlaceDetails(placeId) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: {
          place_id: placeId,
          fields: 'name,vicinity,formatted_address,formatted_phone_number,website,opening_hours,rating,price_level,photos,geometry',
          key: this.googleMapsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status}`);
      }

      const place = response.data.result;
      return {
        id: placeId,
        name: place.name,
        address: place.formatted_address,
        phone: place.formatted_phone_number,
        website: place.website,
        location: {
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
        },
        rating: place.rating,
        priceLevel: place.price_level,
        openingHours: place.opening_hours,
        photos: place.photos?.map(photo => ({
          reference: photo.photo_reference,
          width: photo.width,
          height: photo.height,
        })) || [],
      };
    } catch (error) {
      console.error('Get place details error:', error);
      throw new Error('Failed to get place details');
    }
  }

  /**
   * Geocode address to coordinates
   * @param {string} address - Address to geocode
   * @returns {Promise<object>} Coordinates and formatted address
   */
  async geocodeAddress(address) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: this.googleMapsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Geocoding API error: ${response.data.status}`);
      }

      const result = response.data.results[0];
      return {
        location: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
        },
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components,
        placeId: result.place_id,
      };
    } catch (error) {
      console.error('Geocode address error:', error);
      throw new Error('Failed to geocode address');
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {Promise<object>} Address information
   */
  async reverseGeocode(latitude, longitude) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${latitude},${longitude}`,
          key: this.googleMapsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Reverse geocoding API error: ${response.data.status}`);
      }

      const result = response.data.results[0];
      return {
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components,
        placeId: result.place_id,
        types: result.types,
      };
    } catch (error) {
      console.error('Reverse geocode error:', error);
      throw new Error('Failed to reverse geocode coordinates');
    }
  }

  /**
   * Get route directions between two points
   * @param {object} origin - Origin coordinates {latitude, longitude}
   * @param {object} destination - Destination coordinates {latitude, longitude}
   * @param {string} mode - Travel mode (driving, walking, bicycling, transit)
   * @returns {Promise<object>} Route information
   */
  async getDirections(origin, destination, mode = 'driving') {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          mode,
          key: this.googleMapsApiKey,
        },
        timeout: 15000,
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Directions API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: {
          text: leg.distance.text,
          value: leg.distance.value, // meters
        },
        duration: {
          text: leg.duration.text,
          value: leg.duration.value, // seconds
        },
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        polyline: route.overview_polyline.points,
        steps: leg.steps.map(step => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Remove HTML tags
          distance: step.distance,
          duration: step.duration,
          startLocation: step.start_location,
          endLocation: step.end_location,
        })),
      };
    } catch (error) {
      console.error('Get directions error:', error);
      throw new Error('Failed to get directions');
    }
  }

  /**
   * Get photo URL from photo reference
   * @param {string} photoReference - Google Places photo reference
   * @param {number} maxWidth - Maximum width (default: 400)
   * @returns {string} Photo URL
   */
  getPhotoUrl(photoReference, maxWidth = 400) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.googleMapsApiKey}`;
  }

  /**
   * Fetch a place photo and return the raw image payload
   * @param {string} photoReference - Google Places photo reference
   * @param {number} maxWidth - Maximum width for the request
   * @returns {Promise<{buffer: Buffer, length: number, contentType: string}>}
   */
  async fetchPlacePhoto(photoReference, maxWidth = 400) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
        params: {
          maxwidth: maxWidth,
          photo_reference: photoReference,
          key: this.googleMapsApiKey,
        },
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const lengthHeader = response.headers['content-length'];
      const length = typeof lengthHeader === 'string' ? parseInt(lengthHeader, 10) : buffer.length;

      return {
        buffer,
        length: Number.isFinite(length) ? length : buffer.length,
        contentType,
      };
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) {
        const notFound = new Error('Photo not found');
        notFound.status = 404;
        throw notFound;
      }

      console.error('Fetch place photo error:', error);
      throw new Error('Failed to fetch place photo');
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {number} lat1 - Latitude 1
   * @param {number} lon1 - Longitude 1
   * @param {number} lat2 - Latitude 2
   * @param {number} lon2 - Longitude 2
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   * @param {number} degrees - Degrees
   * @returns {number} Radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate coordinates
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {boolean} Is valid
   */
  isValidCoordinate(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /**
   * Places Autocomplete predictions
   * @param {string} input - user input
   * @param {number} [latitude]
   * @param {number} [longitude]
   * @param {number} [radius]
   * @returns {Promise<Array>} predictions
   */
  async autocomplete(input, latitude, longitude, radius = 20000) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const params = {
        input,
        key: this.googleMapsApiKey,
        types: 'geocode',
      };
      if (this.isValidCoordinate(latitude, longitude)) {
        params.location = `${latitude},${longitude}`;
        params.radius = radius;
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params,
        timeout: 8000,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Places Autocomplete error: ${response.data.status}`);
      }

      return response.data.predictions.map(p => ({
        id: p.place_id,
        placeId: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
        types: p.types,
      }));
    } catch (error) {
      console.error('Autocomplete service error:', error.message);
      if (error.response) {
        console.error('Autocomplete API response:', error.response.status, error.response.data);
      }
      throw new Error(`Failed to get autocomplete predictions: ${error.message}`);
    }
  }
}

module.exports = new MapsService();