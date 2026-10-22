const { sequelize } = require('../models');

// Persist a staff decision on an outing/leave row, but only if it is STILL in one of
// `fromStatuses` when the write lands.
//
// Several people share one queue — a girl's leave goes to her caretaker, the hostel's two
// or three wardens and the chief warden at once — so two of them can open the same request
// and press Approve/Reject within the same second. The handlers read the status first, but
// a read-then-save lets both through and the second silently overwrites the first verdict.
// The conditional UPDATE is the arbiter: Postgres row-locks the row, the second UPDATE
// waits, re-checks the status after the first commits, and matches nothing. The full save
// runs in the same transaction so the verdict and its signature land together or not at
// all. The same guard makes a revocation lose cleanly to a gate scan that took the student
// Out a moment earlier.
//
// Returns false when somebody else got there first.
const saveClaimedDecision = (Model, row, fromStatuses) =>
  sequelize.transaction(async (transaction) => {
    const [claimed] = await Model.update(
      { status: row.status },
      { where: { id: row.id, status: fromStatuses }, transaction }
    );
    if (!claimed) return false;
    await row.save({ transaction });
    return true;
  });

module.exports = { saveClaimedDecision };
