// app/v2/version.ts
// Minimum-version gate. The server says which app versions it still supports (GET /v2/config).

/** Compare dotted versions numerically: "1.10.0" > "1.9.2". Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export const isUpdateRequired = (current: string, minAppVersion: string | undefined | null): boolean =>
  !!minAppVersion && compareVersions(current, minAppVersion) < 0;
