const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

require('dotenv').config();

const { splitStatements, DDL_DIR, STEPS } = require('../scripts/applySchema');

// THIS FILE WRITES A ROW, SO IT GETS ITS OWN SCHEMA.
//
// It needs a real user carrying a legacy_id, which no amount of stubbing can fake — the
// grace period is a database lookup or it is nothing. But `node --test` runs test FILES as
// parallel processes against one database, and controllerIntegration.test.js ends by
// asserting that the GLOBAL row counts are exactly what it found. A user created here and
// deleted a moment later is invisible to this file and fatal to that one, roughly one run
// in three, depending on how the two processes interleave.
//
// So this file never touches `public`. PG_SCHEMA sets the connection's search_path (see
// src/config/postgres.js and src/config/sequelize.js), and it MUST be set before the first
// require of the models, which is what binds the Sequelize instance. Nothing above this
// line may require ../src/models, directly or through a middleware.
const SCHEMA = process.env.GRACE_TEST_SCHEMA || 'safeexit_grace_test';
process.env.PG_SCHEMA = SCHEMA;

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

// Creating and dropping a schema is not something to do to a server that is not yours.
const dbHost = (() => {
  try { return new URL(process.env.DATABASE_URL || '').hostname; } catch { return ''; }
})();
if (!skipReason && !/^(127\.0\.0\.1|localhost|::1|172\.\d+\.\d+\.\d+)$/.test(dbHost)) {
  skipReason = `DATABASE_URL host "${dbHost}" is not local, and this file creates a schema`;
}

const created = [];
let subject = null;
// A syntactically valid ObjectId, standing in for a pre-cutover token subject.
const legacyObjectId = crypto.randomBytes(12).toString('hex');

test('setup: a user carrying a legacy_id, as every migrated row does', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }

  // Built with a plain client, because the pooled one is already pointed at a schema that
  // does not exist yet. A search_path naming a missing schema is legal; it simply resolves
  // nothing, which is fine for CREATE SCHEMA itself.
  try {
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
  } catch (error) {
    skipReason = `no database: ${error.message}`;
    t.skip(skipReason);
    return;
  }

  // The real DDL, not a model-derived guess — the same file that ships to the server.
  const ddl = fs.readFileSync(path.join(DDL_DIR, STEPS.schema), 'utf8');
  for (const stmt of splitStatements(ddl)) await sequelize.query(stmt);

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

test('cleanup: the throwaway schema is dropped', async (t) => {
  if (skipReason) { t.skip(skipReason); return; }
  await sequelize.close();

  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  const { rows } = await admin.query(
    'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [SCHEMA]
  );
  await admin.end();
  assert.equal(rows.length, 0, 'the throwaway schema outlived the test');
});
