// app/v2/session.ts
//
// Everything that is scoped to "who is signed in": which account owns the on-device data, and
// the wipe that guarantees the next account never sees the previous one's rides, queued uploads
// or cached screens. Pure orchestration over injected hooks, so it is unit-testable.

export interface SessionDeps {
  getOwner: () => Promise<string | null>;
  setOwner: (uid: string) => Promise<void>;
  /** Delete on-device rides, points and the outbox. */
  wipeLocal: () => Promise<void>;
  /** Drop every cached server response (TanStack Query cache + persisted copy). */
  clearQueryCache: () => Promise<void> | void;
  /** Stop timers, sockets and background location for the departing user. */
  stopLive: () => Promise<void> | void;
  /** Are there rides on this phone that have not been uploaded yet? */
  hasUnsyncedWork: () => Promise<boolean>;
}

export function createSession(deps: SessionDeps) {
  return {
    /**
     * Call when Firebase reports a signed-in user. If the device holds another user's data it is
     * wiped first. Returns whether a wipe happened.
     */
    async bind(uid: string): Promise<{ wiped: boolean }> {
      const owner = await deps.getOwner();
      let wiped = false;
      if (owner && owner !== uid) {
        await deps.stopLive();
        await deps.wipeLocal();
        await deps.clearQueryCache();
        wiped = true;
      }
      if (owner !== uid) await deps.setOwner(uid);
      return { wiped };
    },

    /**
     * Call on sign-out. Unsynced rides are NOT discarded silently: the caller gets `blocked` and
     * can warn the user. Pass force to wipe anyway (the user chose to).
     */
    async signOut(opts: { force?: boolean } = {}): Promise<{ blocked: boolean }> {
      if (!opts.force && (await deps.hasUnsyncedWork())) return { blocked: true };
      await deps.stopLive();
      await deps.wipeLocal();
      await deps.clearQueryCache();
      return { blocked: false };
    },
  };
}

export type Session = ReturnType<typeof createSession>;
