const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const { sequelize, User } = require('../src/models');
const { getCaretakerStats } = require('../src/controllers/caretakerController');

const responseRecorder = () => {
  const result = { statusCode: null, body: null };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  return result;
};

// Renders a Sequelize `where` to the SQL it will actually produce. Stronger than the
// assertion this replaces: the Mongo version checked that a collation OBJECT was passed,
// which proved the call was made but not that it matched anything. This proves the
// predicate is spelled the way users_role_hostel_ci is built — `lower(hostel_name) = ...`
// — which is the difference between an index scan and a sequential one.
const renderWhere = (where) => {
  const qg = sequelize.dialect.queryGenerator || sequelize.getQueryInterface().queryGenerator;
  return qg.whereQuery(where, { model: User });
};

test('caretaker live stats return only the out count for the assigned hostel', async (t) => {
  const originalCount = User.count;
  let received;

  User.count = async (options) => {
    received = options;
    return 4;
  };
  t.after(() => { User.count = originalCount; });

  const req = { user: { role: 'Caretaker', managedHostel: '  Kautilya  ' } };
  const res = responseRecorder();

  await getCaretakerStats(req, res);

  assert.equal(received.where.role, 'Student');
  assert.deepEqual(received.where.campusStatus, { [Op.in]: ['Outside', 'Overdue'] });

  // Case-insensitive, and case-insensitive the way the index is built. A caretaker whose
  // managedHostel is stored as "kautilya" must still see their own hostel's students; the
  // whole hostel silently reading as empty is the failure this guards.
  const sql = renderWhere(received.where);
  assert.match(sql, /lower\("hostel_name"\)\s*=\s*'kautilya'/,
    `expected a lower() hostel comparison, got: ${sql}`);

  // No identities, ever: the caretaker tile is a number.
  assert.deepEqual(res.body, { outNow: 4 });
  assert.deepEqual(Object.keys(res.body), ['outNow']);
});

test('an unassigned caretaker sees zero instead of students from other hostels', async (t) => {
  const originalCount = User.count;
  let queried = false;

  User.count = async () => {
    queried = true;
    throw new Error('must not query without a managed hostel');
  };
  t.after(() => { User.count = originalCount; });

  const req = { user: { role: 'Caretaker', managedGender: 'Male' } };
  const res = responseRecorder();

  await getCaretakerStats(req, res);

  assert.equal(queried, false);
  assert.deepEqual(res.body, { outNow: 0 });
});
