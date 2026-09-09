// Route parameter validation.
//
// Primary keys are uuids now, and Postgres rejects a malformed one at the type level:
// `SELECT ... WHERE id = '{"$ne":null}'` is not an empty result, it is
// `invalid input syntax for type uuid`. Every controller catches its own errors and
// answers 500, so without this a client could turn any `/:id` route into a server error
// just by sending rubbish — which is exactly what backend/stress/s2-authz.mjs B15 sends.
//
// MongoDB had the identical hole with a different spelling: findById on a non-ObjectId
// threw a CastError down the same 500 path. So this is not a regression the migration
// introduced, but it is a regression the migration made worth closing once and centrally.
//
// Wired with `router.param('id', uuidParam)`, which runs before every handler in a router
// that takes `:id` — one line per route file rather than a check in sixteen handlers.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 404, not 400: to a caller there is no difference between "that id is malformed" and
// "no such row", and saying which would confirm the id format to someone probing. It also
// keeps the response identical to the one a well-formed but unknown id already produces.
const uuidParam = (req, res, next, value) => {
  if (!UUID_RE.test(String(value || '').trim())) {
    return res.status(404).json({ message: 'Not found' });
  }
  return next();
};

module.exports = { uuidParam, UUID_RE };
