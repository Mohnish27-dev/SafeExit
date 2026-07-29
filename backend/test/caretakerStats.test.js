const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
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

test('caretaker live stats return only the out count for the assigned hostel', async (t) => {
  const originalCountDocuments = User.countDocuments;
  let receivedFilter;
  let receivedCollation;

  User.countDocuments = (filter) => {
    receivedFilter = filter;
    return {
      collation: async (collation) => {
        receivedCollation = collation;
        return 4;
      },
    };
  };
  t.after(() => { User.countDocuments = originalCountDocuments; });

  const req = { user: { role: 'Caretaker', managedHostel: '  Kautilya  ' } };
  const res = responseRecorder();

  await getCaretakerStats(req, res);

  assert.deepEqual(receivedFilter, {
    role: 'Student',
    hostelName: 'Kautilya',
    campusStatus: { $in: ['Outside', 'Overdue'] },
  });
  assert.deepEqual(receivedCollation, { locale: 'en', strength: 2 });
  assert.deepEqual(res.body, { outNow: 4 });
  assert.deepEqual(Object.keys(res.body), ['outNow']);
});

test('an unassigned caretaker sees zero instead of students from other hostels', async (t) => {
  const originalCountDocuments = User.countDocuments;
  let queried = false;

  User.countDocuments = () => {
    queried = true;
    throw new Error('must not query without a managed hostel');
  };
  t.after(() => { User.countDocuments = originalCountDocuments; });

  const req = { user: { role: 'Caretaker', managedGender: 'Male' } };
  const res = responseRecorder();

  await getCaretakerStats(req, res);

  assert.equal(queried, false);
  assert.deepEqual(res.body, { outNow: 0 });
});
