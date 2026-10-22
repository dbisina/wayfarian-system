// app/v2/liveBoard.ts
// The "order on the road" list of a live group ride: who is ahead, by how much, and who has
// stopped. Ahead/behind is by distance ridden, which is the one thing every rider can measure
// the same way without knowing the route.

export interface BoardRider {
  userId: string;
  name: string;
  distanceM: number | null;
  speedMps: number | null;
  /** Last time this rider was seen moving, epoch ms. */
  lastMovedAt: number;
  isSelf?: boolean;
}

export interface BoardRow {
  userId: string;
  name: string;
  position: number;
  isSelf: boolean;
  status: string;
  stopped: boolean;
}

const STOPPED_AFTER_MS = 2 * 60 * 1000;

const km = (m: number) => `${(Math.abs(m) / 1000).toFixed(1)} km`;

export function orderRiders(riders: BoardRider[], now: number): BoardRow[] {
  const me = riders.find((r) => r.isSelf);
  const sorted = [...riders].sort((a, b) => (b.distanceM ?? -1) - (a.distanceM ?? -1) || a.userId.localeCompare(b.userId));
  return sorted.map((r, i) => {
    const stoppedFor = now - r.lastMovedAt;
    const stopped = r.speedMps != null && r.speedMps < 1 && stoppedFor >= STOPPED_AFTER_MS;
    let status: string;
    if (stopped) status = `Stopped ${Math.max(1, Math.round(stoppedFor / 60000))} min`;
    else if (r.isSelf) status = r.speedMps != null ? `${Math.round(r.speedMps * 3.6)} km/h` : 'You';
    else if (me && me.distanceM != null && r.distanceM != null) {
      const gap = r.distanceM - me.distanceM;
      status = Math.abs(gap) < 50 ? 'Alongside' : gap > 0 ? `${km(gap)} ahead` : `${km(gap)} back`;
    } else status = r.speedMps != null ? `${Math.round(r.speedMps * 3.6)} km/h` : '—';
    return { userId: r.userId, name: r.name, position: i + 1, isSelf: !!r.isSelf, status, stopped };
  });
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
