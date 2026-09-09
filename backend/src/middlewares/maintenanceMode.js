// The write freeze, for the minutes around cutover.
//
// The final ETL run has to read an Atlas that nobody is writing to. Anything created in
// the gap between "ETL finished" and "DATABASE_URL switched" lands in the old database
// and is then silently absent from the new one — a student marked Outside in Mongo who
// is Inside in Postgres, which the gate discovers the hard way. The window is small and
// the loss is invisible, which is exactly the combination worth spending code on.
//
// The alternative was stopping the container. That freezes writes too, but it also takes
// down every read: the guard's roster, the warden's overdue list, the SSE stream. This
// keeps all of that answering while refusing the writes.
//
// METHOD, NOT ROUTE LIST. Every mutation in this API is a POST, PATCH, PUT or DELETE, so
// blocking by method needs no allowlist to keep current — a route added next year is
// frozen correctly without anyone remembering this file exists. It does mean logging in
// is refused during the window, since POST /api/auth/login is indistinguishable from a
// write here; sessions already open keep reading. Keep the window to minutes.
//
// This middleware has NO database coupling of any kind, deliberately: the freeze has to be
// applied to whichever backend is live at the time, which during the cutover is still the
// MongoDB one. It cherry-picks onto that branch as this file plus one line in app.js.

const FROZEN_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// /health is what the container healthcheck and the deploy script poll. A frozen app is
// still a healthy app, and answering 503 here would make Docker restart it mid-cutover.
const ALWAYS_ALLOWED = new Set(['/health']);

// Read per request rather than at boot so a test can flip it, and so the flag is checked
// in exactly one place.
const maintenanceEnabled = () => process.env.MAINTENANCE_MODE === 'true';

const DEFAULT_MESSAGE =
  'SafeExit is briefly read-only while the database is being migrated. ' +
  'Nothing has been lost — try again in a few minutes.';

const maintenanceMode = (req, res, next) => {
  if (!maintenanceEnabled()) return next();

  // Advertised on every response, not just the refusals, so an operator can confirm the
  // freeze took effect with a single GET instead of by attempting a write.
  res.set('X-Maintenance-Mode', '1');

  if (!FROZEN_METHODS.has(req.method)) return next();
  if (ALWAYS_ALLOWED.has(req.path)) return next();

  // 503 + Retry-After is the honest pair: the request was refused by a healthy server and
  // will succeed later, which is what tells a client to back off rather than to log the
  // user out (401) or discard the attempt as invalid (400).
  res.set('Retry-After', process.env.MAINTENANCE_RETRY_AFTER || '900');
  return res.status(503).json({
    message: process.env.MAINTENANCE_MESSAGE || DEFAULT_MESSAGE,
    maintenance: true,
  });
};

module.exports = { maintenanceMode, maintenanceEnabled, FROZEN_METHODS };
