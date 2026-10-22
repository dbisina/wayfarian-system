import { describe, expect, test } from 'vitest';
import { createSession } from '../session';
import { compareVersions, isUpdateRequired } from '../version';

function make(initialOwner: string | null, unsynced = false) {
  const state = { owner: initialOwner, wiped: 0, cacheCleared: 0, stopped: 0 };
  const session = createSession({
    getOwner: async () => state.owner,
    setOwner: async (u) => { state.owner = u; },
    wipeLocal: async () => { state.wiped++; },
    clearQueryCache: async () => { state.cacheCleared++; },
    stopLive: async () => { state.stopped++; },
    hasUnsyncedWork: async () => unsynced,
  });
  return { state, session };
}

describe('session', () => {
  test('first sign-in just claims the device', async () => {
    const { state, session } = make(null);
    expect(await session.bind('u1')).toEqual({ wiped: false });
    expect(state).toMatchObject({ owner: 'u1', wiped: 0 });
  });

  test('same user signing in again keeps their data', async () => {
    const { state, session } = make('u1');
    expect((await session.bind('u1')).wiped).toBe(false);
    expect(state.wiped).toBe(0);
  });

  test('a different user never sees the previous user data', async () => {
    const { state, session } = make('u1');
    expect((await session.bind('u2')).wiped).toBe(true);
    expect(state).toMatchObject({ owner: 'u2', wiped: 1, cacheCleared: 1, stopped: 1 });
  });

  test('sign-out wipes, but refuses to silently drop unuploaded rides', async () => {
    const blocked = make('u1', true);
    expect(await blocked.session.signOut()).toEqual({ blocked: true });
    expect(blocked.state.wiped).toBe(0);
    expect(await blocked.session.signOut({ force: true })).toEqual({ blocked: false });
    expect(blocked.state.wiped).toBe(1);

    const clean = make('u1', false);
    expect(await clean.session.signOut()).toEqual({ blocked: false });
    expect(clean.state).toMatchObject({ wiped: 1, cacheCleared: 1, stopped: 1 });
  });
});

describe('version gate', () => {
  test('compares numerically', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBe(1);
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });
  test('update required only below the minimum', () => {
    expect(isUpdateRequired('1.1.1', '2.0.0')).toBe(true);
    expect(isUpdateRequired('2.0.0', '2.0.0')).toBe(false);
    expect(isUpdateRequired('1.1.1', undefined)).toBe(false);
    expect(isUpdateRequired('1.1.1', '0.0.0')).toBe(false);
  });
});
