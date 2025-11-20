# Verification Plan

This document tracks the current automated coverage plus the manual scenarios we need to run before shipping group journey changes.

## 1. Automated Tests

| Area | Status | Notes |
| --- | --- | --- |
| `JourneyInstanceService` helpers | ✅ Added (`server/services/__tests__/JourneyInstanceService.test.js`) | Mocks Prisma to ensure `user` relation is always selected and snapshot payload stays stable for sockets. |
| Group journey REST endpoints | ⏳ TODO | Add Supertest suite covering `startGroupJourney`, `startMyInstance`, `getMyInstance`, and `completeInstance` to prevent double-response regressions. |
| Socket snapshot/state flow | ⏳ TODO | Use `socket.io-client` in tests to emit `group-journey:join` and `instance:location-update`, asserting that `buildMemberSnapshot` output is broadcast once and cached. |
| Map region controller | ⏳ TODO | Add component-level test (with `@testing-library/react-native`) to ensure the derived `targetRegion` respects manual directions, origin/destination, and location fallbacks. |

### Next steps for automation
1. Stand up a Jest environment with an in-memory Postgres (or Prisma SQLite URL) for controller tests.
2. Stub Redis via `jest.mock('../services/RedisService')` so caching branches are deterministic.
3. Leverage the new JourneyInstance helpers everywhere to reduce duplication inside tests.

## 2. Manual Regression Scenarios

| Scenario | Steps | Expected Result |
| --- | --- | --- |
| Start and join group journey | (a) `npm run dev` in `server/` (with `DATABASE_URL` set), (b) use Expo client to create a group, (c) start a journey, (d) second device joins. | Journey appears once in DB, socket join event succeeds, no Prisma errors in logs. |
| Map zoom stability | Join an active journey, pan/zoom the map, then trigger: GPS update, manual route fetch (iOS), and start-location fallback (toggle permissions). | Map transitions smoothly to a single region without bouncing back to SF or oscillating zoom. |
| Socket location propagation | With two devices, update location on one every ~5 seconds. | `member:location-updated` events arrive in <1s, distances/time accumulate once per tick, server logs remain clean. |
| Journey photo upload | Capture a photo via `JourneyCamera` in the group screen. | Upload completes <10s, ride event appears, gallery thumbnail matches group cover upload speed. |
| Instance completion | Send `/api/group-journey/instance/:id/complete` twice (once valid, once after completion). | First call sets status to `COMPLETED`, second returns 409 or no-op without `ERR_HTTP_HEADERS_SENT`. |

## 3. Logging & Monitoring Checklist

- Tail `server/logs/error.log` during manual runs, watching for `PrismaClientValidationError`, `ERR_HTTP_HEADERS_SENT`, and socket disconnect errors.
- Enable `DEBUG=socket.io:*` locally when validating the snapshot broadcasters.
- Confirm Redis cache keys `group:<id>:active-journey` and `group-journey:<id>:full` are invalidated after completion via `RedisService.inspect()`.

## 4. Sign-off

Before handing off the feature set:
1. Run `cd server && npm run test` (ensuring the new service tests pass) plus any future suites from section 1.
2. Execute every manual scenario in section 2 using both iOS and Android clients (or simulators).
3. Attach the logs/output from the runs to the release ticket for traceability.

> This plan should be updated as we add new automated suites or discover additional high-risk flows (e.g., stuck journeys cleanup jobs, media upload retries).
