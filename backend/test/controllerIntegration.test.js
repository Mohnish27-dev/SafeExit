const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('dotenv').config();

const { sequelize, User, OutingRequest, LeaveApplication, ScanLog, UserSignature } = require('../src/models');
const scanController = require('../src/controllers/scanController');
const { passScope, mergeWhere } = require('../src/utils/hostelScope');
const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');

// ---------------------------------------------------------------------------
// Integration tests: the controllers against a real PostgreSQL.
//
// The rest of the suite stubs the data layer, which proves a handler asks for the right
// thing but not that the database agrees. These run the three paths where being wrong is
// most expensive — the gate scan, pass creation, and hostel scope — end to end.
//
// SKIPPING, not failing, when there is no database. Same contract as
// test/pgSchemaBehaviour.test.js: unset DATABASE_URL, an unreachable server, or a database
// with no schema all skip loudly with the reason and exit 0, so `npm test` can never turn
// red on a machine that simply has no PostgreSQL.
//
// CLEANUP. pgSchemaBehaviour wraps everything in one transaction and rolls it back, which
// it can because it drives raw SQL. Controllers commit their own work — that is the point
// of testing them — so instead every row created here is tracked and deleted in `after`,
// and the last test asserts the tables are back to the counts they started at. A failure
// mid-test still cleans up, because the tracking is done at creation time rather than at
// the end.
// ---------------------------------------------------------------------------

let skipReason = null;
if (!process.env.DATABASE_URL) {
  skipReason = 'DATABASE_URL is not set — see backend/db/postgres/README.md';
}

const created = { users: [], outings: [], leaves: [], scanLogs: [] };
let baseline = null;
let fixtures = null;

const counts = async () => {
  const [row] = await sequelize.query(
    `SELECT (SELECT count(*) FROM users)::int users,
            (SELECT count(*) FROM outing_requests)::int outings,
            (SELECT count(*) FROM leave_applications)::int leaves,
            (SELECT count(*) FROM scan_logs)::int scan_logs,
            (SELECT count(*) FROM user_signatures)::int signatures`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return row;
};

const recorder = () => {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (a, b) => {
    if (typeof a === 'string') res.headers[a] = b;
    else Object.assign(res.headers, a);
    return res;
  };
  return res;
};

const makeUser = async (attrs) => {
  const user = await User.create({ name: 'ITEST user', role: 'Student', ...attrs });
  created.users.push(user.id);
  return user;
};

const makeOuting = async (attrs) => {
  const row = await OutingRequest.create({
    destination: 'ITEST',
    purpose: 'integration fixture',
    outingType: 'General',
    outTime: new Date(Date.now() + 3600_000),
    inTime: new Date(Date.now() + 7200_000),
    ...attrs,
  });
  created.outings.push(row.id);
  return row;
};

test.before(async () => {
  if (skipReason) return;
  try {
    await sequelize.authenticate();
    await sequelize.query('SELECT 1 FROM users LIMIT 1');
  } catch (err) {
    skipReason = `PostgreSQL not usable: ${err.message}`;
    return;
  }

  baseline = await counts();

  const [kautilyaStudent, kadambiniStudent, guard, caretaker, warden] = await Promise.all([
    makeUser({ name: 'ITEST Kautilya Student', hostelName: 'Kautilya', gender: 'Male', studentId: 'ITEST-K1' }),
    makeUser({ name: 'ITEST Kadambini Student', hostelName: 'Kadambini', gender: 'Female', studentId: 'ITEST-D1' }),
    makeUser({ name: 'ITEST Guard', role: 'Guard', studentId: 'ITEST-G1' }),
    makeUser({ name: 'ITEST Caretaker', role: 'Caretaker', managedHostel: 'Kautilya', managedGender: 'Male', studentId: 'ITEST-C1' }),
    makeUser({ name: 'ITEST Warden', role: 'Warden', managedHostel: 'Kautilya', managedGender: 'Male', studentId: 'ITEST-W1' }),
  ]);
  fixtures = { kautilyaStudent, kadambiniStudent, guard, caretaker, warden };
});

test.after(async () => {
  if (baseline) {
    // Order matters: scan logs and passes reference users with ON DELETE RESTRICT.
    await ScanLog.destroy({ where: { id: created.scanLogs } }).catch(() => {});
    await ScanLog.destroy({ where: { studentId: created.users } }).catch(() => {});
    await OutingRequest.destroy({ where: { studentId: created.users } }).catch(() => {});
    await LeaveApplication.destroy({ where: { studentId: created.users } }).catch(() => {});
    await User.destroy({ where: { id: created.users } }).catch(() => {});
  }
  await sequelize.close().catch(() => {});
});

const maybe = (name, fn) => test(name, { skip: skipReason || false }, fn);

// Writes campusStatus straight to the row, then refreshes the instance.
//
// instance.update() would not do: Sequelize skips a field whose in-memory value already
// matches, so a fixture left stale by an earlier test would silently no-op and the next
// scan would 409 on a state that was never actually written.
const setCampusStatus = async (user, campusStatus) => {
  await User.update({ campusStatus }, { where: { id: user.id } });
  await user.reload();
  assert.equal(user.campusStatus, campusStatus);
};

// Leaves the fixture student with no active pass, so each test starts from a clean lock.
const releaseActivePasses = async (studentId) => {
  await OutingRequest.update(
    { status: 'Cancelled' },
    { where: { studentId, status: ACTIVE_PASS_STATUSES } }
  );
  await LeaveApplication.update(
    { status: 'Cancelled' },
    { where: { studentId, status: ACTIVE_PASS_STATUSES } }
  );
};

// An EXIT is only legal inside the gender/type departure window, judged against the
// current wall clock — so an exit test run at 2 AM correctly fails. Rather than freeze
// time or weaken the rule, the exit-path tests announce that they were skipped.
// The entry path has no window, so the transaction tests below use it and run at any hour.
const { isWithinDepartureWindow } = require('../src/utils/outingRules');
const departureWindowOpen = isWithinDepartureWindow('Male', 'General', new Date());
const outsideWindowReason = departureWindowOpen
  ? false
  : 'the campus departure window is closed right now — an exit is correctly refused at this hour';

// ---------------------------------------------------------------------------
// The gate scan
// ---------------------------------------------------------------------------

test('a full gate cycle moves the student out and back, and logs both movements', {
  skip: skipReason || outsideWindowReason,
}, async () => {
  const { kautilyaStudent: student, guard } = fixtures;
  await releaseActivePasses(student.id);
  await setCampusStatus(student, 'Inside');
  const pass = await makeOuting({ studentId: student.id, status: 'Approved' });

  const out = recorder();
  await scanController.createScanLog(
    { body: { student: student.id, direction: 'AUTO' }, user: guard },
    out
  );
  assert.equal(out.statusCode, 201, JSON.stringify(out.body));
  assert.equal(out.body.direction, 'OUT');
  created.scanLogs.push(out.body.id);

  await pass.reload();
  await student.reload();
  assert.equal(pass.status, 'Out');
  assert.ok(pass.actualOutTime instanceof Date, 'actualOutTime is stamped for the student view');
  assert.equal(student.campusStatus, 'Outside');

  // Resolved by ROLL NUMBER on the way back in — the printed-college-ID path.
  const back = recorder();
  await scanController.createScanLog(
    { body: { studentId: student.studentId, direction: 'AUTO' }, user: guard },
    back
  );
  assert.equal(back.statusCode, 201, JSON.stringify(back.body));
  assert.equal(back.body.direction, 'IN');
  created.scanLogs.push(back.body.id);

  await pass.reload();
  await student.reload();
  assert.equal(pass.status, 'Returned');
  assert.equal(pass.returnPunctuality, 'On-Time');
  assert.equal(student.campusStatus, 'Inside');
});

maybe('a second entry for the same student is refused and writes nothing', async () => {
  // Uses the entry path so it holds at any hour; the lock being tested — the conditional
  // campusStatus flip — is the same one both directions go through.
  const { kautilyaStudent: student, guard } = fixtures;
  await releaseActivePasses(student.id);
  await setCampusStatus(student, 'Outside');
  const pass = await makeOuting({ studentId: student.id, status: 'Out' });

  const first = recorder();
  await scanController.createScanLog({ body: { student: student.id, direction: 'IN' }, user: guard }, first);
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  created.scanLogs.push(first.body.id);

  const before = await counts();
  const second = recorder();
  await scanController.createScanLog({ body: { student: student.id, direction: 'IN' }, user: guard }, second);

  assert.equal(second.statusCode, 409, JSON.stringify(second.body));
  const after = await counts();
  assert.equal(after.scan_logs, before.scan_logs, 'a refused scan must not write a log');

  await pass.reload();
  assert.equal(pass.status, 'Returned', 'the first entry closed the pass; the second changed nothing');
});

maybe('a failure mid-scan leaves NO partial movement behind', async () => {
  // The single most valuable property of the migration. Under MongoDB the five writes of a
  // scan were sequential and unguarded, so dying between them left a student marked
  // Outside with no scan log — an invisible gate movement that no dashboard or audit
  // would ever show.
  const { kautilyaStudent: student, guard } = fixtures;
  await releaseActivePasses(student.id);
  await setCampusStatus(student, 'Outside');
  const pass = await makeOuting({ studentId: student.id, status: 'Out' });

  const before = await counts();
  const realCreate = ScanLog.create;
  ScanLog.create = () => { throw new Error('simulated crash between the flip and the log'); };

  const res = recorder();
  try {
    await scanController.createScanLog({ body: { student: student.id, direction: 'IN' }, user: guard }, res);
  } finally {
    ScanLog.create = realCreate;
  }

  assert.equal(res.statusCode, 500);
  await student.reload();
  await pass.reload();
  const after = await counts();

  assert.equal(student.campusStatus, 'Outside', 'the student must not be left marked as returned');
  assert.equal(pass.status, 'Out', 'the pass must not be left closed');
  assert.equal(after.scan_logs, before.scan_logs, 'no orphan scan log');

  await pass.update({ status: 'Cancelled' });
  await setCampusStatus(student, 'Inside');
});

// ---------------------------------------------------------------------------
// Pass creation
// ---------------------------------------------------------------------------

maybe('the database refuses a second active pass for one student', async () => {
  const { kautilyaStudent: student } = fixtures;
  await releaseActivePasses(student.id);
  const first = await makeOuting({ studentId: student.id, status: 'Pending' });

  // The partial unique index is the only thing standing between two concurrent POSTs and
  // two live passes; the controller's pre-check cannot close that race on its own.
  await assert.rejects(
    () => makeOuting({ studentId: student.id, status: 'Approved' }),
    (err) => {
      assert.equal(err.name, 'SequelizeUniqueConstraintError');
      assert.equal(err.parent.constraint, 'one_active_outing_per_student');
      return true;
    },
    'a second active outing must be rejected by one_active_outing_per_student'
  );

  await first.update({ status: 'Cancelled' });
});

maybe('every terminal status releases the one-active-pass lock', async () => {
  const { kadambiniStudent: student } = fixtures;
  for (const status of ['Rejected', 'Returned', 'Expired', 'Cancelled']) {
    const a = await makeOuting({ studentId: student.id, status });
    const b = await makeOuting({ studentId: student.id, status });
    assert.ok(a.id && b.id, `${status} wrongly blocks a second row`);
    await OutingRequest.destroy({ where: { id: [a.id, b.id] } });
  }
});

maybe('the active-pass status list matches the index the database enforces', async () => {
  // Drift between config/passStatuses.js and the index filter is how the double-submit
  // race reopens silently, so read the live index definition rather than the DDL text.
  const [row] = await sequelize.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'one_active_outing_per_student'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  assert.ok(row, 'one_active_outing_per_student does not exist');
  for (const status of ACTIVE_PASS_STATUSES) {
    assert.match(row.indexdef, new RegExp(`'${status}'`),
      `'${status}' is in ACTIVE_PASS_STATUSES but not in the index filter`);
  }
});

// ---------------------------------------------------------------------------
// Hostel scope — the JOIN that replaced distinct() + $in
// ---------------------------------------------------------------------------

maybe('a caretaker sees their own hostel and not another', async () => {
  const { kautilyaStudent, kadambiniStudent, caretaker } = fixtures;
  const mine = await makeOuting({ studentId: kautilyaStudent.id, status: 'Rejected' });
  const theirs = await makeOuting({ studentId: kadambiniStudent.id, status: 'Rejected' });

  const scope = passScope(OutingRequest, caretaker, ['id', 'hostelName']);
  const rows = await OutingRequest.findAll({
    where: mergeWhere(scope.where, { id: [mine.id, theirs.id] }),
    include: scope.include,
    subQuery: false,
  });

  assert.deepEqual(rows.map((r) => r.id), [mine.id]);
});

maybe('a caretaker still sees a request from another hostel that was routed to them', async () => {
  // The reason the scope join has to be a LEFT one. An INNER join on hostel would drop
  // exactly the cross-hostel request the routing feature exists to allow.
  const { kadambiniStudent, caretaker } = fixtures;
  const routed = await makeOuting({
    studentId: kadambiniStudent.id,
    status: 'Rejected',
    targetCaretaker: caretaker.id,
  });

  const scope = passScope(OutingRequest, caretaker, ['id', 'hostelName']);
  const rows = await OutingRequest.findAll({
    where: mergeWhere(scope.where, { id: routed.id }),
    include: scope.include,
    subQuery: false,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].student.hostelName, 'Kadambini');
});

maybe('hostel scope is case-insensitive, so a casing difference cannot empty a hostel', async () => {
  const { kautilyaStudent, caretaker } = fixtures;
  const row = await makeOuting({ studentId: kautilyaStudent.id, status: 'Rejected' });

  const lowercased = { role: 'Caretaker', _id: caretaker.id, managedHostel: 'kAuTiLyA' };
  const scope = passScope(OutingRequest, lowercased, ['id']);
  const rows = await OutingRequest.findAll({
    where: mergeWhere(scope.where, { id: row.id }),
    include: scope.include,
    subQuery: false,
  });

  assert.equal(rows.length, 1, 'a mis-cased hostel name silently emptied the whole hostel');
});

maybe('a warden with no hostel assigned sees nothing at all', async () => {
  const { kautilyaStudent } = fixtures;
  const row = await makeOuting({ studentId: kautilyaStudent.id, status: 'Rejected' });

  const scope = passScope(OutingRequest, { role: 'Warden', _id: crypto.randomUUID(), managedHostel: null }, ['id']);
  const rows = await OutingRequest.findAll({
    where: mergeWhere(scope.where, { id: row.id }),
    include: scope.include,
    subQuery: false,
  });

  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// Blobs
// ---------------------------------------------------------------------------

maybe('a signature round-trips through bytea as the exact data URL the API speaks', async () => {
  const { kautilyaStudent: student } = fixtures;
  // Every byte value, so a mangling encoder cannot pass by luck.
  const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;

  await User.setSignature(student.id, dataUrl);
  assert.equal(await User.getSignature(student.id), dataUrl);
  assert.equal(await User.hasSignature(student.id), true);

  const stored = await UserSignature.findByPk(student.id);
  assert.equal(stored.byteSize, 256, 'stored as decoded bytes, not base64 text');
  assert.ok(Buffer.isBuffer(stored.signature));

  await User.setSignature(student.id, null);
  assert.equal(await User.hasSignature(student.id), false);
});

maybe('a list query cannot pull pass signature bytes, but the byte endpoint can', async () => {
  const { kautilyaStudent: student } = fixtures;
  await releaseActivePasses(student.id);
  const bytes = Buffer.from([1, 2, 3, 4, 5]);
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  const pass = await makeOuting({ studentId: student.id, status: 'Rejected', studentSignature: dataUrl });

  const listed = await OutingRequest.findByPk(pass.id);
  // The column is not in the result set at all — the assertion that matters, since the
  // getter would return null either way and null could equally mean "no signature".
  assert.ok(
    !('studentSignature' in listed.dataValues),
    'defaultScope must exclude the signature column from a list query'
  );
  assert.equal(listed.studentSignature, null);

  const opted = await OutingRequest.findByPk(pass.id, {
    attributes: ['id', 'studentSignature', 'studentSignatureMime'],
  });
  assert.equal(opted.studentSignature, dataUrl, 'the byte endpoint opts back in and gets the exact data URL');
});

// ---------------------------------------------------------------------------

maybe('the suite leaves the database exactly as it found it', async () => {
  // Runs last. Deletes what the tests made, then proves the tables are back to their
  // starting counts — the same zero-residue guarantee pgSchemaBehaviour gets from its
  // rollback, reached differently because controllers commit their own work.
  await ScanLog.destroy({ where: { studentId: created.users } });
  await OutingRequest.destroy({ where: { studentId: created.users } });
  await LeaveApplication.destroy({ where: { studentId: created.users } });
  await User.destroy({ where: { id: created.users } });
  created.users = [];

  const now = await counts();
  assert.deepEqual(now, baseline, 'integration tests left rows behind');
});

if (skipReason) {
  test('integration tests skipped', () => {
    console.warn(`[integration] SKIPPED — ${skipReason}`);
  });
}
