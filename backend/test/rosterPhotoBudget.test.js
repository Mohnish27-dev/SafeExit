const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const { getUsers, getUserPhoto, getStudentCounts } = require('../src/controllers/adminController');

// A roster row is a few hundred bytes; a stored face photo is a base64 data URL of a few
// hundred KILObytes. Selecting `photo` on a list endpoint therefore multiplies the response
// by ~1000x — and the security dashboard used to poll exactly that endpoint every 15
// seconds. These tests pin the three properties that keep it cheap:
//
//   1. no list projection may name `photo`, for any role
//   2. the presence probe transfers ids only, scoped to the page
//   3. the bytes come from a per-row endpoint that re-checks authorisation
//
// Property 1 is the one worth a test rather than a comment: it is a single word in a long
// projection string, and adding it back would look like a harmless field addition.

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

// Stubs the two collections getOverdueStudentIds reads. adminController destructures that
// helper at require time, so patching utils/overdue would not be seen — the honest seam is
// the queries it actually makes.
const stubOverdue = (t, outStudentIds = []) => {
  const originalOuting = OutingRequest.find;
  const originalLeave = LeaveApplication.find;
  const past = new Date(Date.now() - 60 * 60 * 1000);

  OutingRequest.find = () => ({
    select: () => ({ lean: async () => outStudentIds.map((id) => ({ student: id, inTime: past })) }),
  });
  LeaveApplication.find = () => ({ select: () => ({ lean: async () => [] }) });

  t.after(() => {
    OutingRequest.find = originalOuting;
    LeaveApplication.find = originalLeave;
  });
};

// getUsers calls User.find twice: the page query, and the ids-only photo probe. They are
// told apart by the probe's `_id` filter.
const stubUserFind = (t, rows, photoOwnerIds = []) => {
  const original = User.find;
  const seen = { pageFilter: null, pageProjection: null, probeFilter: null, probeProjection: null };

  User.find = (filter) => {
    if (filter && filter._id) {
      seen.probeFilter = filter;
      return {
        select: (projection) => {
          seen.probeProjection = projection;
          return { lean: async () => photoOwnerIds.map((id) => ({ _id: id })) };
        },
      };
    }
    seen.pageFilter = filter;
    const chain = {
      select: (projection) => { seen.pageProjection = projection; return chain; },
      sort: () => chain,
      skip: () => chain,
      limit: () => chain,
      lean: async () => rows.map((r) => ({ ...r })),
    };
    return chain;
  };

  t.after(() => { User.find = original; });
  return seen;
};

test('the roster projection never carries photo bytes, for either role', async (t) => {
  stubOverdue(t);
  const rows = [{ _id: 'stu-1', name: 'Asha Kumari' }];

  for (const role of ['Guard', 'Admin']) {
    const seen = stubUserFind(t, rows);
    const res = recorder();
    await getUsers({ user: { role }, query: {} }, res);

    assert.equal(res.statusCode, null, `${role} request failed`);
    assert.ok(seen.pageProjection, `${role} made no page query`);
    // The whole point. A projection is a space-separated field list, so a substring check
    // is exact enough and catches it wherever in the string it is added.
    assert.ok(
      !seen.pageProjection.includes('photo'),
      `${role} projection selects photo bytes: ${seen.pageProjection}`
    );
    // And nothing leaks through the response either.
    assert.equal(res.body[0].photo, undefined);
  }
});

test('a guard is pinned to students and to non-confidential fields', async (t) => {
  stubOverdue(t);
  const seen = stubUserFind(t, [{ _id: 'stu-1', name: 'Asha Kumari' }]);
  const res = recorder();

  // Asking for staff explicitly must not widen the guard's view.
  await getUsers({ user: { role: 'Guard' }, query: { role: 'Warden' } }, res);

  assert.equal(seen.pageFilter.role, 'Student');
  for (const confidential of ['email', 'phoneNumber', 'photo']) {
    assert.ok(!seen.pageProjection.includes(confidential), `guard can read ${confidential}`);
  }
});

test('hasPhoto is derived from an ids-only probe scoped to the page', async (t) => {
  stubOverdue(t);
  const rows = [{ _id: 'stu-1', name: 'A' }, { _id: 'stu-2', name: 'B' }, { _id: 'stu-3', name: 'C' }];
  const seen = stubUserFind(t, rows, ['stu-1', 'stu-3']);
  const res = recorder();

  await getUsers({ user: { role: 'Admin' }, query: {} }, res);

  assert.deepEqual(res.body.map((u) => u.hasPhoto), [true, false, true]);
  // The filter examines `photo` server-side, but the projection must return only ObjectIds:
  // that is what keeps this second query from re-introducing the payload it exists to avoid.
  assert.equal(seen.probeProjection, '_id');
  // Bounded to the page, so the probe never scans wider than the response it annotates.
  assert.deepEqual(seen.probeFilter._id, { $in: ['stu-1', 'stu-2', 'stu-3'] });
});

test('the roster overlays derived Overdue and reports its window', async (t) => {
  stubOverdue(t, ['stu-2']);
  const rows = [
    { _id: 'stu-1', name: 'A', campusStatus: 'Inside' },
    { _id: 'stu-2', name: 'B', campusStatus: 'Outside' },
  ];
  stubUserFind(t, rows);
  const res = recorder();

  await getUsers({ user: { role: 'Admin' }, query: {} }, res);

  assert.equal(res.body[0].campusStatus, 'Inside');
  // 'Overdue' is never stored — a pass still 'Out' past its return window derives it.
  assert.equal(res.body[1].campusStatus, 'Overdue');
  assert.ok(Array.isArray(res.body));
  assert.equal(res.headers['X-Total-Count'], '2');
});

test('getUserPhoto serves one photo and refuses a guard reading a non-student', async (t) => {
  const original = User.findById;
  const people = {
    'stu-1': { role: 'Student', photo: 'data:image/jpeg;base64,AAAA' },
    'war-1': { role: 'Warden', photo: 'data:image/jpeg;base64,BBBB' },
    'stu-2': { role: 'Student', photo: '' },
  };
  User.findById = (id) => ({ select: () => ({ lean: async () => people[id] || null }) });
  t.after(() => { User.findById = original; });

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
  const original = User.countDocuments;
  User.countDocuments = async (filter) => {
    if (filter.campusStatus === 'Inside') return 30;
    if (filter.campusStatus && filter.campusStatus.$in) return 12;
    return 42;
  };
  t.after(() => { User.countDocuments = original; });

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
  const original = User.countDocuments;
  const filters = [];
  User.countDocuments = async (filter) => { filters.push(filter); return 0; };
  t.after(() => { User.countDocuments = original; });

  await getStudentCounts({ user: { role: 'Admin' } }, recorder());

  // The gate scan only ever writes 'Inside'/'Outside', but the User enum permits 'Overdue'
  // and older rows may carry it. Counting bare 'Outside' would leave such a row in `total`
  // and in none of the three tiles.
  const outsideFilter = filters.find((f) => f.campusStatus && f.campusStatus.$in);
  assert.ok(outsideFilter, 'outside bucket is not a union — a stored Overdue row vanishes');
  assert.deepEqual(outsideFilter.campusStatus.$in, ['Outside', 'Overdue']);
});
