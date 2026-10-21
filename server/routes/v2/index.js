// server/routes/v2/index.js
// v2 API. Independent of the v1 routes. Envelope: { ok: true, data } or { ok: false, error: { code, message } }.

const express = require('express');
const { rideService, leaderboards, RideError, LeaderboardError } = require('../../services/rideServices');

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req);
    res.json({ ok: true, data });
  } catch (err) {
    if (err instanceof RideError || err instanceof LeaderboardError) {
      return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[v2] unexpected error', err);
    return res.status(500).json({ ok: false, error: { code: 'internal', message: 'Something went wrong' } });
  }
};

/** Public: lets old/new apps learn the minimum supported version before logging in. */
const publicRouter = express.Router();
publicRouter.get(
  '/config',
  wrap(async () => ({
    minAppVersion: process.env.MIN_APP_VERSION || '0.0.0',
    serverTime: new Date().toISOString(),
  }))
);

/** Authenticated: mounted behind authMiddleware, which sets req.user. */
const router = express.Router();

router.put('/rides/:id', wrap((req) => rideService.upsertRide(req.user.id, req.params.id, req.body)));
router.post('/rides/:id/points', wrap((req) => rideService.addPoints(req.user.id, req.params.id, req.body && req.body.points)));
router.post('/rides/:id/events', wrap((req) => rideService.addEvents(req.user.id, req.params.id, req.body && req.body.events)));
router.post('/rides/:id/finalize', wrap((req) => rideService.finalize(req.user.id, req.params.id)));
router.delete('/rides/:id', wrap((req) => rideService.deleteRide(req.user.id, req.params.id)));
router.get('/rides/:id', wrap((req) => rideService.getRide(req.user.id, req.params.id)));
router.get('/rides', wrap((req) => rideService.listRides(req.user.id, { cursor: req.query.cursor, limit: req.query.limit })));
router.get('/leaderboard', wrap((req) => leaderboards.top(req.query)));
router.get('/leaderboard/me', wrap((req) => leaderboards.position(req.user.id, req.query)));
router.get('/me/summary', wrap((req) => rideService.getSummary(req.user.id)));

module.exports = { publicRouter, router };
