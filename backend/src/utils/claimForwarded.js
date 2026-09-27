const { sequelize } = require('../models');

// Persist a warden's decision on a Forwarded outing/leave row, but only if it is STILL
// Forwarded when the write lands.
//
// A hostel has two or three wardens sharing one queue, so two of them can open the same
// request and press Approve/Reject within the same second. The handlers read the status
// first, but a read-then-save lets both through and the second silently overwrites the
// first verdict. The conditional UPDATE is the arbiter: Postgres row-locks the row, the
// second UPDATE waits, re-checks `status = 'Forwarded'` after the first commits, and
// matches nothing. The full save runs in the same transaction so the verdict and its
// signature land together or not at all.
//
// Returns false when another warden got there first.
const saveWardenDecision = (Model, row) =>
  sequelize.transaction(async (transaction) => {
    const [claimed] = await Model.update(
      { status: row.status },
      { where: { id: row.id, status: 'Forwarded' }, transaction }
    );
    if (!claimed) return false;
    await row.save({ transaction });
    return true;
  });

module.exports = { saveWardenDecision };
