"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineM = haversineM;
exports.isValidCoordinate = isValidCoordinate;
const EARTH_RADIUS_M = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
/** Great-circle distance in metres. */
function haversineM(aLat, aLng, bLat, bLng) {
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}
function isValidCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
