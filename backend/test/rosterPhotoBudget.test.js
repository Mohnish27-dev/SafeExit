const test = require('node:test');
const assert = require('node:assert/strict');

const { User, UserPhoto, OutingRequest, LeaveApplication } = require('../src/models');
const { getUsers, getUserPhoto, getStudentCounts } = require('../src/controllers/adminController');

// A roster row is a few hundred bytes; a stored face photo is a few hundred KILObytes.
// Returning `photo` on a list endpoint therefore multiplies the response by ~1000x — and
// the security dashboard polls exactly that endpoint every 15 seconds.
//
// WHAT CHANGED IN THE MIGRATION, and why these tests changed shape:
//
// Under MongoDB the photo was a field on the user document, so keeping it out of the
// roster was a CONVENTION — a projection string that had to remember not to say "photo",
// and this file existed to assert that one word never got added back.
//
// It is in its own table now (user_photos). The roster query cannot return photo bytes at
// any projection, because they are not in the table it reads. So the first test below no
// longer greps a projection string; it asserts the structural fact that replaced it — the
// roster names only real user columns and pulls in no photo association. The remaining
// properties (guard fencing, an ids-only presence probe scoped to the page, the derived
// Overdue overlay, and the per-row endpoint's authorisation) are unchanged and still
// worth pinning.

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

// Stubs the two tables getOverdueStudentIds reads. adminController destructures that
// helper at require time, so patching utils/overdue would not be seen — the honest seam is
// the queries it actually makes.
const stubOverdue = (t, outStudentIds = []) => {
  const originalOuting = OutingRequest.findAll;
  const originalLeave = LeaveApplication.findAll;
  const past = new Date(Date.now() - 60 * 60 * 1000);

  OutingRequest.findAll = async () => outStudentIds.map((id) => ({ studentId: id, inTime: past }));
  LeaveApplication.findAll = async () => [];

  t.after(() => {
    OutingRequest.findAll = originalOuting;
    LeaveApplication.findAll = originalLeave;
  });
};

// getUsers makes two reads: the page of users, and the ids-only photo presence probe.
// They are different MODELS now rather than the same collection told apart by its filter,
// which is itself the point of the split.
const stubRoster = (t, rows, photoOwnerIds = []) => {
  const originalFindAll = User.findAll;
  const originalPhoto = UserPhoto.findAll;
  const originalCount = User.count;
  const seen = { page: null, probe: null };

  User.findAll = async (options) => {
    seen.page = options;
    return rows.map((r) => ({ ...r }));
  };
  UserPhoto.findAll = async (options) => {
    seen.probe = options;
    return photoOwnerIds.map((id) => ({ userId: id }));
  };
  User.count = async () => rows.length;

  t.after(() => {
    User.findAll = originalFindAll;
    UserPhoto.findAll = originalPhoto;
    User.count = originalCount;
  });
  return seen;
};

test('the roster reads no photo bytes, for either role', async (t) => {
  stubOverdue(t);
  const rows = [{ id: 'stu-1', name: 'Asha Kumari' }];

  for (const role of ['Guard', 'Admin']) {
    const seen = stubRoster(t, rows);
    const res = recorder();
    await getUsers({ user: { role }, query: {} }, res);

    assert.equal(res.statusCode, null, `${role} request failed`);
    assert.ok(Array.isArray(seen.page.attributes), `${role} made no page query`);

    // Never named in the attribute list...
    for (const blob of ['photo', 'signature', 'password']) {
      assert.ok(
        !seen.page.attributes.includes(blob),
        `${role} roster selects ${blob}: ${seen.page.attributes.join(' ')}`
      );
    }
    // ...and, the part that is structural rather than conventional: no association that
    // could carry the bytes is joined in. Naming `photo` in `attributes` would not even
    // work — it is a virtual over a table this query does not touch.
    assert.equal(seen.page.include, undefined, `${role} roster joins a photo/signature table`);

    // And nothing leaks through the response either.
    assert.equal(res.body[0].photo, undefined);
  }
});

test('photo bytes are not a column on users at all', () => {
  // The guarantee behind the test above, asserted directly: there is no users.photo to
  // select. `photo` exists only as a VIRTUAL that reads the joined user_photos row, so a
  // careless SELECT * on the roster physically cannot pull a face photo.
  assert.equal(User.rawAttributes.photo.type.key, 'VIRTUAL');
  assert.equal(User.rawAttributes.signature.type.key, 'VIRTUAL');
  assert.equal(UserPhoto.getTableName(), 'user_photos');
});

test('a guard is pinned to students and to non-confidential fields', async (t) => {
  stubOverdue(t);
  const seen = stubRoster(t, [{ id: 'stu-1', name: 'Asha Kumari' }]);
  const res = recorder();

  // Asking for staff explicitly must not widen the guard's view.
  await getUsers({ user: { role: 'Guard' }, query: { role: 'Warden' } }, res);

  assert.equal(seen.page.where.role, 'Student');
  for (const confidential of ['email', 'phoneNumber', 'guardianPhoneNumber', 'photo']) {
    assert.ok(!seen.page.attributes.includes(confidential), `guard can read ${confidential}`);
  }
});

test('hasPhoto is derived from an ids-only probe scoped to the page', async (t) => {
  stubOverdue(t);
  const rows = [{ id: 'stu-1', name: 'A' }, { id: 'stu-2', name: 'B' }, { id: 'stu-3', name: 'C' }];
  const seen = stubRoster(t, rows, ['stu-1', 'stu-3']);
  const res = recorder();

  await getUsers({ user: { role: 'Admin' }, query: {} }, res);

  assert.deepEqual(res.body.map((u) => u.hasPhoto), [true, false, true]);
  // The probe returns only the primary key of user_photos — never the blob column. That
  // is what keeps this second query from re-introducing the payload it exists to avoid.
  assert.deepEqual(seen.probe.attributes, ['userId']);
  // Bounded to the page, so the probe never scans wider than the response it annotates.
  const ids = seen.probe.where.userId[Object.getOwnPropertySymbols(seen.probe.where.userId)[0]];
  assert.deepEqual(ids, ['stu-1', 'stu-2', 'stu-3']);
});

test('the roster overlays derived Overdue and reports its window', async (t) => {
  stubOverdue(t, ['stu-2']);
  const rows = [
    { id: 'stu-1', name: 'A', campusStatus: 'Inside' },
    { id: 'stu-2', name: 'B', campusStatus: 'Outside' },
  ];
  stubRoster(t, rows);
  const res = recorder();

  await getUsers({ user: { role: 'Admin' }, query: {} }, res);

  assert.equal(res.body[0].campusStatus, 'Inside');
  // 'Overdue' is never stored — a pass still 'Out' past its return window derives it.
  assert.equal(res.body[1].campusStatus, 'Overdue');
  assert.ok(Array.isArray(res.body));
  assert.equal(res.headers['X-Total-Count'], '2');
  // raw:true rows skip the model's toJSON, so the controller has to apply the `_id`
  // contract by hand. Every other reader in the app depends on it being there.
  assert.equal(res.body[0]._id, 'stu-1');
});

test('getUserPhoto serves one photo and refuses a guard reading a non-student', async (t) => {
  const original = User.findByPk;
  const people = {
    'stu-1': { id: 'stu-1', role: 'Student', photo: 'data:image/jpeg;base64,AAAA' },
    'war-1': { id: 'war-1', role: 'Warden', photo: 'data:image/jpeg;base64,BBBB' },
    // No user_photos row: the virtual reads undefined, exactly as an absent Mongo field did.
    'stu-2': { id: 'stu-2', role: 'Student', photo: undefined },
  };
  User.findByPk = async (id) => people[id] || null;
  t.after(() => { User.findByPk = original; });

  const guard = { user: { role: 'Guard' } };

  const ok = recorder();
  await getUserPhoto({ ...guard, params: { id: 'stu-1' } }, ok);
  assert.equal(ok.statusCode, null);
  assert.equal(ok.body.photo, 'data:image/jpeg;base64,AAAA');
  // Private, or a shared proxy could hand one student's face to the next request.
  assert.match(ok.headers['Cache-Control'], /private/);

  // Mirrors the roster fence: the route allows Admin and Guard, so without this re-check a
  // guard could read staff photos one id at a time.
  const denied = recorder();
  await getUserPhoto({ ...guard, params: { id: 'war-1' } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.photo, undefined);

  const admin = recorder();
  await getUserPhoto({ user: { role: 'Admin' }, params: { id: 'war-1' } }, admin);
  assert.equal(admin.statusCode, null);
  assert.equal(admin.body.photo, 'data:image/jpeg;base64,BBBB');

  // A student with no photo is a 200 carrying null, not a 404 — the client falls back to
  // initials, and an error would put a red banner on a roster that is perfectly fine.
  const none = recorder();
  await getUserPhoto({ ...guard, params: { id: 'stu-2' } }, none);
  assert.equal(none.statusCode, null);
  assert.equal(none.body.photo, null);

  const missing = recorder();
  await getUserPhoto({ ...guard, params: { id: 'nobody' } }, missing);
  assert.equal(missing.statusCode, 404);
});

test('student counts are disjoint and sum to the total', async (t) => {
  stubOverdue(t, ['stu-9', 'stu-8']);
  const original = User.count;
  User.count = async ({ where }) => {
    if (where.campusStatus === 'Inside') return 30;
    if (where.campusStatus && typeof where.campusStatus === 'object') return 12;
    return 42;
  };
  t.after(() => { User.count = original; });

  const res = recorder();
  await getStudentCounts({ user: { role: 'Guard' } }, res);

  assert.equal(res.body.total, 42);
  assert.equal(res.body.inside, 30);
  // An overdue student is still stored 'Outside', so it has to come out of that bucket or
  // the dashboard tiles double-count and add up to more than the roster.
  assert.equal(res.body.overdue, 2);
  assert.equal(res.body.outside, 10);
  assert.equal(res.body.inside + res.body.outside + res.body.overdue, res.body.total);
});

test('the outside count includes rows legacy-stored as Overdue', async (t) => {
  stubOverdue(t);
  const original = User.count;
  const wheres = [];
  User.count = async ({ where }) => { wheres.push(where); return 0; };
  t.after(() => { User.count = original; });

  await getStudentCounts({ user: { role: 'Admin' } }, recorder());

  // The gate scan only ever writes 'Inside'/'Outside', but the campus_status CHECK permits
  // 'Overdue' and older rows may carry it. Counting bare 'Outside' would leave such a row
  // in `total` and in none of the three tiles.
  const outsideWhere = wheres.find(
    (w) => w.campusStatus && typeof w.campusStatus === 'object'
  );
  assert.ok(outsideWhere, 'outside bucket is not a union — a stored Overdue row vanishes');
  const values = outsideWhere.campusStatus[
    Object.getOwnPropertySymbols(outsideWhere.campusStatus)[0]
  ];
  assert.deepEqual(values, ['Outside', 'Overdue']);
});
