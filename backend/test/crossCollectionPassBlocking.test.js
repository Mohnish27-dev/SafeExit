const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { User, OutingRequest, LeaveApplication } = require('../src/models');
const { createLeaveApplication } = require('../src/controllers/leaveController');

// one_active_outing_per_student and one_active_leave_per_student are separate partial
// unique indexes on separate tables, so the rule between an outing and a leave lives in
// application code.
//
// Outings have no request step now: the gate's exit scan creates them, and it leaves on a
// valid approved leave instead whenever there is one (test/outingAtGate.test.js). So an
// approved leave for a later day and an outing today may coexist — that is intended. What
// must still be refused is applying for leave while out on an outing, and a request left
// open by the old outing flow must NOT block a leave (the leave departure burns it).

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

const leaveRequest = (studentId) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const returnDate = new Date(tomorrow);
  returnDate.setDate(returnDate.getDate() + 2);

  return {
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
      parentPhone: '9876543210',
      acknowledgement: true,
    },
  };
};

test('createLeaveApplication rejects with 409 while the student is out on an outing', async (t) => {
  const restoreSignature = stubSignature();
  const originalLeaveFindAll = LeaveApplication.findAll;
  const originalOutingFindOne = OutingRequest.findOne;
  t.after(() => {
    restoreSignature();
    LeaveApplication.findAll = originalLeaveFindAll;
    OutingRequest.findOne = originalOutingFindOne;
  });

  const studentId = crypto.randomUUID();
  const queried = [];
  LeaveApplication.findAll = async () => [];
  OutingRequest.findOne = async ({ where }) => {
    queried.push(where.status);
    return { id: crypto.randomUUID(), studentId, status: 'Out' };
  };

  const res = responseRecorder();
  await createLeaveApplication(leaveRequest(studentId), res);

  assert.equal(res.statusCode, 409, 'must return 409 Conflict');
  assert.match(res.body.message, /outing in progress/i, 'must inform user of the live outing');
  assert.equal(res.body.status, 'Out');
  assert.deepEqual(queried, ['Out'], 'only a live outing is looked for');
});

test("createLeaveApplication requires the parent's number as exactly 10 digits", async () => {
  for (const parentPhone of [undefined, '', '987654321', '98765432100', '98765 43210', '+919876543210', 'abcdefghij']) {
    const req = leaveRequest(crypto.randomUUID());
    req.body.parentPhone = parentPhone;
    const res = responseRecorder();
    await createLeaveApplication(req, res);
    assert.equal(res.statusCode, 400, `accepted ${JSON.stringify(parentPhone)}`);
    assert.match(res.body.message, /10-digit/);
  }
});
