// Utility Functions
// server/utils/helpers.js

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
const calculateDistanceBetweenPoints = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} Radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate total distance from array of route points
 * @param {Array} routePoints - Array of {lat, lng} coordinates
 * @returns {number} Total distance in kilometers
 */
const calculateDistance = (routePoints) => {
  if (!routePoints || routePoints.length < 2) return 0;

  let totalDistance = 0;

  for (let i = 1; i < routePoints.length; i++) {
    const distance = calculateDistanceBetweenPoints(
      routePoints[i - 1].lat,
      routePoints[i - 1].lng,
      routePoints[i].lat,
      routePoints[i].lng
    );
    totalDistance += distance;
  }

  return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
};

/**
 * Calculate average speed
 * @param {number} distance - Distance in kilometers
 * @param {number} time - Time in seconds
 * @returns {number} Average speed in km/h
 */
const calculateAverageSpeed = (distance, time) => {
  if (time <= 0) return 0;
  const hours = time / 3600;
  const avgSpeed = Math.round((distance / hours) * 100) / 100;
  // Cap at 250 km/h to prevent unrealistic values if time is incorrectly small
  return Math.min(avgSpeed, 250);
};

/**
 * Format duration from seconds to human readable format
 * @param {number} seconds
 * @returns {string} Formatted duration
 */
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
};

/**
 * Generate random string for group codes
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
const generateRandomString = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Validate coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} Is valid
 */
const isValidCoordinate = (lat, lng) => {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

/**
 * Validate if a distance is reasonable given time elapsed
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} timeSeconds - Time elapsed in seconds
 * @param {number} maxSpeedKmh - Maximum reasonable speed (default 250 km/h)
 * @returns {boolean} True if distance is reasonable
 */
const isReasonableDistance = (distanceKm, timeSeconds, maxSpeedKmh = 250) => {
  if (distanceKm < 0) return false;
  if (distanceKm === 0) return true;
  if (timeSeconds <= 0) return false;

  const hours = timeSeconds / 3600;
  const impliedSpeed = distanceKm / hours;

  return impliedSpeed <= maxSpeedKmh;
};

/**
 * Filter outlier points from GPS route based on impossible speed
 * @param {Array} routePoints - Array of {lat, lng, timestamp} coordinates
 * @param {number} maxSpeedKmh - Maximum reasonable speed (default 250 km/h)
 * @returns {Array} Filtered route points with outliers removed
 */
const filterOutlierPoints = (routePoints, maxSpeedKmh = 250) => {
  if (!routePoints || routePoints.length < 2) return routePoints || [];

  const filtered = [routePoints[0]]; // Always keep first point

  for (let i = 1; i < routePoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = routePoints[i];

    // Get coordinates
    const prevLat = prev.lat ?? prev.latitude;
    const prevLng = prev.lng ?? prev.longitude ?? prev.lon;
    const currLat = curr.lat ?? curr.latitude;
    const currLng = curr.lng ?? curr.longitude ?? curr.lon;

    if (!isValidCoordinate(prevLat, prevLng) || !isValidCoordinate(currLat, currLng)) {
      continue; // Skip invalid coordinates
    }

    // Calculate distance
    const distance = calculateDistanceBetweenPoints(prevLat, prevLng, currLat, currLng);

    // Calculate time difference
    const prevTime = prev.timestamp ? new Date(prev.timestamp).getTime() : null;
    const currTime = curr.timestamp ? new Date(curr.timestamp).getTime() : null;

    if (prevTime && currTime && currTime > prevTime) {
      const timeDiffHours = (currTime - prevTime) / (1000 * 3600);
      const impliedSpeed = timeDiffHours > 0 ? distance / timeDiffHours : 0;

      // Skip if impossible speed (GPS jitter)
      if (impliedSpeed > maxSpeedKmh) {
        console.warn(`[GPS] Filtered outlier: implied ${impliedSpeed.toFixed(1)} km/h from ${distance.toFixed(3)} km in ${(timeDiffHours * 3600).toFixed(1)}s`);
        continue;
      }
    }

    filtered.push(curr);
  }

  return filtered;
};

/**
 * Calculate distance with outlier filtering
 * Improved version that skips GPS jitter points
 * @param {Array} routePoints - Array of {lat, lng} or {latitude, longitude} coordinates
 * @param {Object} options - Options for calculation
 * @param {boolean} options.filterOutliers - Whether to filter outliers (default true)
 * @param {number} options.maxSpeedKmh - Max speed for outlier detection (default 250)
 * @returns {number} Total distance in kilometers
 */
const calculateDistanceFiltered = (routePoints, options = {}) => {
  const { filterOutliers = true, maxSpeedKmh = 250 } = options;

  if (!routePoints || routePoints.length < 2) return 0;

  const points = filterOutliers ? filterOutlierPoints(routePoints, maxSpeedKmh) : routePoints;

  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const prevLat = prev.lat ?? prev.latitude;
    const prevLng = prev.lng ?? prev.longitude ?? prev.lon;
    const currLat = curr.lat ?? curr.latitude;
    const currLng = curr.lng ?? curr.longitude ?? curr.lon;

    if (!isValidCoordinate(prevLat, prevLng) || !isValidCoordinate(currLat, currLng)) {
      continue;
    }

    const distance = calculateDistanceBetweenPoints(prevLat, prevLng, currLat, currLng);
    totalDistance += distance;
  }

  return Math.round(totalDistance * 100) / 100;
};

/**
 * Validate and cap a distance value
 * Returns the validated distance or the calculated fallback
 * @param {number} clientDistance - Client-provided distance in km
 * @param {number} calculatedDistance - Server-calculated distance in km  
 * @param {number} timeSeconds - Time elapsed in seconds
 * @param {number} tolerance - Acceptable difference ratio (default 0.5 = 50%)
 * @returns {Object} { distance: number, source: 'client'|'calculated'|'capped', warning?: string }
 */
const validateDistance = (clientDistance, calculatedDistance, timeSeconds, tolerance = 0.5) => {
  // If client distance is missing, use calculated
  if (clientDistance === undefined || clientDistance === null || isNaN(clientDistance)) {
    return { distance: calculatedDistance, source: 'calculated' };
  }

  // Check if client distance is reasonable for time elapsed
  if (!isReasonableDistance(clientDistance, timeSeconds)) {
    const maxDistance = (timeSeconds / 3600) * 250; // Max at 250 km/h
    return {
      distance: Math.min(clientDistance, maxDistance),
      source: 'capped',
      warning: `Client distance ${clientDistance.toFixed(2)}km capped to ${maxDistance.toFixed(2)}km based on time`
    };
  }

  // Check if client distance significantly differs from calculated
  if (calculatedDistance > 0) {
    const diff = Math.abs(clientDistance - calculatedDistance) / calculatedDistance;
    if (diff > tolerance) {
      console.warn(`[Distance] Client (${clientDistance.toFixed(2)}km) differs from calculated (${calculatedDistance.toFixed(2)}km) by ${(diff * 100).toFixed(0)}%`);
    }
  }

  return { distance: clientDistance, source: 'client' };
};

module.exports = {
  calculateDistanceBetweenPoints,
  calculateDistance,
  calculateDistanceFiltered,
  calculateAverageSpeed,
  formatDuration,
  generateRandomString,
  isValidCoordinate,
  isReasonableDistance,
  filterOutlierPoints,
  validateDistance,
  toRadians,
};

