const mongoose = require('mongoose');
const ScanLog = require('../models/ScanLog');
const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const { isDeparturePassed, isReturnLate } = require('../utils/outingRules');

// Escape a user-supplied string for safe use inside a RegExp.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resolve a student from a scanned QR payload. Prefer the immutable Mongo _id
// when present; otherwise fall back to the roll number with a trimmed, case-
// insensitive match so a stray space/case in the QR doesn't wrongly 404. Shared
// by the live scan and the pre-confirm preview so both resolve identically.
const resolveStudent = async ({ student, studentId }) => {
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
  return studentDoc;
};

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
    // Resolve the student from the scanned QR (by _id, then roll number).
    const studentDoc = await resolveStudent({ student, studentId });

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

      // Treat the pass's departure time (`outTime`) as a hard deadline: once the
      // scheduled departure has passed, the QR is expired and the exit is denied
      // — the student must file a fresh request. We also persist the terminal
      // 'Expired' status here so every dashboard that reads the pass stops
      // showing it as active/approved, matching what the gate just enforced.
      if (isDeparturePassed(linkedOuting.outTime)) {
        linkedOuting.status = 'Expired';
        await linkedOuting.save();
        return res.status(403).json({
          message:
            'This outing pass has expired — the approved departure time has already passed. Exit denied; the student must file a new request.',
          outTime: linkedOuting.outTime,
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
    //
    // Punctuality is decided HERE, server-side, never from the request body: a
    // guard's client can send a stale or missing value (its check reads the QR's
    // return window, which may be absent), which is how a late entry could be
    // logged "On-Time". For an entry we judge the scan's real arrival instant
    // against the resolved pass's expected return time (`inTime`); anything after
    // it is 'Overdue'. With no pass to judge against, there's no window → 'N/A'.
    let resolvedPunctuality = 'N/A';
    if (direction === 'OUT' && linkedOuting) {
      linkedOuting.status = 'Out';
      await linkedOuting.save();
    } else if (direction === 'IN') {
      linkedOuting = await OutingRequest.findOne({
        student: studentDoc._id,
        status: 'Out',
      }).sort({ createdAt: -1 });
      if (linkedOuting) {
        resolvedPunctuality = isReturnLate(linkedOuting.inTime) ? 'Overdue' : 'On-Time';
        linkedOuting.status = 'Returned';
        // Stamp the punctuality onto the pass too (not just the ScanLog) so the
        // student's dashboards, which read the pass and never the scan logs, can
        // show a late return as 'Overdue' instead of a plain 'Returned'.
        linkedOuting.returnPunctuality = resolvedPunctuality;
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
      punctuality: resolvedPunctuality,
      gate: gate || 'Main Gate'
    });

    // Any scan implies the scanning guard is active / on duty.
    await User.findByIdAndUpdate(req.user._id, { onDuty: true, lastActiveAt: new Date() });

    const populated = await log.populate('student', 'name studentId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Preview what an entry scan will record, before the guard confirms it.
// @route   GET /api/scan/preview?studentId=<roll>&sid=<_id>
// @access  Private (Guard / Admin)
//
// The guard's confirm dialog must NOT judge punctuality from the QR image: that
// snapshot can be stale or carry no return window (validWindow: "N/A"), which
// made a late entry preview as "On-Time". This returns the authoritative
// punctuality the live scan would stamp — computed server-side against the
// student's active trip's expected return time (`inTime`) — so the preview and
// the persisted log always agree.
const previewScan = async (req, res) => {
  const { studentId, sid } = req.query;

  try {
    const studentDoc = await resolveStudent({ student: sid, studentId });
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    // The trip an entry would close: the newest pass the student actually left on.
    const activeOuting = await OutingRequest.findOne({
      student: studentDoc._id,
      status: 'Out',
    }).sort({ createdAt: -1 });

    // No active trip → nothing to judge against (matches the live scan's 'N/A').
    const punctuality = activeOuting
      ? (isReturnLate(activeOuting.inTime) ? 'Overdue' : 'On-Time')
      : 'N/A';

    // Exit eligibility: a READ-ONLY mirror of the OUT enforcement in
    // createScanLog, so the guard's exit dialog shows the real verdict BEFORE
    // confirming instead of trusting the QR (which no longer carries a status at
    // all). Performs no writes — unlike the live scan it never persists 'Expired';
    // it only reports what an OUT scan would decide against the DB right now. The
    // newest 'Approved' pass is the one the live OUT scan would consume.
    const approvedOuting = await OutingRequest.findOne({
      student: studentDoc._id,
      status: 'Approved',
    }).sort({ createdAt: -1 });

    let exit;
    if (!approvedOuting) {
      // No warden-approved pass → the live scan would 403. This is exactly the
      // replayed-QR case: a screenshot from a finished trip resolves to nothing.
      exit = { allowed: false, reason: 'no-approved', outing: null };
    } else if (isDeparturePassed(approvedOuting.outTime)) {
      // Approved but the departure deadline has passed → the live scan would 403.
      exit = {
        allowed: false,
        reason: 'expired',
        outing: { outTime: approvedOuting.outTime, inTime: approvedOuting.inTime },
      };
    } else {
      exit = {
        allowed: true,
        reason: null,
        outing: { outTime: approvedOuting.outTime, inTime: approvedOuting.inTime },
      };
    }

    res.json({
      student: {
        _id: studentDoc._id,
        name: studentDoc.name,
        studentId: studentDoc.studentId,
        campusStatus: studentDoc.campusStatus,
      },
      activeOuting: activeOuting
        ? { outTime: activeOuting.outTime, inTime: activeOuting.inTime, status: activeOuting.status }
        : null,
      punctuality,
      exit,
    });
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
      .populate('student', 'name studentId campusStatus')
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
  previewScan,
  getScanLogs
};
