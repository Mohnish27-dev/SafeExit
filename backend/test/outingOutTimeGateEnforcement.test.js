const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const { previewScan, createScanLog } = require('../src/controllers/scanController');

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
  const originalUserFind = User.findOne;
  const originalOutingFindOne = OutingRequest.findOne;
  const originalLeaveFindOne = LeaveApplication.findOne;

  const mockStudent = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender: 'Male',
    campusStatus: 'Inside',
    photo: null,
  };

  const pastOutTime = new Date(Date.now() - 3600_000); // 1 hour ago
  const futureInTime = new Date(Date.now() + 7200_000); // 2 hours from now

  const mockOuting = {
    _id: new mongoose.Types.ObjectId(),
    student: mockStudent._id,
    outingType: 'General',
    outTime: pastOutTime,
    inTime: futureInTime,
    status: 'Approved',
  };

  User.findOne = () => mockStudent;
  OutingRequest.findOne = () => ({
    sort: () => mockOuting,
  });
  LeaveApplication.findOne = () => ({
    sort: () => null,
  });

  t.after(() => {
    User.findOne = originalUserFind;
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
  const originalUserFind = User.findOne;
  const originalOutingFindOne = OutingRequest.findOne;
  const originalLeaveFindOne = LeaveApplication.findOne;
  const originalUserFindOneAndUpdate = User.findOneAndUpdate;

  const mockStudent = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender: 'Male',
    campusStatus: 'Inside',
  };

  let savedStatus = null;
  const pastOutTime = new Date(Date.now() - 3600_000); // 1 hour ago
  const futureInTime = new Date(Date.now() + 7200_000); // 2 hours from now

  const mockOuting = {
    _id: new mongoose.Types.ObjectId(),
    student: mockStudent._id,
    outingType: 'General',
    outTime: pastOutTime,
    inTime: futureInTime,
    status: 'Approved',
    save: async () => {
      savedStatus = mockOuting.status;
    },
  };

  User.findOne = () => mockStudent;
  OutingRequest.findOne = () => ({
    sort: () => mockOuting,
  });
  LeaveApplication.findOne = () => ({
    sort: () => null,
  });
  User.findOneAndUpdate = () => {
    throw new Error('User status must not be updated on expired pass');
  };

  t.after(() => {
    User.findOne = originalUserFind;
    OutingRequest.findOne = originalOutingFindOne;
    LeaveApplication.findOne = originalLeaveFindOne;
    User.findOneAndUpdate = originalUserFindOneAndUpdate;
  });

  const req = {
    body: { studentId: 'STU12345', direction: 'OUT' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'Guard' },
  };
  const res = responseRecorder();

  await createScanLog(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(savedStatus, 'Expired');
  assert.match(res.body.message, /This outing pass has expired/);
  assert.equal(res.body.campusStatus, 'Inside');
});
