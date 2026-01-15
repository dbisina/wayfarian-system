// server/utils/__tests__/helpers.test.js
// Unit tests for distance calculation and validation helpers

const {
    calculateDistanceBetweenPoints,
    calculateDistance,
    calculateDistanceFiltered,
    isReasonableDistance,
    filterOutlierPoints,
    validateDistance,
    isValidCoordinate,
} = require('../helpers');

describe('Distance Helpers', () => {
    describe('calculateDistanceBetweenPoints', () => {
        it('returns 0 for same coordinates', () => {
            const dist = calculateDistanceBetweenPoints(51.5074, -0.1278, 51.5074, -0.1278);
            expect(dist).toBe(0);
        });

        it('calculates known distance correctly (London to Paris ~344km)', () => {
            const dist = calculateDistanceBetweenPoints(51.5074, -0.1278, 48.8566, 2.3522);
            expect(dist).toBeGreaterThan(340);
            expect(dist).toBeLessThan(350);
        });
    });

    describe('calculateDistance', () => {
        it('returns 0 for empty array', () => {
            expect(calculateDistance([])).toBe(0);
        });

        it('returns 0 for single point', () => {
            expect(calculateDistance([{ lat: 0, lng: 0 }])).toBe(0);
        });

        it('calculates total distance for route', () => {
            const route = [
                { lat: 0, lng: 0 },
                { lat: 0.01, lng: 0 },
                { lat: 0.02, lng: 0 },
            ];
            const dist = calculateDistance(route);
            expect(dist).toBeGreaterThan(2); // ~2.2km
            expect(dist).toBeLessThan(3);
        });
    });

    describe('isReasonableDistance', () => {
        it('returns true for 0 distance', () => {
            expect(isReasonableDistance(0, 100)).toBe(true);
        });

        it('returns false for negative distance', () => {
            expect(isReasonableDistance(-1, 100)).toBe(false);
        });

        it('returns true for reasonable speed', () => {
            // 100km in 1 hour = 100 km/h (reasonable)
            expect(isReasonableDistance(100, 3600)).toBe(true);
        });

        it('returns false for impossible speed', () => {
            // 100km in 5 minutes = 1200 km/h (impossible)
            expect(isReasonableDistance(100, 300)).toBe(false);
        });

        it('returns true for max reasonable speed', () => {
            // 250km in 1 hour = 250 km/h (at limit)
            expect(isReasonableDistance(250, 3600)).toBe(true);
        });
    });

    describe('filterOutlierPoints', () => {
        it('returns input for less than 2 points', () => {
            expect(filterOutlierPoints([{ lat: 0, lng: 0 }])).toEqual([{ lat: 0, lng: 0 }]);
        });

        it('filters GPS jitter (impossible speed)', () => {
            const points = [
                { lat: 0, lng: 0, timestamp: '2024-01-01T00:00:00Z' },
                { lat: 10, lng: 0, timestamp: '2024-01-01T00:00:01Z' }, // 10 degrees in 1 second = impossible
                { lat: 0.001, lng: 0, timestamp: '2024-01-01T00:00:05Z' },
            ];
            const filtered = filterOutlierPoints(points);
            expect(filtered.length).toBe(2); // First and third point kept
            expect(filtered[1].lat).toBe(0.001); // Jitter point removed
        });

        it('keeps valid movement points', () => {
            const points = [
                { lat: 0, lng: 0, timestamp: '2024-01-01T00:00:00Z' },
                { lat: 0.001, lng: 0, timestamp: '2024-01-01T00:01:00Z' }, // ~111m in 60s = 6.6 km/h
                { lat: 0.002, lng: 0, timestamp: '2024-01-01T00:02:00Z' },
            ];
            const filtered = filterOutlierPoints(points);
            expect(filtered.length).toBe(3);
        });
    });

    describe('validateDistance', () => {
        it('uses calculated distance when client distance is null', () => {
            const result = validateDistance(null, 10, 3600);
            expect(result.distance).toBe(10);
            expect(result.source).toBe('calculated');
        });

        it('uses client distance when valid', () => {
            const result = validateDistance(15, 10, 3600);
            expect(result.distance).toBe(15);
            expect(result.source).toBe('client');
        });

        it('caps unrealistic client distance', () => {
            // 500km in 1 hour = 500 km/h (capped to 250 km/h)
            const result = validateDistance(500, 10, 3600);
            expect(result.distance).toBe(250);
            expect(result.source).toBe('capped');
            expect(result.warning).toBeDefined();
        });
    });

    describe('isValidCoordinate', () => {
        it('returns true for valid coordinates', () => {
            expect(isValidCoordinate(51.5074, -0.1278)).toBe(true);
        });

        it('returns false for out of range latitude', () => {
            expect(isValidCoordinate(91, 0)).toBe(false);
            expect(isValidCoordinate(-91, 0)).toBe(false);
        });

        it('returns false for out of range longitude', () => {
            expect(isValidCoordinate(0, 181)).toBe(false);
            expect(isValidCoordinate(0, -181)).toBe(false);
        });

        it('returns false for non-number inputs', () => {
            expect(isValidCoordinate('abc', 0)).toBe(false);
            expect(isValidCoordinate(0, null)).toBe(false);
        });
    });
});
