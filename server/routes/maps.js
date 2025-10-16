// server/routes/maps.js

const express = require('express');
const { query, param, validationResult } = require('express-validator');
const mapsService = require('../services/MapsService');

const router = express.Router();

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
      
      const places = await mapsService.findNearbyPlaces(
        parseFloat(latitude),
        parseFloat(longitude),
        type,
        parseInt(radius)
      );

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
      console.error('Nearby places error:', error);
      res.status(500).json({
        error: 'Failed to find nearby places',
        message: error.message,
      });
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
      
      const placeDetails = await mapsService.getPlaceDetails(placeId);

      res.json({
        success: true,
        place: placeDetails,
      });
      
    } catch (error) {
      console.error('Place details error:', error);
      res.status(500).json({
        error: 'Failed to get place details',
        message: error.message,
      });
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
      
      const result = await mapsService.geocodeAddress(address);

      res.json({
        success: true,
        result,
        query: address,
      });
      
    } catch (error) {
      console.error('Geocode error:', error);
      res.status(500).json({
        error: 'Failed to geocode address',
        message: error.message,
      });
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
      
      const result = await mapsService.reverseGeocode(
        parseFloat(latitude),
        parseFloat(longitude)
      );

      res.json({
        success: true,
        result,
        coordinates: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      });
      
    } catch (error) {
      console.error('Reverse geocode error:', error);
      res.status(500).json({
        error: 'Failed to reverse geocode coordinates',
        message: error.message,
      });
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
      .isIn(['driving', 'walking', 'bicycling', 'transit'])
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
      
      const directions = await mapsService.getDirections(origin, destination, mode);

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
      console.error('Directions error:', error);
      res.status(500).json({
        error: 'Failed to get directions',
        message: error.message,
      });
    }
  }
);

/**
 * @route GET /api/maps/photo
 * @desc Get Google Places photo URL
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
      
      const photoUrl = mapsService.getPhotoUrl(reference, parseInt(maxwidth));

      res.json({
        success: true,
        photoUrl,
        reference,
        maxwidth: parseInt(maxwidth),
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
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { input, latitude, longitude, radius = 20000 } = req.query;
      const predictions = await mapsService.autocomplete(
        input,
        latitude ? parseFloat(latitude) : undefined,
        longitude ? parseFloat(longitude) : undefined,
        parseInt(radius)
      );
      res.json({ success: true, predictions });
    } catch (error) {
      console.error('Autocomplete error:', error);
      res.status(500).json({ error: 'Failed to get autocomplete predictions', message: error.message });
    }
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
      
      const places = await mapsService.findNearbyPlaces(
        parseFloat(latitude),
        parseFloat(longitude),
        type,
        parseInt(radius)
      );

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
      console.error('Nearby places error:', error);
      res.status(500).json({
        error: 'Failed to find nearby places',
        message: error.message,
      });
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
      const [gasStations, restaurants, lodging, atms, hospitals] = await Promise.all([
        mapsService.findNearbyPlaces(lat, lng, 'gas_station', 10000),
        mapsService.findNearbyPlaces(lat, lng, 'restaurant', 5000),
        mapsService.findNearbyPlaces(lat, lng, 'lodging', 15000),
        mapsService.findNearbyPlaces(lat, lng, 'atm', 3000),
        mapsService.findNearbyPlaces(lat, lng, 'hospital', 20000),
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