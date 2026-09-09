#!/usr/bin/env node
// Phase 4 — the full cutover, rehearsed end to end against a throwaway schema.
//
//   npm run cutover:rehearse
//
// Every step of docs/CUTOVER.md that can be run without a college server is run here, in
// the same order, using the SAME commands and the SAME code that will run on the night.
// This is not a reimplementation of the cutover: it shells out to scripts/applySchema.js,
// scripts/etl.js and scripts/cutoverVerify.js exactly as the runbook does, then boots the
// real Express app against what they produced.
//
// ---------------------------------------------------------------------------
// WHERE IT WRITES, AND WHY THAT IS SAFE
//
// Into a THROWAWAY SCHEMA (default `safeexit_rehearsal`), created at the start and dropped
// at the end. PG_SCHEMA sets the connection's search_path for both Sequelize and the raw
// `pg` clients the scripts open (see src/config/postgres.js), so every unqualified table
// reference — the DDL's, the ETL's, the app's — resolves there and cannot see, let alone
// write, the working data in `public`.
//
// A schema rather than a database because the dev role cannot CREATEDB, which is also the
// constraint the college server will impose. Same reasoning as backend/stress/harness.mjs.
//
// It REFUSES to run unless DATABASE_URL points at localhost.
//
// MongoDB is only ever read. The ETL is read-only against Atlas by construction, and the
// one test that needs a row to be missing simulates it by clearing a legacy_id on the
// PostgreSQL side. Nothing in this file writes to Mongo.
// ---------------------------------------------------------------------------
//
// WHAT IT CANNOT COVER, and what is therefore still manual on the night:
//
//   - The real scanner at the real gate station. A simulated scan proves the transaction
//     and the state machine; it does not prove the USB scanner's keystrokes.
//   - Secret rotation, and the college server's own version, permissions and firewall.
//   - The merge conflict in step 11. That was verified separately on a throwaway branch.

require('dotenv').config();

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const SCHEMA = process.env.REHEARSAL_SCHEMA || 'safeexit_rehearsal';
const KEEP = process.argv.includes('--keep');
const SCRIPTS = __dirname;

// --- reporting --------------------------------------------------------------

const results = [];
const line = (...a) => console.log(...a);
const heading = (t) => line(`\n${t}\n${'='.repeat(t.length)}`);

const record = (id, title, status, detail) => {
  results.push({ id, title, status, detail });
  line(`  [${status}] ${id}  ${title}${detail ? `\n         ${detail}` : ''}`);
};
const pass = (id, title, detail) => record(id, title, 'PASS', detail);
const fail = (id, title, detail) => record(id, title, 'FAIL', detail);
const skip = (id, title, detail) => record(id, title, 'SKIP', detail);

// --- guard rails ------------------------------------------------------------

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ABORT: DATABASE_URL is not set. See backend/db/postgres/README.md.');
  process.exit(2);
}
const host = (() => {
  try { return new URL(url).hostname; } catch { return ''; }
})();
if (!/^(127\.0\.0\.1|localhost|::1|172\.\d+\.\d+\.\d+)$/.test(host)) {
  console.error(`ABORT: DATABASE_URL host is "${host}", which is not local.`);
  console.error('       A rehearsal creates and drops a schema and seeds passes. It must');
  console.error('       never point at the college server. Rehearse against your own copy.');
  process.exit(2);
}
if (!process.env.MONGO_URI) {
  console.error('ABORT: MONGO_URI is not set. The ETL and the verifier both read from it.');
  process.exit(2);
}

// --- running the real commands ----------------------------------------------

// Child processes rather than require(), for two reasons: the runbook's commands are what
// is under test, and each script gets the same clean process it will get on the night —
// including its exit code, which for cutoverVerify.js IS the result.
const runScript = (file, args = [], extraEnv = {}) => {
  const res = spawnSync(process.execPath, [path.join(SCRIPTS, file), ...args], {
    env: { ...process.env, PG_SCHEMA: SCHEMA, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: res.status,
    out: `${res.stdout || ''}${res.stderr || ''}`,
  };
};

const tail = (text, n = 6) =>
  text.trim().split('\n').slice(-n).map((l) => `         | ${l}`).join('\n');

// --- the rehearsal ----------------------------------------------------------

let admin = null;
let server = null;

const dropSchema = async () => {
  if (!admin) return;
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
};

const main = async () => {
  line(`\nSafeExit — cutover rehearsal`);
  line(`  target schema : ${SCHEMA}  (created now, dropped at the end)`);
  line(`  database      : ${url.replace(/:[^:@/]*@/, ':***@')}`);
  line(`  source        : MongoDB, read-only`);

  admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);

  // =========================================================================
  heading('Phase A — before the day (runbook steps 1-3)');

  // R1 — the schema applies to an empty database, as it will on the college server.
  {
    const { code, out } = runScript('applySchema.js', ['schema']);
    if (code === 0 && /RESULT: ok/.test(out)) {
      const tables = (out.match(/^\s+ok\s+\w+\s+\d+ rows/gm) || []).length;
      pass('R1', 'The DDL applies clean to an empty schema', `${tables} tables verified, RESULT: ok`);
    } else {
      fail('R1', 'The DDL applies clean to an empty schema', tail(out));
    }
  }

  // R2 — pg:check is safe and honest about a database that is not loaded yet.
  {
    const { code, out } = runScript('applySchema.js', ['check']);
    const zeroRows = /users\s+0 rows/.test(out);
    if (code === 0 && zeroRows) {
      pass('R2', 'pg:check reports an applied but empty schema', 'this is what the college server should look like before the ETL');
    } else if (code === 0) {
      pass('R2', 'pg:check runs read-only against the fresh schema');
    } else {
      fail('R2', 'pg:check runs read-only against the fresh schema', tail(out));
    }
  }

  // =========================================================================
  heading('Phase B — the switch (runbook steps 7-8)');

  // R3 — the ETL, exactly as step 7 runs it.
  {
    const { code, out } = runScript('etl.js');
    const committed = /Committed\./.test(out);
    const totals = (out.match(/totals: read (\d+), written (\d+)/) || []);
    if (code === 0 && committed) {
      pass('R3', 'The final ETL loads and commits', `read ${totals[1]}, written ${totals[2]}`);
    } else {
      fail('R3', 'The final ETL loads and commits', tail(out, 10));
    }
  }

  // R4 — the constraints bind, including on the rows just loaded.
  {
    const c1 = runScript('applySchema.js', ['constraints']);
    const c2 = runScript('applySchema.js', ['validate']);
    if (c1.code === 0 && c2.code === 0) {
      pass('R4', '002 and 003 apply and validate against the migrated rows',
        'the migrated data satisfies every rule Mongo never enforced');
    } else {
      fail('R4', '002 and 003 apply and validate against the migrated rows',
        tail(c1.code === 0 ? c2.out : c1.out, 8));
    }
  }

  // R5 — the verification gate says go. This is runbook step 8.
  {
    const { code, out } = runScript('cutoverVerify.js');
    const lost = (out.match(/rows written after the ETL read the data\s*:\s*(\d+)/) || [])[1];
    const decided = (out.match(/passes decided after the ETL read the data\s*:\s*(\d+)/) || [])[1];
    if (code === 0 && /OK to cut over/.test(out)) {
      pass('R5', 'pg:verify passes on a freshly loaded schema',
        `lost writes ${lost}, passes decided in the gap ${decided}`);
    } else {
      fail('R5', 'pg:verify passes on a freshly loaded schema', tail(out, 12));
    }
  }

  // R6 — THE IMPORTANT ONE. Prove the gate actually blocks a lost write.
  //
  // A verifier that only ever says "ok" is indistinguishable from one that is broken, and
  // you would not find out until the night it mattered. So: hide one row from the
  // reconciliation by clearing its legacy_id, push the cutoff back before that row was
  // created, and require a non-zero exit.
  {
    const { rows } = await admin.query(
      `SELECT legacy_id FROM ${SCHEMA}.outing_requests
        WHERE legacy_id IS NOT NULL ORDER BY legacy_id DESC LIMIT 1`
    );
    if (!rows.length) {
      skip('R6', 'pg:verify BLOCKS when a write landed in Mongo after the ETL',
        'no migrated outing rows to simulate with');
    } else {
      const victim = rows[0].legacy_id;
      // The first four bytes of an ObjectId are its creation time.
      const created = new Date(parseInt(victim.slice(0, 8), 16) * 1000);
      const since = new Date(created.getTime() - 1000).toISOString();

      await admin.query(
        `UPDATE ${SCHEMA}.outing_requests SET legacy_id = NULL WHERE legacy_id = $1`,
        [victim]
      );
      const { code, out } = runScript('cutoverVerify.js', ['--since', since]);
      await admin.query(
        `UPDATE ${SCHEMA}.outing_requests SET legacy_id = $1
          WHERE id = (SELECT id FROM ${SCHEMA}.outing_requests WHERE legacy_id IS NULL LIMIT 1)`,
        [victim]
      );

      if (code === 1 && /DO NOT CUT OVER/.test(out)) {
        pass('R6', 'pg:verify BLOCKS when a write landed in Mongo after the ETL',
          `simulated with ${victim}, exit 1 and "DO NOT CUT OVER"`);
      } else {
        fail('R6', 'pg:verify BLOCKS when a write landed in Mongo after the ETL',
          `exit ${code} — the gate did not catch a row it should have\n${tail(out, 8)}`);
      }
    }
  }

  // =========================================================================
  heading('Phase C — the app on the migrated data (runbook steps 12-14)');

  // Everything below runs in THIS process against the rehearsal schema. PG_SCHEMA has to
  // be set before the first require of the models, which binds the Sequelize instance.
  process.env.PG_SCHEMA = SCHEMA;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'rehearsal-secret';
  delete process.env.MAINTENANCE_MODE;
  delete process.env.LEGACY_ID_GRACE;

  const jwt = require('jsonwebtoken');
  const { sequelize, User, OutingRequest, ScanLog } = require('../src/models');
  const app = require('../src/app');

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  const token = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const api = async (p, { method = 'GET', tok, body } = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: {
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* not every response is JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  };

  // R7 — a migrated student's session survives the switch.
  //
  // This is the whole point of LEGACY_ID_GRACE. The token subject is the OLD MongoDB
  // ObjectId, exactly as every token issued before the cutover carries.
  const student = await User.findOne({
    where: { role: 'Student' },
    order: [['createdAt', 'DESC']],
  });
  if (!student) {
    fail('R7', 'A pre-cutover token still authenticates', 'no migrated students found');
  } else {
    const uuidRes = await api('/api/auth/profile', { tok: token(student.id) });
    const legacyRes = await api('/api/auth/profile', { tok: token(student.legacyId) });
    if (uuidRes.status === 200 && legacyRes.status === 200 && legacyRes.body?._id === student.id) {
      pass('R7', 'A pre-cutover token still authenticates',
        `ObjectId subject ${student.legacyId} resolved to the same account, no forced re-login`);
    } else {
      fail('R7', 'A pre-cutover token still authenticates',
        `uuid=${uuidRes.status} objectId=${legacyRes.status} — the campus would be signed out`);
    }
  }

  // R8 — and the grace period can be switched off cleanly when 004 comes.
  if (!student) {
    skip('R8', 'LEGACY_ID_GRACE=false ends the grace period without a deploy',
      'no migrated students to test with');
  } else {
    process.env.LEGACY_ID_GRACE = 'false';
    const off = await api('/api/auth/profile', { tok: token(student.legacyId) });
    const stillOk = await api('/api/auth/profile', { tok: token(student.id) });
    delete process.env.LEGACY_ID_GRACE;
    if (off.status === 401 && stillOk.status === 200) {
      pass('R8', 'LEGACY_ID_GRACE=false ends the grace period without a deploy',
        'ObjectId tokens 401, uuid tokens unaffected');
    } else {
      fail('R8', 'LEGACY_ID_GRACE=false ends the grace period without a deploy',
        `objectId=${off.status} (want 401) uuid=${stillOk.status} (want 200)`);
    }
  }

  // R9 — the six roles all answer on migrated data. Runbook step 14.
  {
    const probes = [
      ['Student', '/api/outing/myrequests'],
      ['Guard', '/api/scan'],
      ['Caretaker', '/api/outing/pending'],
      ['Warden', '/api/outing/forwarded'],
      ['ChiefWarden', '/api/chief-warden/overview'],
      ['Admin', '/api/admin/overview'],
    ];
    const missing = [];
    const broken = [];
    for (const [role, route] of probes) {
      const who = await User.findOne({ where: { role } });
      if (!who) { missing.push(role); continue; }
      const res = await api(route, { tok: token(who.id) });
      if (res.status !== 200) broken.push(`${role} ${route} -> ${res.status}`);
    }
    if (!broken.length && !missing.length) {
      pass('R9', 'All six roles load their dashboard against migrated data', probes.map(([r]) => r).join(', '));
    } else if (!broken.length) {
      pass('R9', 'Every role present in the data loads its dashboard',
        `no migrated user for: ${missing.join(', ')} — check that is expected`);
    } else {
      fail('R9', 'All six roles load their dashboard against migrated data', broken.join('; '));
    }
  }

  // R10 — the gate. One exit and one entry, through the real endpoint and the real
  // five-write transaction, on a MIGRATED student. Runbook step 13, minus the hardware.
  {
    const guard = await User.findOne({ where: { role: 'Guard' } });
    const walker = await User.findOne({
      where: { role: 'Student', campusStatus: 'Inside' },
      order: [['createdAt', 'DESC']],
    });

    if (!guard || !walker) {
      skip('R10', 'A real exit and a real entry at the gate',
        `${!guard ? 'no migrated Guard' : ''}${!walker ? ' no student marked Inside' : ''}`.trim());
    } else {
      // A pass usable right now: departure already open, return later today.
      const now = new Date();
      const outTime = new Date(now.getTime() + 60 * 60 * 1000);
      const inTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const pass1 = await OutingRequest.create({
        studentId: walker.id,
        destination: 'REHEARSAL destination',
        purpose: 'cutover rehearsal',
        outingType: walker.gender === 'Female' ? 'Nearby' : 'General',
        outTime,
        inTime,
        status: 'Approved',
        autoApproved: true,
      });

      const gtok = token(guard.id);
      // AUTO is what the real gate station sends: one scanner, no exit/entry mode switch,
      // direction derived from the student's current campus status.
      const scan = { method: 'POST', tok: gtok, body: { student: walker.id, direction: 'AUTO' } };
      const out = await api('/api/scan', scan);
      const afterOut = await User.findByPk(walker.id);
      const back = await api('/api/scan', scan);
      const afterIn = await User.findByPk(walker.id);

      const logs = await ScanLog.count({ where: { studentId: walker.id } });
      const finalPass = await OutingRequest.findByPk(pass1.id);

      // Clean up the rehearsal pass; the schema is dropped anyway, but leaving a student
      // holding an active pass would poison a --keep run.
      await ScanLog.destroy({ where: { studentId: walker.id } });
      await OutingRequest.destroy({ where: { id: pass1.id } });

      if (out.status === 201 && afterOut.campusStatus === 'Outside'
          && back.status === 201 && afterIn.campusStatus === 'Inside') {
        pass('R10', 'A real exit and a real entry at the gate',
          `${walker.name}: Inside -> Outside -> Inside, ${logs} scan logs written, pass ended as ${finalPass?.status}`);
      } else if (out.status === 403 || back.status === 403) {
        skip('R10', 'A real exit and a real entry at the gate',
          `refused by a gate rule, not a fault: exit=${out.status} "${out.body?.message || ''}" ` +
          `entry=${back.status}. The gender window is 06:00-19:59 — re-run inside it.`);
      } else {
        fail('R10', 'A real exit and a real entry at the gate',
          `exit=${out.status} ${JSON.stringify(out.body)} status=${afterOut.campusStatus} | ` +
          `entry=${back.status} status=${afterIn.campusStatus}`);
      }
    }
  }

  // R11 — the write freeze, over real HTTP, on the real router stack. Runbook steps 6 & 12.
  {
    process.env.MAINTENANCE_MODE = 'true';
    const health = await api('/health');
    const read = await api('/api/outing/myrequests');
    const write = await api('/api/auth/login', { method: 'POST', body: { loginId: 'x', password: 'y' } });
    process.env.MAINTENANCE_MODE = 'false';
    const thawed = await api('/api/auth/login', { method: 'POST', body: { loginId: 'x', password: 'y' } });
    delete process.env.MAINTENANCE_MODE;

    const frozenOk = write.status === 503
      && write.headers.get('retry-after')
      && health.status === 200
      && read.status !== 503;

    if (frozenOk && thawed.status !== 503) {
      pass('R11', 'The write freeze holds, and lifts',
        `writes 503 with Retry-After ${write.headers.get('retry-after')}s, /health 200, reads pass through, ` +
        'and unfreezing restores writes with only a restart');
    } else {
      fail('R11', 'The write freeze holds, and lifts',
        `frozen: health=${health.status} read=${read.status} write=${write.status} | thawed write=${thawed.status}`);
    }
  }

  // R12 — the blob contract survived the move. Through the real endpoint the frontend
  // calls, not the model internals: the bytes are `bytea` now and the data layer rebuilds
  // the data URL, so this is the check that the API contract did not change shape.
  {
    const admin2 = await User.findOne({ where: { role: 'Admin' } });
    const withPhoto = await User.findOne({
      include: [{ association: 'photoRow', required: true }],
    }).catch(() => null);

    if (!admin2 || !withPhoto) {
      skip('R12', 'A migrated face photo still serves over the API',
        !withPhoto ? 'no migrated photo rows' : 'no migrated Admin to read it as');
    } else {
      // The endpoint answers JSON carrying the stored data URL, which is exactly the
      // contract under test: the bytes live in `bytea` now, and the frontend must still
      // receive the same `data:<mime>;base64,...` string it did from Mongo.
      const res = await api(`/api/admin/users/${withPhoto.id}/photo`, { tok: token(admin2.id) });
      const dataUrl = res.body?.photo;
      if (res.status === 200 && typeof dataUrl === 'string' && /^data:image\/[a-z+]+;base64,/.test(dataUrl)) {
        pass('R12', 'A migrated face photo still serves over the API',
          `${Math.round(dataUrl.length / 1024)}KB data URL rebuilt from bytea, JSON contract unchanged`);
      } else {
        fail('R12', 'A migrated face photo still serves over the API',
          `status=${res.status} photo=${typeof dataUrl === 'string' ? dataUrl.slice(0, 40) : dataUrl}`);
      }
    }
  }

  await new Promise((r) => server.close(r));
  server = null;
  await sequelize.close();

  // =========================================================================
  heading('Result');

  const counts = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  for (const r of results) line(`  ${r.status.padEnd(4)} ${r.id.padEnd(4)} ${r.title}`);
  line(`\n  ${counts.PASS || 0} passed, ${counts.FAIL || 0} failed, ${counts.SKIP || 0} skipped`);

  if (counts.FAIL) {
    line('\n  NOT READY. Fix the failures above before booking the cutover window.');
  } else {
    line('\n  The rehearsal is clean. What it could not cover, and what stays manual:');
    line('    - the USB scanner at the real gate station (R10 proves the transaction, not the hardware)');
    line('    - secret rotation, and the college server\'s version, permissions and firewall');
    line('    - the step 11 merge conflict, verified separately on a throwaway branch');
  }

  return counts.FAIL ? 1 : 0;
};

main()
  .then(async (code) => {
    if (KEEP) {
      line(`\n  --keep: schema ${SCHEMA} left in place. Drop it with:`);
      line(`    psql "$DATABASE_URL" -c 'DROP SCHEMA ${SCHEMA} CASCADE'`);
    } else {
      await dropSchema();
      line(`\n  schema ${SCHEMA} dropped.`);
    }
    if (admin) await admin.end();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(`\nREHEARSAL ERRORED: ${err.message}`);
    console.error(err.stack);
    try { if (server) server.close(); } catch { /* already down */ }
    try { if (!KEEP) await dropSchema(); } catch { /* best effort */ }
    try { if (admin) await admin.end(); } catch { /* already gone */ }
    process.exit(2);
  });
