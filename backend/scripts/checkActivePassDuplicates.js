// Reports students who hold more than one active outing request or leave application.
//
// Run this BEFORE deploying the one-active-pass unique indexes (models/OutingRequest.js,
// models/LeaveApplication.js). Those index builds fail outright if the data already
// violates them, and a failed build is silent — the app boots fine with the double-submit
// race still open. utils/verifyIndexes.js catches that at startup, but fixing the data
// first is the cheaper order.
//
//   cd backend && node scripts/checkActivePassDuplicates.js
//
// Read-only. It prints what to fix and exits non-zero if anything needs fixing, so it can
// gate a deploy step.

require('dotenv').config();
const mongoose = require('mongoose');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const { findDuplicateHolders } = require('../src/utils/verifyIndexes');
const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');

const report = async (model, label) => {
  const dupes = await findDuplicateHolders(model);
  if (!dupes.length) {
    console.log(`OK  ${label}: no student holds more than one active row.`);
    return 0;
  }

  console.log(`\nPROBLEM  ${label}: ${dupes.length} student(s) hold more than one active row.`);
  for (const d of dupes) {
    console.log(`  student ${d._id} — ${d.count} active`);
    // Print each row so a human can decide which one is the real pass. Deliberately not
    // auto-fixed: picking a winner is a hostel-office decision, not a script's.
    const rows = await model
      .find({ _id: { $in: d.ids } })
      .select('_id status createdAt destination')
      .sort({ createdAt: 1 })
      .lean();
    for (const r of rows) {
      console.log(
        `      ${r._id}  ${String(r.status).padEnd(9)}  created ${new Date(r.createdAt).toISOString()}` +
          `  ${r.destination || ''}`
      );
    }
  }
  return dupes.length;
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Run this from the backend/ directory with its .env in place.');
    process.exit(2);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected. Active statuses treated as live: ${ACTIVE_PASS_STATUSES.join(', ')}\n`);

  const problems =
    (await report(OutingRequest, 'outing requests')) + (await report(LeaveApplication, 'leave applications'));

  await mongoose.disconnect();

  if (problems) {
    console.log(
      '\nResolve the extra rows (cancel or expire the ones that are not the real pass),\n' +
        'then re-run this script. The unique indexes cannot build until it comes back clean.'
    );
    process.exit(1);
  }
  console.log('\nClean — the one-active-pass indexes can build.');
};

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(2);
});
