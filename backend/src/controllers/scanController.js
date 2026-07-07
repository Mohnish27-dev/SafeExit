const mongoose = require('mongoose');
const ScanLog = require('../models/ScanLog');
const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');

// Escape a user-supplied string for safe use inside a RegExp.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Record a gate scan (entry/exit) for a student
// @route   POST /api/scan
// @access  Private (Guard / Admin)
// Body: { studentId (roll number) OR student (_id), direction: 'IN'|'OUT',
//         outing?, punctuality?, gate? }
//
// Gate enforcement: an OUT (exit) scan is only allowed against an outing pass
// whose `status` is actually 'Approved' in the DB — whether that approval came
// from a warden or from the auto-approval rule at creation time (see
// outingController.createOutingRequest). We never trust a client-supplied
// status for this; it's always re-checked here against the database.
const createScanLog = async (req, res) => {
  const { studentId, student, direction, outing, punctuality, gate } = req.body;

  if (!direction || !['IN', 'OUT'].includes(direction)) {
    return res.status(400).json({ message: 'A valid direction (IN/OUT) is required' });
  }

  try {
    // Resolve the student. Prefer the immutable Mongo _id when the QR carries it;
    // otherwise fall back to the roll number with a trimmed, case-insensitive match
    // so a stray space or case difference in the QR doesn't wrongly 404.
    let studentDoc = null;
    if (student && mongoose.isValidObjectId(student)) {
      studentDoc = await User.findById(student);
    }
    if (!studentDoc && studentId) {
      const roll = String(studentId).trim();
      if (roll) {
        studentDoc = await User.findOne({
          role: 'Student',
          studentId: { $regex: `^${escapeRegex(roll)}$`, $options: 'i' },
        });
      }
    }

    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    // Gate rule for exits: a student may only be marked OUT against a warden-
    // Approved outing pass. We resolve the pass here (newest approved first, to
    // match the QR, which surfaces the latest approved request) so the decision is
    // made server-side and can't be bypassed by a tampered/absent QR status. IN
    // scans stay permissive — never trap a student outside for a missing record.
    let linkedOuting = null;
    if (direction === 'OUT') {
      linkedOuting = await OutingRequest.findOne({
        student: studentDoc._id,
        status: 'Approved',
      }).sort({ createdAt: -1 });

      if (!linkedOuting) {
        return res.status(403).json({
          message:
            'This student has no warden-approved outing pass. Exit denied until a request is approved.',
          campusStatus: studentDoc.campusStatus,
        });
      }
    }

    // Enforce the entry/exit state machine: a scan must actually change the
    // student's location. You can only be logged OUT if you're currently Inside,
    // and only logged IN if you're currently Outside/Overdue. Without this, a
    // guard could scan the same direction repeatedly and stack duplicate logs.
    //
    // We flip the status with an atomic conditional update (gated on the allowed
    // "from" states) so it doubles as a lock — two near-simultaneous scans can't
    // both pass, since only the first one matches the filter and mutates the row.
    const newStatus =
      direction === 'OUT' ? (punctuality === 'Overdue' ? 'Overdue' : 'Outside') : 'Inside';
    const allowedFrom = direction === 'OUT' ? ['Inside'] : ['Outside', 'Overdue'];

    const updatedStudent = await User.findOneAndUpdate(
      { _id: studentDoc._id, campusStatus: { $in: allowedFrom } },
      { campusStatus: newStatus, lastSeenAt: new Date() },
      { new: true }
    );

    if (!updatedStudent) {
      // The student is already in the state this scan would produce.
      return res.status(409).json({
        message:
          direction === 'OUT'
            ? 'This student is already marked outside — an exit has already been logged. Log an entry first.'
            : 'This student is already inside — an entry has already been logged. Log an exit first.',
        campusStatus: studentDoc.campusStatus,
      });
    }

    // Advance the outing lifecycle now that the location flip has committed.
    // OUT consumes the Approved pass (→ Out); IN closes the active trip (→ Returned).
    // Doing this only after the atomic flip succeeds means a lost race (409 above)
    // never wrongly mutates the pass.
    if (direction === 'OUT' && linkedOuting) {
      linkedOuting.status = 'Out';
      await linkedOuting.save();
    } else if (direction === 'IN') {
      linkedOuting = await OutingRequest.findOne({
        student: studentDoc._id,
        status: 'Out',
      }).sort({ createdAt: -1 });
      if (linkedOuting) {
        linkedOuting.status = 'Returned';
        await linkedOuting.save();
      }
    }

    const log = await ScanLog.create({
      student: studentDoc._id,
      guard: req.user._id,
      direction,
      // Prefer the server-resolved pass so the movement is tied to the real trip;
      // fall back to any id the caller supplied for backward compatibility.
      outing: linkedOuting?._id || outing || undefined,
      punctuality: punctuality || 'N/A',
      gate: gate || 'Main Gate'
    });

    // Any scan implies the scanning guard is active / on duty.
    await User.findByIdAndUpdate(req.user._id, { onDuty: true, lastActiveAt: new Date() });

    const populated = await log.populate('student', 'name studentId roomNumber department year hostelName');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get gate scan logs (most recent first)
// @route   GET /api/scan
// @access  Private (Admin / Warden / Guard)
// Query: direction, limit
const getScanLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.direction) filter.direction = req.query.direction;

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const logs = await ScanLog.find(filter)
      .populate('student', 'name studentId roomNumber department year hostelName campusStatus')
      .populate('guard', 'name studentId')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createScanLog,
  getScanLogs
};
