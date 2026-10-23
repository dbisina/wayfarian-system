// app/v2/api.ts
//
// Thin client for the /api/v2 server. Knows the response envelope, refreshes an expired token
// once, and classifies every failure as retryable (network, 5xx, 408/425/429) or permanent, so
// the sync engine can decide whether to try again or park the item.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  /** The server rejected our credentials even after a refresh. Sync stops until the user is signed in again. */
  readonly authRequired: boolean;

  constructor(status: number, code: string, message: string, opts: { retryable?: boolean; authRequired?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = opts.retryable ?? (status === 0 || status >= 500 || status === 408 || status === 425 || status === 429);
    this.authRequired = opts.authRequired ?? false;
  }
}

export interface V2ClientDeps {
  baseUrl: string; // e.g. https://api.example.com/api/v2
  getToken: () => Promise<string | null>;
  /** Force-refresh the token. Return null when the user is signed out. */
  refreshToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface WirePoint { seq: number; segment: number; lat: number; lng: number; t: string; accuracy?: number | null }
export interface WireEvent { id: string; type: 'START' | 'PAUSE' | 'RESUME' | 'END'; at: string }

export function createV2Client(deps: V2ClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 20000;

  async function once(method: string, path: string, body: unknown, token: string | null, isForm = false): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await doFetch(`${deps.baseUrl}${path}`, {
        method,
        headers: {
          // A multipart body must not set its own Content-Type: fetch adds the boundary.
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : isForm ? (body as never) : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new ApiError(0, 'network', (err as Error)?.message || 'Network request failed', { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; form?: boolean } = {}): Promise<T> {
    const needsAuth = opts.auth !== false;
    const isForm = opts.form === true;
    let token = needsAuth ? await deps.getToken() : null;
    let res = await once(method, path, body, token, isForm);

    if (res.status === 401 && needsAuth) {
      token = await deps.refreshToken();
      if (!token) throw new ApiError(401, 'unauthenticated', 'Signed out', { retryable: false, authRequired: true });
      res = await once(method, path, body, token, isForm);
      if (res.status === 401) throw new ApiError(401, 'unauthenticated', 'Session rejected', { retryable: false, authRequired: true });
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body (proxy error page) */
    }
    if (res.ok && json && json.ok === true) return json.data as T;
    if (res.ok) throw new ApiError(res.status, 'bad_response', 'Unexpected response from server', { retryable: true });
    // A 404/405 that does not use our { ok:false } envelope did not come from the v2 API at all: the
    // server simply has not been upgraded yet (or a proxy answered). That is temporary, so it must
    // be retried later, never parked as a permanent failure.
    const fromV2 = !!json && json.ok === false;
    const serverLacksV2 = !fromV2 && (res.status === 404 || res.status === 405);
    throw new ApiError(res.status, json?.error?.code || (serverLacksV2 ? 'server_unavailable' : 'http_error'), json?.error?.message || `HTTP ${res.status}`, {
      retryable: serverLacksV2 ? true : undefined,
    });
  }

  const enc = encodeURIComponent;
  // Query string without the undefined/null values (they would be sent as the text "undefined").
  const qs = (q: Record<string, unknown>) =>
    new URLSearchParams(Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
  return {
    request,
    config: () => request<{ minAppVersion: string; serverTime: string }>('GET', '/config', undefined, { auth: false }),
    upsertRide: (id: string, input: { startedAt: string; vehicleId?: string; title?: string; timezone?: string }) => request('PUT', `/rides/${enc(id)}`, input),
    addPoints: (id: string, points: WirePoint[]) => request<{ accepted: number; duplicates: number }>('POST', `/rides/${enc(id)}/points`, { points }),
    addEvents: (id: string, events: WireEvent[]) => request('POST', `/rides/${enc(id)}/events`, { events }),
    finalizeRide: (id: string) => request<any>('POST', `/rides/${enc(id)}/finalize`),
    renameRide: (id: string, title: string) => request<any>('PATCH', `/rides/${enc(id)}`, { title }),
    rideRoute: (id: string, maxPoints = 1500) => request<{ total: number; points: { segment: number; lat: number; lng: number; t: number }[] }>('GET', `/rides/${enc(id)}/route?maxPoints=${maxPoints}`),
    uploadPhoto: (rideId: string, photoId: string, p: { uri: string; takenAt?: string; latitude?: number | null; longitude?: number | null }) => {
      const form = new FormData();
      // React Native's FormData reads the file from the uri; the object shape is its convention.
      form.append('file', { uri: p.uri, name: `${photoId}.jpg`, type: 'image/jpeg' } as never);
      if (p.takenAt) form.append('takenAt', p.takenAt);
      if (p.latitude != null) form.append('latitude', String(p.latitude));
      if (p.longitude != null) form.append('longitude', String(p.longitude));
      return request<any>('PUT', `/rides/${enc(rideId)}/photos/${enc(photoId)}`, form, { form: true });
    },
    ridePhotos: (rideId: string) => request<{ items: { id: string; takenAt: string; imageUrl: string; thumbnailUrl: string }[] }>('GET', `/rides/${enc(rideId)}/photos`),
    deleteRide: (id: string) => request('DELETE', `/rides/${enc(id)}`),
    getRide: (id: string) => request<any>('GET', `/rides/${enc(id)}`),
    listRides: (cursor?: string, limit = 20) => request<{ items: any[]; nextCursor: string | null }>('GET', `/rides?limit=${limit}${cursor ? `&cursor=${enc(cursor)}` : ''}`),
    summary: () => request<any>('GET', '/me/summary'),
    rider: (id: string) => request<any>('GET', `/riders/${enc(id)}`),
    vehicle: (id: string) => request<any>('GET', `/vehicles/${enc(id)}`),
    logService: (vehicleId: string, serviceId: string, input: { kind?: string; intervalKm?: number; doneAt?: string; notes?: string } = {}) =>
      request<any>('PUT', `/vehicles/${enc(vehicleId)}/services/${enc(serviceId)}`, input),
    leaderboard: (q: { metric?: string; period?: string; limit?: number; scope?: string } = {}) => request<any>('GET', `/leaderboard?${qs(q)}`),
    leaderboardMe: (q: { metric?: string; period?: string } = {}) => request<any>('GET', `/leaderboard/me?${qs(q)}`),
    // group rides
    createGroupRide: (id: string, input: Record<string, unknown>) => request<any>('PUT', `/group-rides/${enc(id)}`, input),
    joinGroupRide: (code: string) => request<any>('POST', '/group-rides/join', { code }),
    groupRides: (cursor?: string) => request<{ items: any[]; nextCursor: string | null }>('GET', `/group-rides${cursor ? `?cursor=${enc(cursor)}` : ''}`),
    groupRide: (id: string) => request<any>('GET', `/group-rides/${enc(id)}`),
    groupRideSummary: (id: string) => request<any>('GET', `/group-rides/${enc(id)}/summary`),
    leaveGroupRide: (id: string) => request<any>('POST', `/group-rides/${enc(id)}/leave`),
    startGroupRide: (id: string) => request<any>('POST', `/group-rides/${enc(id)}/start`),
    endGroupRide: (id: string) => request<any>('POST', `/group-rides/${enc(id)}/end`),
    // crews (persistent groups): their rides, weekly quest and activity feed
    crewState: (crewId: string) => request<any>('GET', `/crews/${enc(crewId)}`),
    crewActivity: (crewId: string) => request<{ items: any[] }>('GET', `/crews/${enc(crewId)}/activity`),
    postCrewMessage: (crewId: string, text: string) => request<any>('POST', `/crews/${enc(crewId)}/messages`, { text }),
    startCrewRide: (crewId: string, input: Record<string, unknown>) => request<any>('POST', `/crews/${enc(crewId)}/rides`, input),
    joinCrewRide: (crewId: string) => request<any>('POST', `/crews/${enc(crewId)}/rides/join`),
    endCrewRide: (crewId: string) => request<any>('POST', `/crews/${enc(crewId)}/rides/end`),
    startGroupMemberRide: (groupId: string, rideId: string, input: Record<string, unknown>) =>
      request<any>('PUT', `/group-rides/${enc(groupId)}/rides/${enc(rideId)}`, input),
  };
}

export type V2Client = ReturnType<typeof createV2Client>;
