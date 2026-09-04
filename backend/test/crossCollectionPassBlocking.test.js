const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const { createOutingRequest } = require('../src/controllers/outingController');
const { createLeaveApplication } = require('../src/controllers/leaveController');

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

const mockSignature = 'data:image/png;base64,' + 'A'.repeat(50);

test('createOutingRequest rejects with 409 when student already has an active LeaveApplication', async () => {
  const originalUserFindById = User.findById;
  const originalOutingFind = OutingRequest.find;
  const originalLeaveFind = LeaveApplication.find;

  const studentId = new mongoose.Types.ObjectId();
  const req = {
    user: {
      _id: studentId,
      campusStatus: 'Inside',
      gender: 'Male',
      hostelName: 'Bhabha',
    },
    body: {
      destination: 'Market',
      purpose: 'Shopping',
      outTime: new Date(Date.now() + 3600_000),
      outingType: 'General',
    },
  };
  const res = responseRecorder();

  try {
    User.findById = () => ({
      select: () => ({
        lean: () => Promise.resolve({ signature: mockSignature }),
      }),
    });
    OutingRequest.find = () => ({
      then: (resolve) => resolve([]),
    });
    LeaveApplication.find = () => ({
      then: (resolve) =>
        resolve([
          {
            _id: new mongoose.Types.ObjectId(),
            student: studentId,
            status: 'Approved',
            leaveDate: new Date(Date.now() + 86400_000),
          },
        ]),
    });

    await createOutingRequest(req, res);

    assert.equal(res.statusCode, 409, 'must return 409 Conflict');
    assert.match(res.body.message, /active leave/i, 'must inform user of active leave');
    assert.equal(res.body.status, 'Approved');
  } finally {
    User.findById = originalUserFindById;
    OutingRequest.find = originalOutingFind;
    LeaveApplication.find = originalLeaveFind;
  }
});

test('createLeaveApplication rejects with 409 when student already has an active OutingRequest', async () => {
  const originalUserFindById = User.findById;
  const originalLeaveFind = LeaveApplication.find;
  const originalOutingFind = OutingRequest.find;

  const studentId = new mongoose.Types.ObjectId();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const returnDate = new Date(tomorrow);
  returnDate.setDate(returnDate.getDate() + 2);

  const req = {
    user: {
      _id: studentId,
      campusStatus: 'Inside',
      gender: 'Male',
      hostelName: 'Bhabha',
    },
    body: {
      destination: 'Home',
      reason: 'Vacation',
      leaveDate: tomorrow.toISOString(),
      returnDate: returnDate.toISOString(),
      acknowledgement: true,
    },
  };
  const res = responseRecorder();

  try {
    User.findById = () => ({
      select: () => ({
        lean: () => Promise.resolve({ signature: mockSignature }),
      }),
    });
    LeaveApplication.find = () => ({
      then: (resolve) => resolve([]),
    });
    OutingRequest.find = () => ({
      then: (resolve) =>
        resolve([
          {
            _id: new mongoose.Types.ObjectId(),
            student: studentId,
            status: 'Approved',
            outTime: new Date(Date.now() + 3600_000),
          },
        ]),
    });

    await createLeaveApplication(req, res);

    assert.equal(res.statusCode, 409, 'must return 409 Conflict');
    assert.match(res.body.message, /active outing/i, 'must inform user of active outing');
    assert.equal(res.body.status, 'Approved');
  } finally {
    User.findById = originalUserFindById;
    LeaveApplication.find = originalLeaveFind;
    OutingRequest.find = originalOutingFind;
  }
});
