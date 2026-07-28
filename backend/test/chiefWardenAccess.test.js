const test = require('node:test');
const assert = require('node:assert/strict');

const { authorizeRoles } = require('../src/middlewares/roleMiddleware');
const { HOSTEL_SCOPED_ROLES, studentInScope } = require('../src/utils/hostelScope');

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

test('ChiefWarden passes a ChiefWarden-only role guard', () => {
  const req = { user: { role: 'ChiefWarden' } };
  const res = responseRecorder();
  let nextCalled = false;

  authorizeRoles('ChiefWarden')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('a hostel Warden cannot use ChiefWarden-only endpoints', () => {
  const req = { user: { role: 'Warden' } };
  const res = responseRecorder();

  authorizeRoles('ChiefWarden')(req, res, () => assert.fail('next must not be called'));

  assert.equal(res.statusCode, 403);
});

test('ChiefWarden is campus-wide while Warden remains hostel-scoped', () => {
  const student = { hostelName: 'Kadambini', gender: 'Female' };

  assert.equal(HOSTEL_SCOPED_ROLES.includes('ChiefWarden'), false);
  assert.equal(studentInScope({ role: 'ChiefWarden' }, student), true);
  assert.equal(studentInScope({ role: 'Warden', managedHostel: 'Kautilya' }, student), false);
});
