import { describe, expect, test } from 'vitest';
import { asLegacyAchievements, badgeTitle, buildFamilies, type BadgeProgress } from '../badges';
import { speedStrip, type RoutePoint } from '../speed';
import { orderRiders, type BoardRider } from '../liveBoard';

const bp = (id: string, value: number, threshold: number, earned = value >= threshold): BadgeProgress => ({
  id, type: 'x', value, threshold, earned, pct: earned ? 100 : Math.floor((value / threshold) * 100),
});

describe('badge families', () => {
  const progress = [
    bp('speed_demon', 138 * 1, 100), bp('velocity_master', 138, 150), bp('apex_controller', 138, 200), bp('wind_reaper', 138, 250),
    bp('hundred_km', 40, 100), bp('night_rider', 0, 1), bp('road_captain', 1, 1),
  ];
  const fam = (id: string) => buildFamilies(progress).find((f) => f.id === id)!;

  test('counts earned tiers and says how far the next one is', () => {
    const ton = fam('ton_up');
    expect(ton.tiersEarned).toBe(1);
    expect(ton.tierCount).toBe(4);
    expect(ton.sub).toBe('I · 138');
    expect(ton.nextLine).toBe('Your best is 138 km/h. Tier II is 12 km/h away.');
    expect(ton.tiers.map((t) => t.label)).toEqual(['I', 'II', 'III', 'IV']);
  });

  test('a family with nothing earned shows progress toward the first tier', () => {
    const c = fam('century');
    expect(c.earned).toBe(false);
    expect(c.sub).toBe('40 / 100');
  });

  test('one-off badges are just earned or locked', () => {
    expect(fam('road_captain')).toMatchObject({ earned: true, sub: 'Earned', nextLine: null });
    expect(fam('night_owl')).toMatchObject({ earned: false, sub: 'Locked' });
  });

  test('older screens can still read the list', () => {
    const legacy = asLegacyAchievements(buildFamilies(progress));
    const ton = legacy.find((a) => a.id === 'ton_up')!;
    expect(ton.unlocked).toBe(true);
    expect(ton.tiers.filter((t) => t.unlocked)).toHaveLength(1);
  });
});

describe('badge titles', () => {
  test('names the tier for multi-tier badges and just the name for one-offs', () => {
    expect(badgeTitle('apex_controller')!.title).toBe('Ton Up III');
    expect(badgeTitle('hundred_km')!.title).toBe('Century I');
    expect(badgeTitle('road_captain')!.title).toBe('Road Captain');
    expect(badgeTitle('nope')).toBeNull();
  });
});

describe('speed strip', () => {
  const lng = (m: number) => 3.4 + m / (111320 * Math.cos((6.45 * Math.PI) / 180));
  const route = (speeds: number[]): RoutePoint[] => {
    let m = 0;
    const pts: RoutePoint[] = [{ segment: 0, lat: 6.45, lng: lng(0), t: 0 }];
    speeds.forEach((s, i) => { m += s * 10; pts.push({ segment: 0, lat: 6.45, lng: lng(m), t: (i + 1) * 10000 }); });
    return pts;
  };

  test('bars follow the speed and the fastest ones are hot', () => {
    const s = speedStrip(route([5, 10, 20, 38, 20, 10]), 6);
    expect(s.bars).toHaveLength(6);
    expect(s.peakMps).toBeCloseTo(38, 0);
    expect(s.bars[3].frac).toBeCloseTo(1, 5);
    expect(s.bars[3].hot).toBe(true);
    expect(s.bars[0].hot).toBe(false);
  });

  test('never makes more bars than samples, and a pause is not speed', () => {
    const a = route([10, 10, 10]);
    const withGap = [...a, { segment: 1, lat: 6.45, lng: lng(50000), t: 9_000_000 }, { segment: 1, lat: 6.45, lng: lng(50100), t: 9_010_000 }];
    const s = speedStrip(withGap, 40);
    expect(s.bars.length).toBe(4);
    expect(s.peakMps).toBeLessThan(11);
  });

  test('a lone GPS jump above the speed ceiling is dropped; empty input is empty', () => {
    const pts = route([10, 10]);
    pts.push({ segment: 0, lat: 6.45, lng: lng(1e6), t: 30000 });
    expect(speedStrip(pts).peakMps).toBeLessThan(11);
    expect(speedStrip([])).toEqual({ bars: [], peakMps: 0, peakAt: null });
  });
});

describe('live board', () => {
  const NOW = 10_000_000;
  const rider = (userId: string, distanceM: number, speedMps: number, extra: Partial<BoardRider> = {}): BoardRider => ({
    userId, name: userId, distanceM, speedMps, lastMovedAt: NOW, ...extra,
  });

  test('orders by distance and words the gaps from your point of view', () => {
    const rows = orderRiders([
      rider('me', 41600, 20, { isSelf: true }),
      rider('tobi', 43700, 25),
      rider('aisha', 41200, 22),
      rider('twin', 41620, 22),
    ], NOW);
    expect(rows.map((r) => r.userId)).toEqual(['tobi', 'twin', 'me', 'aisha']);
    expect(rows.find((r) => r.userId === 'tobi')!.status).toBe('2.1 km ahead');
    expect(rows.find((r) => r.userId === 'aisha')!.status).toBe('0.4 km back');
    expect(rows.find((r) => r.userId === 'twin')!.status).toBe('Alongside');
    expect(rows.find((r) => r.userId === 'me')!.status).toBe('72 km/h');
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  test('a rider who stopped more than two minutes ago is flagged', () => {
    const rows = orderRiders([rider('me', 1000, 10, { isSelf: true }), rider('chidi', 900, 0, { lastMovedAt: NOW - 3 * 60000 }), rider('brief', 800, 0, { lastMovedAt: NOW - 30000 })], NOW);
    expect(rows.find((r) => r.userId === 'chidi')).toMatchObject({ stopped: true, status: 'Stopped 3 min' });
    expect(rows.find((r) => r.userId === 'brief')!.stopped).toBe(false);
  });

  test('riders with no distance yet go last', () => {
    const rows = orderRiders([rider('new', NaN as any, 5, { distanceM: null }), rider('a', 10, 5)], NOW);
    expect(rows.map((r) => r.userId)).toEqual(['a', 'new']);
  });
});
