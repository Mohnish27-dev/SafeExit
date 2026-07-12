const mongoose = require('mongoose');
const ScanLog = require('../models/ScanLog');
const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const {
  isDeparturePassed,
  isBeforeDeparture,
  isReturnLate,
  isAfterLeaveCurfew,
} = require('../utils/outingRules');

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

// The QR a student carries is identity-only (no per-trip data), by design —
// so the gate always resolves whichever pass is actually current in the DB,
// never anything baked into the scanned code. That's what lets us support two
// pass types here with zero changes to QR generation or the scanning UI.
//
// A pass window is described generically as { windowStart, windowEnd } so the
// rest of this file (and the frontend preview consumer) never needs to branch
// on field names: Outing uses outTime/inTime, Leave uses leaveDate/returnDate.
const passWindow = (passType, doc) =>
  passType === 'Outing'
    ? { windowStart: doc.outTime, windowEnd: doc.inTime }
    : { windowStart: doc.leaveDate, windowEnd: doc.returnDate };

// Is a pass usable for an exit at this exact moment?
//   Outing — `outTime` is a DEADLINE only: valid any time up to it (leaving
//            early is fine). This is the original single-day outing behavior.
//   Leave  — valid from its approved `leaveDate` until 5:30 PM (campus time)
//            that same day; not before, and dead after the 5:30 PM curfew.
const isOutingExitOpen = (doc) => !isDeparturePassed(doc.outTime);
const isLeaveExitOpen = (doc) =>
  !isBeforeDeparture(doc.leaveDate) && !isAfterLeaveCurfew(doc.leaveDate);

// Resolve the Approved pass an OUT scan would consume. We prefer whichever
// approved pass is actually usable RIGHT NOW so a stale or not-yet-open pass
// can never shadow a currently-valid one — e.g. an approved future Leave (valid
// only on its own date) must not intercept and block a same-day Outing, and an
// approved-but-lapsed Outing must not block a Leave that is valid today. Outing
// keeps priority when both are usable, preserving the original behavior. If
// nothing is usable we still return an approved pass (Outing first) so the
// caller can surface a precise reason (not-yet-valid / expired) rather than a
// generic "no pass".
const resolveApprovedPass = async (studentId) => {
  const outing = await OutingRequest.findOne({ student: studentId, status: 'Approved' }).sort({
    createdAt: -1,
  });
  const leave = await LeaveApplication.findOne({ student: studentId, status: 'Approved' }).sort({
    createdAt: -1,
  });

  if (outing && isOutingExitOpen(outing)) return { passType: 'Outing', doc: outing };
  if (leave && isLeaveExitOpen(leave)) return { passType: 'Leave', doc: leave };

  if (outing) return { passType: 'Outing', doc: outing };
  if (leave) return { passType: 'Leave', doc: leave };

  return null;
};

// Resolve the pass an IN scan would close (the one the student is currently
// "Out" against). Same Outing-first priority as resolveApprovedPass.
const resolveOutPass = async (studentId) => {
  const outing = await OutingRequest.findOne({ student: studentId, status: 'Out' }).sort({
    createdAt: -1,
  });
  if (outing) return { passType: 'Outing', doc: outing };

  const leave = await LeaveApplication.findOne({ student: studentId, status: 'Out' }).sort({
    createdAt: -1,
  });
  if (leave) return { passType: 'Leave', doc: leave };

  return null;
};

// @desc    Record a gate scan (entry/exit) for a student
// @route   POST /api/scan
// @access  Private (Guard / Admin)
// Body: { studentId (roll number) OR student (_id), direction: 'IN'|'OUT',
//         outing?, gate? }
// (A body `punctuality` is ignored — punctuality is always decided server-side.)
//
// Gate enforcement: an OUT (exit) scan is only allowed against a pass whose
// `status` is actually 'Approved' in the DB — an Outing (whether warden- or
// auto-approved) or, as a fallback, a warden-approved Leave Application. We
// never trust a client-supplied status for this; it's always re-checked here
// against the database.
const createScanLog = async (req, res) => {
  // Note: `punctuality` is intentionally NOT read from the body — it's decided
  // server-side below (both the campus status flip and the ScanLog stamp).
  const { studentId, student, direction, outing, gate } = req.body;

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
    // Approved pass (Outing first, Leave as fallback — see resolveApprovedPass).
    // Resolved here so the decision is made server-side and can't be bypassed
    // by a tampered/absent QR status. IN scans stay permissive — never trap a
    // student outside for a missing record.
    let linkedPass = null;
    if (direction === 'OUT') {
      linkedPass = await resolveApprovedPass(studentDoc._id);

      if (!linkedPass) {
        return res.status(403).json({
          message:
            'This student has no warden-approved outing or leave pass. Exit denied until a request is approved.',
          campusStatus: studentDoc.campusStatus,
        });
      }

      const { windowStart, windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);

      if (linkedPass.passType === 'Leave') {
        // Leave pass window: valid from the approved leaveDate until 5:30 PM
        // (campus time) that same day.

        // Not open yet — the approved leaveDate is still in the future (a leave
        // approved for the 13th cannot be used to exit on the 12th). The pass
        // is legitimately pending its window, so it's left untouched (not
        // 'Expired') — the student can still use it on the right day.
        if (isBeforeDeparture(windowStart)) {
          return res.status(403).json({
            message: `This leave pass is not valid yet — the approved departure is ${new Date(windowStart).toLocaleString()}. Exit denied until then.`,
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }

        // Past the 5:30 PM curfew on the departure day — the pass is dead. We
        // persist the terminal 'Expired' status so every dashboard stops
        // showing it as active, matching what the gate just enforced.
        if (isAfterLeaveCurfew(windowStart)) {
          linkedPass.doc.status = 'Expired';
          await linkedPass.doc.save();
          return res.status(403).json({
            message:
              'This leave pass has expired — leave passes are only valid until 5:30 PM on the departure day. Exit denied; the student must file a new request.',
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }
      } else {
        // Outing pass: `outTime` is a hard DEADLINE only. The student may exit
        // any time before it (leaving early is fine) but not after — this is
        // the original single-day outing behavior. Once the departure time has
        // passed the pass is expired; we persist the terminal 'Expired' status
        // so every dashboard reflects what the gate enforced.
        if (isDeparturePassed(windowStart)) {
          linkedPass.doc.status = 'Expired';
          await linkedPass.doc.save();
          return res.status(403).json({
            message:
              'This outing pass has expired — the approved departure time has already passed. Exit denied; the student must file a new request.',
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }
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
    // An exit always lands the student 'Outside'. 'Overdue' is never an exit
    // result — it's the state of a student already outside past their return
    // window (it's an allowed "from" state for an IN scan below, not a "to"
    // state here). We deliberately ignore the request body's `punctuality`:
    // like the rest of this file, that verdict is decided server-side, never
    // trusted from the untrusted scan payload.
    const newStatus = direction === 'OUT' ? 'Outside' : 'Inside';
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

    // Advance the pass lifecycle now that the location flip has committed.
    // OUT consumes the Approved pass (-> Out); IN closes the active trip
    // (-> Returned, for both Outing and Leave). Doing this only after the
    // atomic flip succeeds means a lost race (409 above) never wrongly
    // mutates the pass.
    //
    // Punctuality is decided HERE, server-side, never from the request body: a
    // guard's client can send a stale or missing value (its check reads the QR's
    // return window, which may be absent), which is how a late entry could be
    // logged "On-Time". For an entry we judge the scan's real arrival instant
    // against the resolved pass's expected return time; anything after it is
    // 'Overdue'. With no pass to judge against, there's no window -> 'N/A'.
    let resolvedPunctuality = 'N/A';
    if (direction === 'OUT' && linkedPass) {
      linkedPass.doc.status = 'Out';
      await linkedPass.doc.save();
    } else if (direction === 'IN') {
      linkedPass = await resolveOutPass(studentDoc._id);
      if (linkedPass) {
        const { windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);
        resolvedPunctuality = isReturnLate(windowEnd) ? 'Overdue' : 'On-Time';
        linkedPass.doc.status = 'Returned';
        // Stamp the punctuality onto the pass too (not just the ScanLog) so the
        // student's dashboards, which read the pass and never the scan logs, can
        // show a late return as 'Overdue' instead of a plain 'Returned'.
        // (Only OutingRequest carries this field; on a Leave pass the unknown
        // path is dropped by Mongoose strict mode, which is harmless.)
        linkedPass.doc.returnPunctuality = resolvedPunctuality;
        await linkedPass.doc.save();
      }
    }

    const log = await ScanLog.create({
      student: studentDoc._id,
      guard: req.user._id,
      direction,
      // Prefer the server-resolved pass so the movement is tied to the real trip;
      // fall back to any id the caller supplied for backward compatibility.
      outing: linkedPass?.passType === 'Outing' ? linkedPass.doc._id : outing || undefined,
      leave: linkedPass?.passType === 'Leave' ? linkedPass.doc._id : undefined,
      passType: linkedPass?.passType,
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

// @desc    Preview what a scan will record, before the guard confirms it.
// @route   GET /api/scan/preview?studentId=<roll>&sid=<_id>
// @access  Private (Guard / Admin)
//
// The guard's confirm dialog must NOT judge punctuality from the QR image: that
// snapshot can be stale or carry no return window, which made a late entry
// preview as "On-Time". This returns the authoritative punctuality the live
// scan would stamp — computed server-side against the student's active pass's
// expected return time — so the preview and the persisted log always agree.
// Performs no writes — unlike the live scan it never persists an 'Expired'
// transition; it only reports what a scan would decide against the DB right now.
const previewScan = async (req, res) => {
  const { studentId, sid } = req.query;

  try {
    const studentDoc = await resolveStudent({ student: sid, studentId });
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    // The pass an entry would close: the newest pass the student actually left on.
    const activePass = await resolveOutPass(studentDoc._id);
    const punctuality = activePass
      ? isReturnLate(passWindow(activePass.passType, activePass.doc).windowEnd)
        ? 'Overdue'
        : 'On-Time'
      : 'N/A';

    // Exit eligibility: a READ-ONLY mirror of the OUT enforcement in
    // createScanLog, so the guard's exit dialog shows the real verdict BEFORE
    // confirming instead of trusting the QR (which carries no status at all).
    // The newest 'Approved' pass is the one the live OUT scan would consume.
    const approvedPass = await resolveApprovedPass(studentDoc._id);

    let exit;
    if (!approvedPass) {
      // No warden-approved pass -> the live scan would 403. This is exactly the
      // replayed-QR case: a screenshot from a finished trip resolves to nothing.
      exit = { allowed: false, reason: 'no-approved', passType: null, pass: null };
    } else {
      const window = passWindow(approvedPass.passType, approvedPass.doc);
      if (approvedPass.passType === 'Leave') {
        // Leave: valid from leaveDate until 5:30 PM (campus time) that same day.
        if (isBeforeDeparture(window.windowStart)) {
          exit = { allowed: false, reason: 'not-yet-valid', passType: 'Leave', pass: window };
        } else if (isAfterLeaveCurfew(window.windowStart)) {
          exit = { allowed: false, reason: 'expired', passType: 'Leave', pass: window };
        } else {
          exit = { allowed: true, reason: null, passType: 'Leave', pass: window };
        }
      } else {
        // Outing: outTime is a deadline only — valid any time up to it.
        if (isDeparturePassed(window.windowStart)) {
          exit = { allowed: false, reason: 'expired', passType: 'Outing', pass: window };
        } else {
          exit = { allowed: true, reason: null, passType: 'Outing', pass: window };
        }
      }
    }

    res.json({
      student: {
        _id: studentDoc._id,
        name: studentDoc.name,
        studentId: studentDoc.studentId,
        campusStatus: studentDoc.campusStatus,
      },
      activePass: activePass
        ? {
            passType: activePass.passType,
            ...passWindow(activePass.passType, activePass.doc),
            status: activePass.doc.status,
          }
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
