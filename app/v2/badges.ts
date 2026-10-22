// app/v2/badges.ts
// Groups the server's flat badge progress into the families the badge cabinet shows
// ("Ton Up, tier II of III"), with the line that says how far the next tier is.

export interface BadgeProgress { id: string; type: string; value: number; threshold: number; pct: number; earned: boolean }

interface FamilyDef {
  id: string;
  name: string;
  blurb: string;
  icon: 'bolt' | 'moon' | 'route' | 'sun' | 'group' | 'hundred' | 'compass' | 'cal' | 'flag';
  tiers: string[]; // badge ids, lowest first
  unit: string; // how a threshold reads: "km/h", "km", "rides"...
}

export const FAMILIES: FamilyDef[] = [
  { id: 'ton_up', name: 'Ton Up', blurb: 'Hit a top speed of 100, 150, 200, then 250 km/h.', icon: 'bolt', tiers: ['speed_demon', 'velocity_master', 'apex_controller', 'wind_reaper'], unit: 'km/h' },
  { id: 'century', name: 'Century', blurb: 'Ride 100, 500, 1,000, 5,000, then 10,000 km in total.', icon: 'hundred', tiers: ['hundred_km', 'five_hundred_km', 'thousand_km', 'five_thousand_km', 'ten_thousand_km'], unit: 'km' },
  { id: 'regular', name: 'Regular', blurb: 'Complete 1, 10, 50, then 100 rides.', icon: 'route', tiers: ['first_journey', 'ten_journeys', 'fifty_journeys', 'hundred_journeys'], unit: 'rides' },
  { id: 'time_served', name: 'Time Served', blurb: 'Spend 1, 10, 50, then 100 hours on the road.', icon: 'cal', tiers: ['hour_rider', 'ten_hours', 'fifty_hours', 'hundred_hours'], unit: 'h' },
  { id: 'night_owl', name: 'Night Owl', blurb: 'Take a ride between 10 pm and 5 am.', icon: 'moon', tiers: ['night_rider'], unit: '' },
  { id: 'pack_rider', name: 'Pack Rider', blurb: 'Ride with a group once, then ten times.', icon: 'group', tiers: ['ace_of_friends', 'badge_hunter'], unit: 'group rides' },
  { id: 'road_captain', name: 'Road Captain', blurb: 'Lead a group ride all the way to the end.', icon: 'flag', tiers: ['road_captain'], unit: '' },
  { id: 'convoy', name: 'Convoy', blurb: 'Ride in a group of five or more.', icon: 'compass', tiers: ['convoy'], unit: '' },
];

export interface BadgeFamily {
  id: string;
  name: string;
  blurb: string;
  icon: FamilyDef['icon'];
  tiersEarned: number;
  tierCount: number;
  earned: boolean;
  /** One entry per tier, for the tier bars. */
  tiers: { id: string; label: string; threshold: number; pct: number; earned: boolean }[];
  /** Short line under the badge in the grid, e.g. "II · 138" or "3 / 5". */
  sub: string;
  /** The sentence under the featured badge ("Tier III is 2 km/h away."), or null when complete or one-off. */
  nextLine: string | null;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 10) / 10));

export function buildFamilies(progress: BadgeProgress[]): BadgeFamily[] {
  const byId = new Map(progress.map((p) => [p.id, p]));
  return FAMILIES.map((f) => {
    const tiers = f.tiers
      .map((id) => byId.get(id))
      .filter((p): p is BadgeProgress => !!p)
      .map((p, i) => ({ id: p.id, label: ROMAN[i], threshold: p.threshold, pct: p.pct, earned: p.earned, value: p.value }));
    const tiersEarned = tiers.filter((t) => t.earned).length;
    const next = tiers.find((t) => !t.earned);
    const current = tiers.length ? tiers[0].value : 0;
    const multi = tiers.length > 1;

    let sub: string;
    if (tiersEarned === 0) sub = multi || f.unit ? `${fmt(Math.min(current, next ? next.threshold : current))} / ${fmt(next ? next.threshold : 0)}` : 'Locked';
    else if (!multi) sub = 'Earned';
    else sub = `${ROMAN[tiersEarned - 1]} · ${fmt(current)}`;

    let nextLine: string | null = null;
    if (next && f.unit) {
      const remaining = Math.max(0, next.threshold - current);
      nextLine = `Your best is ${fmt(current)} ${f.unit}. Tier ${next.label} is ${fmt(remaining)} ${f.unit} away.`;
    }

    return {
      id: f.id,
      name: f.name,
      blurb: f.blurb,
      icon: f.icon,
      tiersEarned,
      tierCount: tiers.length,
      earned: tiersEarned > 0,
      tiers: tiers.map(({ id, label, threshold, pct, earned }) => ({ id, label, threshold, pct, earned })),
      sub,
      nextLine,
    };
  });
}

/** "Ton Up II" for a badge id, or null if the id is not in a family. */
export function badgeTitle(badgeId: string): { title: string; blurb: string } | null {
  for (const f of FAMILIES) {
    const i = f.tiers.indexOf(badgeId);
    if (i >= 0) return { title: f.tiers.length > 1 ? `${f.name} ${ROMAN[i]}` : f.name, blurb: f.blurb };
  }
  return null;
}

/** Shape the older screens (home, profile) expect: a list of achievements with tiers. */
export function asLegacyAchievements(families: BadgeFamily[]) {
  return families.map((f) => ({
    id: f.id,
    name: f.name,
    unlocked: f.earned,
    tiers: f.tiers.map((t, i) => ({ level: i + 1, name: `${f.name} ${t.label}`, unlocked: t.earned, target: t.threshold })),
  }));
}

export const ICON_PATHS: Record<FamilyDef['icon'], string> = {
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  sun: 'M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5',
  group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6',
  hundred: 'M4 8v8M8 8h3v8H8zM14 8h3v8h-3z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  cal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
};
