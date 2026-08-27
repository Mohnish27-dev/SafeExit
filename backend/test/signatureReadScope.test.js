const test = require('node:test');
const assert = require('node:assert/strict');

const { canReadSignatures } = require('../src/utils/hostelScope');

// GET /:id/signatures serves the signature bytes the polled lists no longer carry, so this
// is the only gate on them. Read scope is deliberately wider than requestInScope (decide
// authority) — a warden's history spans their hostel, not just their forwarded queue.

const student = { _id: 'stu-1', gender: 'Male', hostelName: 'Aryabhatta' };
const row = (extra = {}) => ({ student: { _id: 'stu-1' }, ...extra });

test('the owning student may read their own row', () => {
  assert.equal(canReadSignatures({ _id: 'stu-1', role: 'Student' }, row(), student), true);
});

test('another student may not', () => {
  assert.equal(canReadSignatures({ _id: 'stu-2', role: 'Student' }, row(), student), false);
});

test('Admin and ChiefWarden are campus-wide', () => {
  assert.equal(canReadSignatures({ _id: 'a', role: 'Admin' }, row(), student), true);
  assert.equal(canReadSignatures({ _id: 'c', role: 'ChiefWarden' }, row(), student), true);
});

test('a Guard gets nothing — no guard view renders a signature', () => {
  assert.equal(canReadSignatures({ _id: 'g', role: 'Guard' }, row(), student), false);
});

test('the routed caretaker may read it', () => {
  const user = { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Other Hostel' };
  assert.equal(canReadSignatures(user, row({ targetCaretaker: 'ct-1' }), student), true);
});

test('a caretaker of another hostel with no routing may not', () => {
  const user = { _id: 'ct-2', role: 'Caretaker', managedHostel: 'Other Hostel' };
  assert.equal(canReadSignatures(user, row({ targetCaretaker: 'ct-1' }), student), false);
});

test('a caretaker owning the student hostel may read an unrouted legacy row', () => {
  const user = { _id: 'ct-3', role: 'Caretaker', managedHostel: 'aryabhatta' };
  assert.equal(canReadSignatures(user, row(), student), true);
});

test('the warden it was forwarded to may read it', () => {
  const user = { _id: 'w-1', role: 'Warden', managedHostel: 'Other Hostel' };
  assert.equal(canReadSignatures(user, row({ forwardedTo: 'w-1' }), student), true);
});

test('the hostel warden may read a row a caretaker decided, never forwarded to them', () => {
  const user = { _id: 'w-2', role: 'Warden', managedHostel: 'Aryabhatta' };
  assert.equal(canReadSignatures(user, row(), student), true);
});

test('a warden of another hostel may not', () => {
  const user = { _id: 'w-3', role: 'Warden', managedHostel: 'Other Hostel' };
  assert.equal(canReadSignatures(user, row(), student), false);
});

test('an unassigned warden sees nothing', () => {
  assert.equal(canReadSignatures({ _id: 'w-4', role: 'Warden' }, row(), student), false);
});

test('missing user or row is a deny, not a throw', () => {
  assert.equal(canReadSignatures(null, row(), student), false);
  assert.equal(canReadSignatures({ _id: 'a', role: 'Admin' }, null, student), false);
});
