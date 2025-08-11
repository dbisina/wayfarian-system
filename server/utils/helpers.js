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
    return Math.round((distance / hours) * 100) / 100;
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
  
  module.exports = {
    calculateDistanceBetweenPoints,
    calculateDistance,
    calculateAverageSpeed,
    formatDuration,
    generateRandomString,
    isValidCoordinate,
    toRadians,
  };
  
  