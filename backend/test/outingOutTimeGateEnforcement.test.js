const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { User, OutingRequest, LeaveApplication } = require('../src/models');
const { previewScan, createScanLog } = require('../src/controllers/scanController');

// An outing's outTime is a DEPARTURE DEADLINE, not a start time: leaving early is fine,
// leaving after it is not. These pin that the gate enforces it even inside normal open
// hours, and that a refused exit still persists 'Expired' so the dashboards agree with
// what the guard was just told.

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

test('previewScan rejects expired outing pass whose outTime has passed even during gate open hours', async (t) => {
  const originalUserFindOne = User.findOne;
  const originalOutingFindOne = OutingRequest.findOne;
  const originalLeaveFindOne = LeaveApplication.findOne;

  const mockStudent = {
    id: crypto.randomUUID(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender: 'Male',
    campusStatus: 'Inside',
    photo: null,
  };

  const pastOutTime = new Date(Date.now() - 3600_000); // 1 hour ago
  const futureInTime = new Date(Date.now() + 7200_000); // 2 hours from now

  const mockOuting = {
    id: crypto.randomUUID(),
    studentId: mockStudent.id,
    outingType: 'General',
    outTime: pastOutTime,
    inTime: futureInTime,
    status: 'Approved',
  };

  User.findOne = async () => mockStudent;
  OutingRequest.findOne = async ({ where }) => (where.status === 'Approved' ? mockOuting : null);
  LeaveApplication.findOne = async () => null;

  t.after(() => {
    User.findOne = originalUserFindOne;
    OutingRequest.findOne = originalOutingFindOne;
    LeaveApplication.findOne = originalLeaveFindOne;
  });

  const req = { query: { studentId: 'STU12345' } };
  const res = responseRecorder();

  await previewScan(req, res);

  assert.equal(res.statusCode, null);
  assert.equal(res.body.exit.allowed, false);
  assert.equal(res.body.exit.reason, 'expired');
  assert.equal(res.body.exit.passType, 'Outing');
});

test('createScanLog rejects exit and marks pass Expired when outTime has passed', async (t) => {
  const originalUserFindOne = User.findOne;
  const originalOutingFindOne = OutingRequest.findOne;
  const originalLeaveFindOne = LeaveApplication.findOne;
  const originalOutingUpdate = OutingRequest.update;
  const originalUserUpdate = User.update;

  const mockStudent = {
    id: crypto.randomUUID(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender: 'Male',
    campusStatus: 'Inside',
  };

  let expiredWith = null;
  const pastOutTime = new Date(Date.now() - 3600_000); // 1 hour ago
  const futureInTime = new Date(Date.now() + 7200_000); // 2 hours from now

  const mockOuting = {
    id: crypto.randomUUID(),
    studentId: mockStudent.id,
    outingType: 'General',
    outTime: pastOutTime,
    inTime: futureInTime,
    status: 'Approved',
  };

  User.findOne = async () => mockStudent;
  OutingRequest.findOne = async ({ where }) => (where.status === 'Approved' ? mockOuting : null);
  LeaveApplication.findOne = async () => null;
  OutingRequest.update = async (values, options) => {
    expiredWith = { values, where: options.where };
    return [1];
  };
  // The campusStatus flip is the first write inside the scan transaction. A refused exit
  // must never reach it — the student did not move.
  User.update = async () => {
    throw new Error('User status must not be updated on expired pass');
  };

  t.after(() => {
    User.findOne = originalUserFindOne;
    OutingRequest.findOne = originalOutingFindOne;
    LeaveApplication.findOne = originalLeaveFindOne;
    OutingRequest.update = originalOutingUpdate;
    User.update = originalUserUpdate;
  });

  const req = {
    body: { studentId: 'STU12345', direction: 'OUT' },
    user: { _id: crypto.randomUUID(), role: 'Guard' },
  };
  const res = responseRecorder();

  await createScanLog(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /This outing pass has expired/);
  assert.equal(res.body.campusStatus, 'Inside');

  // The refusal still persists 'Expired', so the caretaker dashboard shows the same thing
  // the gate just enforced. That write deliberately sits OUTSIDE the scan transaction —
  // rolling it back with the denial would put the two views back out of step.
  assert.equal(expiredWith.values.status, 'Expired');
  assert.equal(expiredWith.where.id, mockOuting.id);
  // Guarded on the current status, so it can never expire a pass that a concurrent scan
  // has already taken to 'Out'.
  assert.equal(expiredWith.where.status, 'Approved');
});
