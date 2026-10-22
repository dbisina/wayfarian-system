// server/middleware/v1Sunset.js
//
// Switch for retiring the v1 API once the new app is out. Off by default, so merging this changes
// nothing. Controlled by V1_SUNSET:
//   (unset / "off")  v1 works as before
//   "writes"         v1 keeps serving reads, but creating or changing data is refused with 426.
//                    This is the grace period: old apps can still show history while new rides
//                    stop landing in tables that v2 no longer reads.
//   "all"            every v1 data request is refused with 426
// Auth, health and the v2 API are never affected.

const MESSAGE = 'This version of Wayfarian is no longer supported. Please update the app to keep recording rides.';

function v1Sunset(mode = process.env.V1_SUNSET) {
  const m = String(mode || 'off').toLowerCase();
  return function v1SunsetMiddleware(req, res, next) {
    if (m !== 'writes' && m !== 'all') return next();
    const isRead = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (m === 'writes' && isRead) return next();
    return res.status(426).json({
      success: false,
      ok: false,
      error: { code: 'upgrade_required', message: MESSAGE },
      message: MESSAGE,
    });
  };
}

module.exports = { v1Sunset, MESSAGE };
