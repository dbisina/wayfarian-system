# Wayfarian v2: state and rollout

## What exists

**Server** (`server/`, branch `feat/v2-client`)
- `/api/v2`: rides (idempotent create, seq-deduped point batches, events, exactly-once finalize, delete with reversal, rename, route), `/me/summary`, leaderboards (week/month/year/all-time), group rides, `/config`.
- Stats are always computed on the server with `@wayfarian/ride-core`. Client totals are never trusted.
- Redis (optional) caches leaderboards; BullMQ jobs finalize abandoned rides and check for drift. Both are off unless configured: set `REDIS_URL` and `V2_JOBS=1`.
- Live group positions go over sockets (`sockets/groupRidePresence.js`) and are never stored.
- `V1_SUNSET=writes|all` retires v1 ride data (HTTP 426). Unset by default.
- `MIN_APP_VERSION` (env) is returned by `GET /api/v2/config`; builds below it show a blocking "Update required" screen.

**App** (`app/`)
- `app/v2/`: API client, SQLite outbox, sync engine, recorder (uses ride-core for live stats), single location pipeline (iOS and Android identical), session wipe on account change, presence, TanStack Query cache scoped per user.
- Screens: `ride`, `ride-detail`, `group-ride`, Log tab on v2, map "Start ride" goes to `ride`.
- `app.json`: version 2.0.0, iOS background location enabled, `expo-updates` added (runtime version = app version).

**Production database (Railway)**
- The three v2 migrations are applied.
- The backfill ran: 17 users, 198 rides (47 recomputed from GPS, 151 kept legacy totals). Totals match the dry-run report for every user, the drift check reports zero, and the v1 tables/columns were not changed.
- A full data export taken before the change is in `C:\Users\USER\wayfarian-backups\` (contains personal data, keep it private).

## Where the deploy stands (22 October)

- Both PRs are merged to `main`, but **the server is not deployed**: Railway has a platform incident with builds unavailable (status.railway.com). Neither the GitHub trigger nor `railway up` creates a deployment ("Paused temporarily"). The production server still runs the code from 18 October, so the 2.0.0 apps cannot reach `/api/v2` yet.
- Railway's incident notice recommends rotating database credentials (Postgres and Redis) and, after their credential reset, reconnecting GitHub in the service settings. That reconnection is probably why pushes to `main` no longer deploy. Those are yours to do in the Railway dashboard. Rotating changes the live connection string, so do it when you can redeploy straight after.
- When builds are back: reconnect GitHub if asked, then either re-run the last deploy or `railway up --service wayfarian-system` from a folder that contains `server/`. Check `GET /api/v2/config` on the production URL.
- Until then the TestFlight build installs and signs in, but v2 screens that call the server will show errors or empty states, and offline recording still works and queues for upload.
- The Android preview APK (2.0.0) is built: https://expo.dev/artifacts/eas/LvK4XZWqP1VbRBShHFNe5Z3FGwXBwx7ZkBJISWqiQQY.apk

## Deploy order

1. Merge the PR. Railway builds from GitHub `main` with root directory `/server` (Railpack, Node 18), so the server must be self-contained: it uses a committed build of ride-core in `server/vendor/ride-core`. After changing `packages/ride-core`, run `scripts/sync-ride-core.sh` and commit; CI fails if the copy is stale. v1 keeps working; v2 is additive. If a push to `main` does not start a deployment, deploy by hand from the repo root with `railway up --service wayfarian-system`. A failed build leaves the old version running.
2. Set `MIN_APP_VERSION=0.0.0` for now. Check `GET /api/v2/config`.
3. Optional: set `REDIS_URL` and `V2_JOBS=1` on the server so the stale-ride finalizer and nightly drift check run.
4. Build and submit the store apps (`eas build`, version 2.0.0). Test on a physical iPhone and Android first (checklist below).
5. When most users have updated: set `MIN_APP_VERSION=2.0.0`, then `V1_SUNSET=writes`, later `V1_SUNSET=all`, then delete the v1 routes.

## Forcing old apps to update (important)

Builds already in the stores **cannot receive an OTA update**: they were built without `expo-updates`. So the plan to push an "Update required" screen to old builds by OTA does not work for them. What works:
- New builds (2.0.0+) include `expo-updates`, so future forced changes can use OTA.
- For old builds the only lever is the server: `V1_SUNSET` makes their ride requests fail with HTTP 426 and a clear message, but the old app will show its generic error, not a custom screen. Plan the grace period and in-store release notes accordingly.
- Old users' stats are already corrected in v2 by the backfill; new rides after the update are measured by the new engine.

## Device test checklist (not yet done: needs real phones)

Run on one iPhone and one Android, ideally side by side:
- [ ] Record a 20-minute ride with the screen locked and the app in the background.
- [ ] Pause and resume; distance must not grow while paused.
- [ ] Airplane mode for 5 minutes, finish the ride offline, reconnect: the ride uploads and the server stats match the on-device stats within 2%.
- [ ] Kill the app mid-ride and reopen: the ride is recovered and continues.
- [ ] Sign out with an unuploaded ride (warned), sign in as another user: no data from the first account.
- [ ] Group ride with two phones: live positions show, each rider's stats are correct, ending the group finishes both rides.
- [ ] iOS asks for "Always" location; Android shows exactly one foreground notification.

## Known gaps

- The old v1 screens (journey, group-journey, journey-detail, etc.) and their contexts still exist and were not removed; only entry points were redirected to v2. Remove them once v2 is verified on devices.
- Rider profile, live-activity boards, XP banner and the speed chart from the design are not built.
- Group achievements are not implemented.
- The iOS store link in `V2Provider.tsx` now has the real App Store id; it ships with the next build.
