import { describe, expect, test } from 'vitest';
import { projectRoute } from '../route';

describe('projectRoute', () => {
  test('fits points inside the box and keeps the aspect ratio', () => {
    const lines = projectRoute([
      { segment: 0, lat: 6.45, lng: 3.4 },
      { segment: 0, lat: 6.45, lng: 3.41 },
      { segment: 0, lat: 6.46, lng: 3.41 },
    ]);
    expect(lines).toHaveLength(1);
    const pts = lines[0].split(' ').map((p) => p.split(',').map(Number));
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(320); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(320); }
    expect(pts[0][1]).toBeGreaterThan(pts[2][1]); // north is up
  });
  test('segments become separate lines and single-point segments are dropped', () => {
    const lines = projectRoute([
      { segment: 0, lat: 1, lng: 1 }, { segment: 0, lat: 1.001, lng: 1 },
      { segment: 1, lat: 1.002, lng: 1 }, { segment: 1, lat: 1.003, lng: 1 },
      { segment: 2, lat: 1.004, lng: 1 },
    ]);
    expect(lines).toHaveLength(2);
  });
  test('too few points draw nothing', () => {
    expect(projectRoute([])).toEqual([]);
    expect(projectRoute([{ segment: 0, lat: 1, lng: 1 }])).toEqual([]);
  });
});
