// server/routes/maps.js

const express = require('express');
const { query, param, validationResult } = require('express-validator');
const mapsService = require('../services/MapsService');
const { geoService } = require('../services/geo');
const { speedLimitService } = require('../services/geo/speedLimit');
const authMiddleware = require('../middleware/auth');
const { requireOperator } = require('../middleware/authorization');

const router = express.Router();

/**
 * Sends a geo failure without leaking which provider failed. NO_RESULTS is a normal empty answer;
 * anything else tells the app search is unavailable so it can offer a dropped pin instead.
 */
const sendGeoError = (res, error, label) => {
  if (error?.code === 'NO_RESULTS') {
    return res.status(404).json({ error: label, code: 'NO_RESULTS', message: 'Nothing found' });
  }
  console.error(`${label}:`, error?.code || '', error?.message || error);
  return res.status(503).json({ error: label, code: 'UNAVAILABLE', message: 'Map search is unavailable right now' });
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * @route GET /api/maps/nearby-places
 * @desc Find nearby places of interest
 * @access Private
 */
router.get(
  '/nearby-places',
  [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    query('type')
      .optional()
      .isIn([
        'gas_station', 'hospital', 'restaurant', 'lodging', 'atm',
        'bank', 'pharmacy', 'police', 'car_repair', 'tourist_attraction',
        'shopping_mall', 'supermarket', 'convenience_store'
      ])
      .withMessage('Invalid place type'),
    query('radius')
      .optional()
      .isInt({ min: 100, max: 50000 })
      .withMessage('Radius must be between 100 and 50000 meters'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { latitude, longitude, type = 'point_of_interest', radius = 5000 } = req.query;
      
      const places = await geoService.nearby({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        type,
        radius: parseInt(radius),
      });

      res.json({
        success: true,
        places,
        searchParams: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          type,
          radius: parseInt(radius),
        },
        count: places.length,
      });

    } catch (error) {
      sendGeoError(res, error, 'Failed to find nearby places');
    }
  }
);

/**
 * @route GET /api/maps/place-details/:placeId
 * @desc Get detailed information about a specific place
 * @access Private
 */
router.get(
  '/place-details/:placeId',
  [
    param('placeId')
      .notEmpty()
      .withMessage('Place ID is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { placeId } = req.params;
      const { sessionToken } = req.query;

      const placeDetails = await geoService.details({ placeId, sessionToken });

      res.json({
        success: true,
        place: placeDetails,
      });

    } catch (error) {
      sendGeoError(res, error, 'Failed to get place details');
    }
  }
);

/**
 * @route GET /api/maps/geocode
 * @desc Convert address to coordinates
 * @access Private
 */
router.get(
  '/geocode',
  [
    query('address')
      .notEmpty()
      .withMessage('Address is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { address } = req.query;
      
      const result = await geoService.geocode({ address });

      res.json({
        success: true,
        result,
        query: address,
      });

    } catch (error) {
      sendGeoError(res, error, 'Failed to geocode address');
    }
  }
);

/**
 * @route GET /api/maps/reverse-geocode
 * @desc Convert coordinates to address
 * @access Private
 */
router.get(
  '/reverse-geocode',
  [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { latitude, longitude } = req.query;
      
      const result = await geoService.reverseGeocode({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      });

      res.json({
        success: true,
        result,
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      });
      
    } catch (error) {
      sendGeoError(res, error, 'Failed to reverse geocode coordinates');
    }
  }
);

/**
 * @route GET /api/maps/directions
 * @desc Get directions between two points
 * @access Private
 */
router.get(
  '/directions',
  [
    query('origin_lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Origin latitude must be between -90 and 90'),
    query('origin_lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Origin longitude must be between -180 and 180'),
    query('dest_lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Destination latitude must be between -90 and 90'),
    query('dest_lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Destination longitude must be between -180 and 180'),
    query('mode')
      .optional()
      .isIn(['driving', 'motorcycle', 'walking', 'bicycling'])
      .withMessage('Invalid travel mode'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { origin_lat, origin_lng, dest_lat, dest_lng, mode = 'driving' } = req.query;
      
      const origin = {
        latitude: parseFloat(origin_lat),
        longitude: parseFloat(origin_lng),
      };
      
      const destination = {
        latitude: parseFloat(dest_lat),
        longitude: parseFloat(dest_lng),
      };
      
      const directions = await geoService.directions({ origin, destination, mode });

      res.json({
        success: true,
        directions,
        requestParams: {
          origin,
          destination,
          mode,
        },
      });
      
    } catch (error) {
      sendGeoError(res, error, 'Failed to get directions');
    }
  }
);

/**
 * @route GET /api/maps/photo
 * @desc Get proxied Google Places photo URL (no API key leakage)
 * @access Private
 */
router.get(
  '/photo',
  [
    query('reference')
      .notEmpty()
      .withMessage('Photo reference is required'),
    query('maxwidth')
      .optional()
      .isInt({ min: 50, max: 1600 })
      .withMessage('Max width must be between 50 and 1600'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reference, maxwidth = 400 } = req.query;
      const parsedWidth = parseInt(maxwidth);

      const baseOverride = process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '') : null;
      const origin = baseOverride || `${req.protocol}://${req.get('host')}`;
      const apiBase = origin.endsWith('/api') ? origin : `${origin}/api`;
      const proxyUrl = `${apiBase}/maps/photo/proxy?reference=${encodeURIComponent(reference)}&maxwidth=${parsedWidth}`;

      res.json({
        success: true,
        photoUrl: proxyUrl,
        reference,
        maxwidth: parsedWidth,
      });
      
    } catch (error) {
      console.error('Photo URL error:', error);
      res.status(500).json({
        error: 'Failed to get photo URL',
        message: error.message,
      });
    }
  }
);

/**
 * @route GET /api/maps/photo/proxy
 * @desc Stream Google Places photo through backend proxy
 * @access Private
 */
router.get(
  '/photo/proxy',
  [
    query('reference')
      .notEmpty()
      .withMessage('Photo reference is required'),
    query('maxwidth')
      .optional()
      .isInt({ min: 50, max: 1600 })
      .withMessage('Max width must be between 50 and 1600'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reference, maxwidth = 400 } = req.query;
      const parsedWidth = parseInt(maxwidth);

      const photo = await mapsService.fetchPlacePhoto(reference, parsedWidth);

      res.set({
        'Content-Type': photo.contentType,
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': `${photo.length}`,
      });

      return res.send(photo.buffer);
      
    } catch (error) {
      console.error('Photo proxy error:', error);
      const status = error.status === 404 || error.response?.status === 404 ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? 'Photo not found' : 'Failed to retrieve photo',
        message: error.message,
      });
    }
  }
);

/**
 * @route GET /api/maps/autocomplete
 * @desc Autocomplete place predictions for a given input
 * @access Private
 */
router.get(
  '/autocomplete',
  [
    query('input').notEmpty().withMessage('Input is required'),
    query('latitude').optional().isFloat({ min: -90, max: 90 }),
    query('longitude').optional().isFloat({ min: -180, max: 180 }),
    query('radius').optional().isInt({ min: 100, max: 50000 }),
    query('sessionToken').optional().isString().isLength({ max: 64 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { input, latitude, longitude, radius = 20000, sessionToken } = req.query;
      const predictions = await geoService.autocomplete({
        input,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        radius: parseInt(radius),
        sessionToken,
      });
      res.json({ success: true, predictions });
    } catch (error) {
      sendGeoError(res, error, 'Failed to get autocomplete predictions');
    }
  }
);

/**
 * @route GET /api/maps/_stats
 * @desc Provider credits used today, pauses and cache hit rate
 * @access Operator
 */
router.get('/_stats', authMiddleware, requireOperator, (req, res) => {
  res.json({ success: true, ...geoService.stats(), speedLimit: speedLimitService.stats() });
});

/**
 * @route GET /api/maps/speed-limit
 * @desc The posted speed limit at a spot in km/h, or null when OpenStreetMap has none for that road
 * @access Private
 */
router.get(
  '/speed-limit',
  [
    query('latitude').isFloat({ min: -90, max: 90 }),
    query('longitude').isFloat({ min: -180, max: 180 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { kmh } = await speedLimitService.lookup(parseFloat(req.query.latitude), parseFloat(req.query.longitude));
    res.json({ success: true, kmh });
  }
);

/**
 * @route GET /api/places/nearby
 * @desc Find nearby places (alias for /api/maps/nearby-places)
 * @access Private
 */
router.get(
  '/nearby',
  [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    query('type')
      .optional()
      .isIn([
        'gas_station', 'hospital', 'restaurant', 'lodging', 'atm',
        'bank', 'pharmacy', 'police', 'car_repair', 'tourist_attraction',
        'shopping_mall', 'supermarket', 'convenience_store'
      ])
      .withMessage('Invalid place type'),
    query('radius')
      .optional()
      .isInt({ min: 100, max: 50000 })
      .withMessage('Radius must be between 100 and 50000 meters'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { latitude, longitude, type = 'point_of_interest', radius = 5000 } = req.query;
      
      const places = await geoService.nearby({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        type,
        radius: parseInt(radius),
      });

      res.json({
        success: true,
        places,
        searchParams: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          type,
          radius: parseInt(radius),
        },
        count: places.length,
      });

    } catch (error) {
      sendGeoError(res, error, 'Failed to find nearby places');
    }
  }
);

/**
 * @route GET /api/maps/journey-suggestions
 * @desc Get suggested places for current journey
 * @access Private
 */
router.get(
  '/journey-suggestions',
  [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { latitude, longitude } = req.query;
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      // Get essential places for travelers
      // One empty or failed category shouldn't sink the others.
      const near = (type, radius) =>
        geoService.nearby({ latitude: lat, longitude: lng, type, radius }).catch(() => []);
      const [gasStations, restaurants, lodging, atms, hospitals] = await Promise.all([
        near('gas_station', 10000),
        near('restaurant', 5000),
        near('lodging', 15000),
        near('atm', 3000),
        near('hospital', 20000),
      ]);

      const suggestions = {
        fuel: gasStations.slice(0, 5),
        food: restaurants.slice(0, 8),
        accommodation: lodging.slice(0, 3),
        money: atms.slice(0, 3),
        emergency: hospitals.slice(0, 2),
      };

      res.json({
        success: true,
        suggestions,
        location: { latitude: lat, longitude: lng },
        totalCount: Object.values(suggestions).reduce((sum, arr) => sum + arr.length, 0),
      });
      
    } catch (error) {
      console.error('Journey suggestions error:', error);
      res.status(500).json({
        error: 'Failed to get journey suggestions',
        message: error.message,
      });
    }
  }
);

module.exports = router;