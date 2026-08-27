const mongoose = require('mongoose');
const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const {
  ACTIVE_PASS_STATUSES,
  ONE_ACTIVE_OUTING_INDEX,
  ONE_ACTIVE_LEAVE_INDEX,
} = require('../config/passStatuses');

// Proves the two correctness-critical indexes actually exist before the app starts taking
// traffic.
//
// WHY THIS IS NOT PARANOIA: the one-active-pass indexes use $in inside
// partialFilterExpression, which only MongoDB 6.0+ accepts. Mongoose's autoIndex fires the
// createIndex in the background and does not block startup on it, so on an older server
// the build fails, the app boots normally, every endpoint works, and the double-submit
// race that the index exists to close is silently wide open. The same silent failure
// happens when existing data already violates the constraint (a student with two active
// rows from before the index existed).
//
// Neither case is detectable by testing the happy path, so it is asserted here instead.

const REQUIRED = [
  { model: OutingRequest, indexName: ONE_ACTIVE_OUTING_INDEX, label: 'outing requests' },
  { model: LeaveApplication, indexName: ONE_ACTIVE_LEAVE_INDEX, label: 'leave applications' },
];

// Which students already hold more than one active row — the thing that makes a unique
// index build fail. Reported with ids so the data can actually be fixed.
const findDuplicateHolders = async (model) => {
  const rows = await model.aggregate([
    { $match: { status: { $in: ACTIVE_PASS_STATUSES } } },
    { $group: { _id: '$student', count: { $sum: 1 }, ids: { $push: '$_id' }, statuses: { $push: '$status' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows;
};

const describeFailure = async (model, label, err) => {
  const lines = [];
  const message = String((err && err.message) || err);

  // Mongo reports a pre-existing-duplicates build failure as a plain duplicate key error.
  if (err && (err.code === 11000 || /duplicate key/i.test(message))) {
    lines.push(`  cause: existing data already violates it — some students hold two active ${label}.`);
    try {
      const dupes = await findDuplicateHolders(model);
      lines.push(`  ${dupes.length} student(s) affected. Run scripts/checkActivePassDuplicates.js for the full list.`);
      for (const d of dupes.slice(0, 5)) {
        lines.push(`    student ${d._id}: ${d.count} active [${d.statuses.join(', ')}]`);
      }
    } catch {
      lines.push('  (could not enumerate the offending rows)');
    }
    lines.push('  fix: resolve the extra rows (cancel/expire them), then restart.');
  } else if (/partialFilterExpression|unsupported|BadValue/i.test(message)) {
    // The MongoDB < 6.0 case.
    lines.push('  cause: this MongoDB server rejects $in inside partialFilterExpression.');
    lines.push('  fix: $in in a partial index needs MongoDB 6.0+. Upgrade the server, or');
    lines.push('       replace the partial filter with a maintained boolean field.');
  } else {
    lines.push(`  cause: ${message}`);
  }
  return lines;
};

// Resolves to true when every required index is present. Never throws: the caller decides
// whether a missing guard should stop the boot (see config/validateEnv.js precedent for
// fail-fast, and server.js for how this one is treated).
const verifyIndexes = async () => {
  let allPresent = true;

  for (const { model, indexName, label } of REQUIRED) {
    let buildError = null;

    // init() is what waits on the autoIndex build for this model; without awaiting it the
    // check below races the build and reports a false negative on a cold database.
    try {
      await model.init();
    } catch (err) {
      buildError = err;
    }

    let present = false;
    try {
      const existing = await model.collection.indexes();
      present = existing.some((ix) => ix.name === indexName);
    } catch (err) {
      // Collection genuinely absent on a first-ever boot: nothing written yet, so no race
      // to lose. The index builds with the first insert.
      if (err && (err.codeName === 'NamespaceNotFound' || err.code === 26)) {
        console.log(`[indexes] ${label}: collection not created yet; ${indexName} will build on first write.`);
        continue;
      }
      buildError = buildError || err;
    }

    if (present) continue;

    allPresent = false;
    console.error(
      `\n[indexes] MISSING: ${indexName} on ${label}.\n` +
        `  effect: two concurrent submissions from one student can both succeed —\n` +
        `          two live passes, which the gate will honour as two valid exits.`
    );
    for (const line of await describeFailure(model, label, buildError)) {
      console.error(line);
    }
    console.error('');
  }

  return allPresent;
};

module.exports = { verifyIndexes, findDuplicateHolders, REQUIRED };
