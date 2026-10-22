import { describe, expect, test } from 'vitest';
import { formatDistance, formatDuration, formatSpeed } from '../format';

describe('format', () => {
  test('distance', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(999.6)).toBe('1000 m');
    expect(formatDistance(1500)).toBe('1.50 km');
    expect(formatDistance(1609.344, 'mi')).toBe('1.00 mi');
    expect(formatDistance(NaN)).toBe('0 m');
  });
  test('speed is converted once, from m/s', () => {
    expect(formatSpeed(10)).toBe('36 km/h');
    expect(formatSpeed(10, 'mi')).toBe('22 mph');
    expect(formatSpeed(-1)).toBe('0 km/h');
  });
  test('duration', () => {
    expect(formatDuration(75)).toBe('01:15');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('00:00');
  });
});
