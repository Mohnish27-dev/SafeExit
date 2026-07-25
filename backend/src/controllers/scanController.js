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
  resolveOutingPolicy,
  isWithinDepartureWindow,
} = require('../utils/outingRules');

const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Prefer _id; fall back to trimmed case-insensitive roll match so QR whitespace/case can't 404.
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

// QR is identity-only; the current pass is always resolved from the DB, never from the QR.
const passWindow = (passType, doc) =>
  passType === 'Outing'
    ? { windowStart: doc.outTime, windowEnd: doc.inTime }
    : { windowStart: doc.leaveDate, windowEnd: doc.returnDate };

// Outing outTime is a deadline only (early exit OK); Leave is valid leaveDate → 5:30 PM same day.
const isOutingExitOpen = (doc) => !isDeparturePassed(doc.outTime);
const isLeaveExitOpen = (doc) =>
  !isBeforeDeparture(doc.leaveDate) && !isAfterLeaveCurfew(doc.leaveDate);

// Prefer the pass usable right now (Outing first) so a stale/future pass can't shadow a valid one; else return any approved pass so the caller can give a precise denial reason.
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

// POST /api/scan — private (Guard/Admin)
const createScanLog = async (req, res) => {
  // punctuality is decided server-side; never read from the body.
  const { studentId, student, direction, outing, gate } = req.body;

  if (!direction || !['IN', 'OUT'].includes(direction)) {
    return res.status(400).json({ message: 'A valid direction (IN/OUT) is required' });
  }

  try {
    const studentDoc = await resolveStudent({ student, studentId });

    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    // OUT requires a DB-verified Approved pass (QR status is never trusted); IN stays permissive.
    let linkedPass = null;
    if (direction === 'OUT') {
      linkedPass = await resolveApprovedPass(studentDoc._id);

      if (!linkedPass) {
        return res.status(403).json({
          message:
            'This student has no caretaker-approved outing or leave pass. Exit denied until a request is approved.',
          campusStatus: studentDoc.campusStatus,
        });
      }

      const { windowStart, windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);

      if (linkedPass.passType === 'Leave') {
        // Not open yet — leave the pass untouched so it's still usable on its day.
        if (isBeforeDeparture(windowStart)) {
          return res.status(403).json({
            message: `This leave pass is not valid yet — the approved departure is ${new Date(windowStart).toLocaleString()}. Exit denied until then.`,
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }

        // Past curfew: persist 'Expired' so dashboards match what the gate enforced.
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
        // Judge the current moment against the gender/type departure window; gender comes from the DB, never the QR.
        const policy = resolveOutingPolicy(studentDoc.gender, linkedPass.doc.outingType);
        if (!isWithinDepartureWindow(studentDoc.gender, linkedPass.doc.outingType, new Date())) {
          const windowText = `${clockLabel(policy.departStartMinutes)}-${clockLabel(
            policy.departEndMinutes
          )}`;
          // Past window end: persist 'Expired'; before it opens: leave the pass untouched.
          if (isDeparturePassed(windowStart)) {
            linkedPass.doc.status = 'Expired';
            await linkedPass.doc.save();
            return res.status(403).json({
              message: `This outing pass has expired — its departure window (${windowText}, campus time) has already passed. Exit denied; the student must file a new request.`,
              outTime: windowStart,
              inTime: windowEnd,
              campusStatus: studentDoc.campusStatus,
            });
          }
          return res.status(403).json({
            message: `This outing may only be used to exit between ${windowText} (campus time). Exit denied until the window opens.`,
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }
      }
    }

    // Atomic conditional flip doubles as a lock — two near-simultaneous scans can't both match.
    const newStatus = direction === 'OUT' ? 'Outside' : 'Inside';
    const allowedFrom = direction === 'OUT' ? ['Inside'] : ['Outside', 'Overdue'];

    const updatedStudent = await User.findOneAndUpdate(
      { _id: studentDoc._id, campusStatus: { $in: allowedFrom } },
      { campusStatus: newStatus, lastSeenAt: new Date() },
      { new: true }
    );

    if (!updatedStudent) {
      return res.status(409).json({
        message:
          direction === 'OUT'
            ? 'This student is already marked outside — an exit has already been logged. Log an entry first.'
            : 'This student is already inside — an entry has already been logged. Log an exit first.',
        campusStatus: studentDoc.campusStatus,
      });
    }

    // Mutate the pass only after the atomic flip wins the race; punctuality is judged server-side against the pass's return time.
    let resolvedPunctuality = 'N/A';
    if (direction === 'OUT' && linkedPass) {
      linkedPass.doc.status = 'Out';
      // Stamp actual gate-exit time so student dashboards can show it without reading scan logs.
      if (linkedPass.passType === 'Outing') linkedPass.doc.actualOutTime = new Date();
      await linkedPass.doc.save();
    } else if (direction === 'IN') {
      linkedPass = await resolveOutPass(studentDoc._id);
      if (linkedPass) {
        const { windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);
        resolvedPunctuality = isReturnLate(windowEnd) ? 'Overdue' : 'On-Time';
        linkedPass.doc.status = 'Returned';
        // Stamp punctuality and actual gate-entry time — student dashboards read the pass, not scan logs.
        linkedPass.doc.returnPunctuality = resolvedPunctuality;
        if (linkedPass.passType === 'Outing') linkedPass.doc.actualInTime = new Date();
        await linkedPass.doc.save();
      }
    }

    const log = await ScanLog.create({
      student: studentDoc._id,
      guard: req.user._id,
      direction,
      // Prefer the server-resolved pass; caller-supplied id kept for backward compat.
      outing: linkedPass?.passType === 'Outing' ? linkedPass.doc._id : outing || undefined,
      leave: linkedPass?.passType === 'Leave' ? linkedPass.doc._id : undefined,
      passType: linkedPass?.passType,
      punctuality: resolvedPunctuality,
      gate: gate || 'Main Gate'
    });

    await User.findByIdAndUpdate(req.user._id, { onDuty: true, lastActiveAt: new Date() });

    const populated = await log.populate('student', 'name studentId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/scan/preview — private (Guard/Admin); read-only mirror of the live scan verdict, never trusts the QR.
const previewScan = async (req, res) => {
  const { studentId, sid } = req.query;

  try {
    const studentDoc = await resolveStudent({ student: sid, studentId });
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    const activePass = await resolveOutPass(studentDoc._id);
    const punctuality = activePass
      ? isReturnLate(passWindow(activePass.passType, activePass.doc).windowEnd)
        ? 'Overdue'
        : 'On-Time'
      : 'N/A';

    const approvedPass = await resolveApprovedPass(studentDoc._id);

    let exit;
    if (!approvedPass) {
      exit = { allowed: false, reason: 'no-approved', passType: null, pass: null };
    } else {
      const window = passWindow(approvedPass.passType, approvedPass.doc);
      if (approvedPass.passType === 'Leave') {
        if (isBeforeDeparture(window.windowStart)) {
          exit = { allowed: false, reason: 'not-yet-valid', passType: 'Leave', pass: window };
        } else if (isAfterLeaveCurfew(window.windowStart)) {
          exit = { allowed: false, reason: 'expired', passType: 'Leave', pass: window };
        } else {
          exit = { allowed: true, reason: null, passType: 'Leave', pass: window };
        }
      } else {
        if (isWithinDepartureWindow(studentDoc.gender, approvedPass.doc.outingType, new Date())) {
          exit = { allowed: true, reason: null, passType: 'Outing', pass: window };
        } else if (isDeparturePassed(window.windowStart)) {
          exit = { allowed: false, reason: 'expired', passType: 'Outing', pass: window };
        } else {
          exit = { allowed: false, reason: 'not-yet-valid', passType: 'Outing', pass: window };
        }
      }
    }

    res.json({
      student: {
        _id: studentDoc._id,
        name: studentDoc.name,
        studentId: studentDoc.studentId,
        campusStatus: studentDoc.campusStatus,
        photo: studentDoc.photo,
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

// GET /api/scan — private (Admin/Caretaker/Guard)
const getScanLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.direction) filter.direction = req.query.direction;

    // Caretakers only see logs for students in their managed hostel.
    if (req.user.role === 'Caretaker') {
      const hostelFilter = req.user.managedHostel
        ? { hostelName: req.user.managedHostel }
        : req.user.managedGender
        ? { gender: req.user.managedGender }
        : null;
      if (!hostelFilter) return res.json([]);
      const students = await User.find({ role: 'Student', ...hostelFilter }, '_id');
      filter.student = { $in: students.map((s) => s._id) };
    }

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
