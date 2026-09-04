const test = require('node:test');
const assert = require('node:assert/strict');

const { requestInScope } = require('../src/utils/hostelScope');

const student = { _id: 'stu-1', gender: 'Male', hostelName: 'Aryabhatta' };
const baseRequest = { _id: 'req-1', student: 'stu-1' };

test('null or undefined user has no decision authority', () => {
  assert.equal(requestInScope(null, baseRequest, student), false);
  assert.equal(requestInScope(undefined, baseRequest, student), false);
});

test('Admin is campus-wide unrestricted for decision scope', () => {
  const admin = { _id: 'admin-1', role: 'Admin' };
  assert.equal(requestInScope(admin, baseRequest, student), true);
});

test('Guard has NO decision authority over any outing or leave request', () => {
  const guard = { _id: 'guard-1', role: 'Guard' };
  assert.equal(requestInScope(guard, baseRequest, student), false);
  assert.equal(requestInScope(guard, { ...baseRequest, targetCaretaker: 'guard-1' }, student), false);
});

test('Student has NO decision authority over requests', () => {
  const stu = { _id: 'stu-1', role: 'Student' };
  assert.equal(requestInScope(stu, baseRequest, student), false);
});

test('ChiefWarden has oversight but no direct request decision scope', () => {
  const chief = { _id: 'chief-1', role: 'ChiefWarden' };
  assert.equal(requestInScope(chief, baseRequest, student), false);
});

test('Warden can decide ONLY requests forwarded directly to them', () => {
  const warden1 = { _id: 'w-1', role: 'Warden', managedHostel: 'Aryabhatta' };
  const warden2 = { _id: 'w-2', role: 'Warden', managedHostel: 'Aryabhatta' };

  const forwardedReq = { ...baseRequest, forwardedTo: 'w-1' };
  assert.equal(requestInScope(warden1, forwardedReq, student), true);
  assert.equal(requestInScope(warden2, forwardedReq, student), false);
  assert.equal(requestInScope(warden1, baseRequest, student), false);
});

test('Caretaker targeted explicitly can decide the request', () => {
  const caretaker1 = { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Aryabhatta' };
  const caretaker2 = { _id: 'ct-2', role: 'Caretaker', managedHostel: 'Aryabhatta' };

  const targetedReq = { ...baseRequest, targetCaretaker: 'ct-1' };
  assert.equal(requestInScope(caretaker1, targetedReq, student), true);
  assert.equal(requestInScope(caretaker2, targetedReq, student), false);
});

test('Caretaker with untargeted request checks student hostel scope', () => {
  const ownHostelCaretaker = { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Aryabhatta' };
  const otherHostelCaretaker = { _id: 'ct-2', role: 'Caretaker', managedHostel: 'Bhaskara' };

  assert.equal(requestInScope(ownHostelCaretaker, baseRequest, student), true);
  assert.equal(requestInScope(otherHostelCaretaker, baseRequest, student), false);
});
