const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { User, OutingRequest, LeaveApplication } = require('../src/models');
const { createOutingRequest } = require('../src/controllers/outingController');
const { createLeaveApplication } = require('../src/controllers/leaveController');

// The KNOWN GAP, pinned deliberately.
//
// one_active_outing_per_student and one_active_leave_per_student are separate partial
// unique indexes on separate tables, so neither can stop a student holding one active
// outing AND one active leave at the same time. That rule lives in application code, and
// these two tests are what keeps it there — they were the only thing guarding it under
// MongoDB and they still are.
//
// Postgres CAN close it properly (a shared active_pass_locks table keyed on student_id,
// written inside the same transaction as the pass), which is noted in
// db/postgres/001_schema.sql as a deliberate post-cutover decision rather than something
// to bundle into the port. Until then, if these tests are ever deleted the cross-pass rule
// is unguarded.

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

// fetchOwnSignature reads the user's signature from its own table now, so this is the
// seam rather than a projected field on the user document.
const stubSignature = () => {
  const original = User.getSignature;
  User.getSignature = async () => mockSignature;
  return () => { User.getSignature = original; };
};

test('createOutingRequest rejects with 409 when student already has an active LeaveApplication', async () => {
  const restoreSignature = stubSignature();
  const originalOutingFindAll = OutingRequest.findAll;
  const originalLeaveFindAll = LeaveApplication.findAll;

  const studentId = crypto.randomUUID();
  const req = {
    user: {
      _id: studentId,
      campusStatus: 'Inside',
      gender: 'Male',
      hostelName: 'Kautilya',
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
    OutingRequest.findAll = async () => [];
    LeaveApplication.findAll = async () => [
      {
        id: crypto.randomUUID(),
        studentId,
        status: 'Approved',
        leaveDate: new Date(Date.now() + 86400_000),
      },
    ];

    await createOutingRequest(req, res);

    assert.equal(res.statusCode, 409, 'must return 409 Conflict');
    assert.match(res.body.message, /active leave/i, 'must inform user of active leave');
    assert.equal(res.body.status, 'Approved');
  } finally {
    restoreSignature();
    OutingRequest.findAll = originalOutingFindAll;
    LeaveApplication.findAll = originalLeaveFindAll;
  }
});

test('createLeaveApplication rejects with 409 when student already has an active OutingRequest', async () => {
  const restoreSignature = stubSignature();
  const originalLeaveFindAll = LeaveApplication.findAll;
  const originalOutingFindAll = OutingRequest.findAll;

  const studentId = crypto.randomUUID();
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
      hostelName: 'Kautilya',
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
    LeaveApplication.findAll = async () => [];
    OutingRequest.findAll = async () => [
      {
        id: crypto.randomUUID(),
        studentId,
        status: 'Approved',
        outTime: new Date(Date.now() + 3600_000),
      },
    ];

    await createLeaveApplication(req, res);

    assert.equal(res.statusCode, 409, 'must return 409 Conflict');
    assert.match(res.body.message, /active outing/i, 'must inform user of active outing');
    assert.equal(res.body.status, 'Approved');
  } finally {
    restoreSignature();
    LeaveApplication.findAll = originalLeaveFindAll;
    OutingRequest.findAll = originalOutingFindAll;
  }
});
