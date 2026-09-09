const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const { maintenanceMode } = require('../src/middlewares/maintenanceMode');
const { protect } = require('../src/middlewares/authMiddleware');
const { sequelize, User } = require('../src/models');

// ---------------------------------------------------------------------------
// Phase 4 (cutover) machinery: the write freeze and the legacy-id grace period.
//
// Both exist for a window of minutes-to-weeks and both fail in ways nobody watches for —
// a freeze that silently lets writes through loses the records created during the final
// ETL, and a grace period that silently does not work logs out the gate guard mid-shift.
// So they get tested before the window, not during it.
//
// The maintenance tests are pure middleware and always run. The grace-period tests need a
// real row with a legacy_id, so they skip loudly without a database, matching
// test/controllerIntegration.test.js.
// ---------------------------------------------------------------------------

const request = (method, path = '/api/outing') => ({ method, path, headers: {}, cookies: {} });

const recorder = () => {
  const res = { statusCode: null, body: null, headers: {}, nexted: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (a, b) => { res.headers[a] = b; return res; };
  return res;
};

const run = (middleware, req) => {
  const res = recorder();
  return new Promise((resolve) => {
    const next = () => { res.nexted = true; resolve(res); };
    const out = middleware(req, res, next);
    if (out && typeof out.then === 'function') out.then(() => resolve(res));
    else if (!res.nexted) resolve(res);
  });
};

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

// --- the write freeze -------------------------------------------------------

test('maintenance mode off is a pass-through that sets no headers', async () => {
  await withEnv({ MAINTENANCE_MODE: undefined }, async () => {
    const res = await run(maintenanceMode, request('POST'));
    assert.equal(res.nexted, true);
    assert.equal(res.statusCode, null);
    assert.deepEqual(res.headers, {});
  });
});

test('maintenance mode refuses every mutating method with 503 and Retry-After', async () => {
  await withEnv({ MAINTENANCE_MODE: 'true', MAINTENANCE_RETRY_AFTER: undefined }, async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await run(maintenanceMode, request(method));
      assert.equal(res.nexted, false, `${method} should not reach the routes`);
      assert.equal(res.statusCode, 503, `${method} should be 503`);
      assert.equal(res.body.maintenance, true);
      assert.equal(res.headers['Retry-After'], '900');
      assert.equal(res.headers['X-Maintenance-Mode'], '1');
    }
  });
});

test('maintenance mode leaves reads working, so the roster and SSE survive the freeze', async () => {
  await withEnv({ MAINTENANCE_MODE: 'true' }, async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const res = await run(maintenanceMode, request(method));
      assert.equal(res.nexted, true, `${method} should pass through`);
      assert.equal(res.statusCode, null);
      // Still advertised, so a freeze can be confirmed with a GET.
      assert.equal(res.headers['X-Maintenance-Mode'], '1');
    }
  });
});

test('maintenance mode never blocks /health, or Docker restarts the app mid-cutover', async () => {
  await withEnv({ MAINTENANCE_MODE: 'true' }, async () => {
    const res = await run(maintenanceMode, request('POST', '/health'));
    assert.equal(res.nexted, true);
    assert.equal(res.statusCode, null);
  });
});

test('the freeze message and retry window are overridable without a code change', async () => {
  await withEnv(
    { MAINTENANCE_MODE: 'true', MAINTENANCE_MESSAGE: 'Back at 06:00.', MAINTENANCE_RETRY_AFTER: '60' },
    async () => {
      const res = await run(maintenanceMode, request('POST'));
      assert.equal(res.body.message, 'Back at 06:00.');
      assert.equal(res.headers['Retry-After'], '60');
    }
  );
});

// --- the legacy-id grace period ---------------------------------------------

let skipReason = null;
if (!process.env.DATABASE_URL) skipReason = 'DATABASE_URL is not set';
if (!process.env.JWT_SECRET) skipReason = 'JWT_SECRET is not set';

const created = [];
let subject = null;
// A syntactically valid ObjectId, standing in for a pre-cutover token subject.
const legacyObjectId = crypto.randomBytes(12).toString('hex');

test('setup: a user carrying a legacy_id, as every migrated row does', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  try {
    await sequelize.authenticate();
  } catch (error) {
    skipReason = `no database: ${error.message}`;
    t.skip(skipReason);
    return;
  }
  subject = await User.create({
    name: 'CUTOVER grace user',
    role: 'Student',
    // users_student_has_hostel (002) requires it, and a student is the right role here:
    // students are the bulk of the tokens still alive at cutover.
    hostelName: 'Kautilya',
    gender: 'Male',
    studentId: 'CUTOVER-GRACE-1',
    legacyId: legacyObjectId,
  });
  created.push(subject.id);
});

const protectWith = async (tokenSubject, env = {}) => {
  const token = jwt.sign({ id: tokenSubject }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = {
    method: 'GET',
    path: '/api/auth/profile',
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
  };
  return withEnv(env, () => run(protect, req));
};

test('a post-cutover uuid token authenticates', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  const res = await protectWith(subject.id);
  assert.equal(res.statusCode, null, 'should not have been refused');
  assert.equal(res.nexted, true);
});

test('a pre-cutover ObjectId token resolves through legacy_id instead of logging the user out', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  const res = await protectWith(legacyObjectId, { LEGACY_ID_GRACE: undefined });
  assert.equal(res.statusCode, null, 'the grace period should have accepted this token');
  assert.equal(res.nexted, true);
});

test('the resolved user is the same account, with no password on it', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  const token = jwt.sign({ id: legacyObjectId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = {
    method: 'GET',
    path: '/x',
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
  };
  await run(protect, req);
  assert.equal(req.user.id, subject.id);
  // The projection has to survive the fallback path too. It is a second query, easy to
  // write without the exclude and never notice.
  assert.equal(req.user.dataValues.password, undefined);
  assert.equal(req.user.dataValues.currentChallenge, undefined);
});

test('LEGACY_ID_GRACE=false ends the grace period without a code change', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  const res = await protectWith(legacyObjectId, { LEGACY_ID_GRACE: 'false' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.nexted, false);
});

test('a malformed subject is a 401, not a 500 from invalid uuid syntax', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  for (const bad of ['{"$ne":null}', 'not-an-id', '', '12345']) {
    const res = await protectWith(bad);
    assert.equal(res.statusCode, 401, `${bad} should be 401`);
    assert.equal(res.nexted, false);
  }
});

test('cleanup', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  if (created.length) await User.destroy({ where: { id: created } });
  const left = await User.count({ where: { legacyId: legacyObjectId } });
  assert.equal(left, 0);
  await sequelize.close();
});
