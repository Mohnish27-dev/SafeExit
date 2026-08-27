const test = require('node:test');
const assert = require('node:assert/strict');

const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const {
  ACTIVE_PASS_STATUSES,
  ONE_ACTIVE_OUTING_INDEX,
  ONE_ACTIVE_LEAVE_INDEX,
} = require('../src/config/passStatuses');

// The one-active-pass unique indexes are the only thing stopping two concurrent
// submissions from one student minting two live passes — the check-then-create in the
// controllers cannot close that race on its own.
//
// The failure mode these tests exist for is DRIFT, not a broken query: if someone adds a
// status to the controller's blocking list (or to the schema enum) and not to
// ACTIVE_PASS_STATUSES, the index keeps filtering on the old list. Everything still works
// in testing, the 409 still fires for sequential submits, and the race quietly reopens for
// the new status. Nothing else in the suite would notice.
//
// These assert the index SPEC only. Whether the server accepts $in inside
// partialFilterExpression is a per-server question (MongoDB 6.0+), asserted at boot by
// utils/verifyIndexes.js.

const findIndex = (model, name) =>
  model.schema.indexes().find(([, options]) => options && options.name === name);

for (const [label, model, indexName] of [
  ['outing', OutingRequest, ONE_ACTIVE_OUTING_INDEX],
  ['leave', LeaveApplication, ONE_ACTIVE_LEAVE_INDEX],
]) {
  test(`${label}: the one-active-pass index is declared, unique and partial`, () => {
    const entry = findIndex(model, indexName);
    assert.ok(entry, `${indexName} is not declared on the schema`);

    const [keys, options] = entry;
    assert.deepEqual(keys, { student: 1 }, 'must key on student alone to be one-per-student');
    assert.equal(options.unique, true, 'without unique:true the index enforces nothing');
    assert.ok(options.partialFilterExpression, 'without a partial filter it would block a second EVER request');
  });

  test(`${label}: the index filters on exactly the statuses the controller blocks on`, () => {
    const [, options] = findIndex(model, indexName);
    assert.deepEqual(
      options.partialFilterExpression,
      { status: { $in: ACTIVE_PASS_STATUSES } },
      'index filter drifted from ACTIVE_PASS_STATUSES — the index and the 409 now disagree'
    );
  });

  test(`${label}: every filtered status is a real value in the schema enum`, () => {
    // A typo here ('Approve' for 'Approved') is invisible: the index builds fine, matches
    // no document, and enforces nothing.
    const enumValues = model.schema.path('status').enumValues;
    for (const status of ACTIVE_PASS_STATUSES) {
      assert.ok(
        enumValues.includes(status),
        `'${status}' is in ACTIVE_PASS_STATUSES but not in the ${label} status enum`
      );
    }
  });

  test(`${label}: terminal statuses are NOT treated as active`, () => {
    // The inverse guard: if a terminal status ever leaks into the active list, a student
    // who returns from one outing is locked out of ever requesting another.
    for (const terminal of ['Returned', 'Rejected', 'Cancelled', 'Expired']) {
      assert.ok(
        !ACTIVE_PASS_STATUSES.includes(terminal),
        `'${terminal}' must not be active — it would permanently block new requests`
      );
    }
  });
}

test('both models filter on the same status list', () => {
  const [, outing] = findIndex(OutingRequest, ONE_ACTIVE_OUTING_INDEX);
  const [, leave] = findIndex(LeaveApplication, ONE_ACTIVE_LEAVE_INDEX);
  assert.deepEqual(
    outing.partialFilterExpression,
    leave.partialFilterExpression,
    'outing and leave must agree on what "live" means'
  );
});
