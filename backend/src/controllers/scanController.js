const { Op } = require('sequelize');
const { sequelize, ScanLog, User, OutingRequest, LeaveApplication } = require('../models');
const sseHub = require('../utils/sseHub');
const { ciEquals } = require('../utils/ciCompare');
const { passScope, mergeWhere } = require('../utils/hostelScope');
const { isLegacyId } = require('../utils/legacyIdGrace');
const { UUID_RE } = require('../middlewares/validateParams');
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

// Thrown to roll the scan transaction back on a legitimate refusal rather than an error.
// It carries the payload so the catch can answer with the 409 the old code returned
// inline, before there was anything to unwind.
class ScanConflict extends Error {
  constructor(payload) {
    super('scan conflict');
    this.name = 'ScanConflict';
    this.payload = payload;
  }
}

// A student's campusStatus admits exactly one legal move, which is what lets a gate
// station run a single scanner with no exit/entry mode switch: 'Inside' can only
// leave, 'Outside'/'Overdue' can only return. Anything else is treated as inside, to
// match the users.campus_status default. Mirrors deriveGateDirection in
// safeexit/src/app/lib/gateFlow.mjs, and must stay consistent with `allowedFrom` below.
const deriveDirection = (campusStatus) =>
  campusStatus === 'Outside' || campusStatus === 'Overdue' ? 'IN' : 'OUT';

// Prefer the id; fall back to a trimmed case-insensitive roll match so QR whitespace or
// casing can't 404. The roll-number path is also how a printed college ID card resolves,
// which is why students.student_id had to survive the migration byte-exact.
const resolveStudent = async ({ student, studentId }, options = {}) => {
  let studentDoc = null;
  if (student) {
    const key = String(student).trim();
    if (UUID_RE.test(key)) studentDoc = await User.findByPk(key, options);
    // A 24-character hex string is a MongoDB ObjectId, so a QR minted before the migration
    // still resolves at the barrier instead of 404ing. isLegacyId also has to go false once
    // 004_drop_legacy_ids.sql runs, or this stops being a miss and becomes a hard error on
    // a missing column — mid-scan. utils/legacyIdGrace.js owns that switch for both here
    // and the auth middleware.
    else if (isLegacyId(key)) studentDoc = await User.findOne({ where: { legacyId: key }, ...options });
  }
  if (!studentDoc && studentId) {
    const roll = String(studentId).trim();
    if (roll) {
      studentDoc = await User.findOne({
        // ciEquals replaces the anchored case-insensitive $regex. It is also safer: a
        // regex built from user input needed escaping, and a parameterised lower()
        // comparison has nothing to escape.
        where: { role: 'Student', [Op.and]: [ciEquals('student_id', roll)] },
        ...options,
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

// Prefer the pass usable right now (Outing first) so a stale/future pass can't shadow a
// valid one; else return any approved pass so the caller can give a precise denial reason.
const resolveApprovedPass = async (studentId, options = {}) => {
  const outing = await OutingRequest.findOne({
    where: { studentId, status: 'Approved' },
    order: [['createdAt', 'DESC']],
    ...options,
  });
  const leave = await LeaveApplication.findOne({
    where: { studentId, status: 'Approved' },
    order: [['createdAt', 'DESC']],
    ...options,
  });

  if (outing && isOutingExitOpen(outing)) return { passType: 'Outing', doc: outing };
  if (leave && isLeaveExitOpen(leave)) return { passType: 'Leave', doc: leave };

  if (outing) return { passType: 'Outing', doc: outing };
  if (leave) return { passType: 'Leave', doc: leave };

  return null;
};

const resolveOutPass = async (studentId, options = {}) => {
  const outing = await OutingRequest.findOne({
    where: { studentId, status: 'Out' },
    order: [['createdAt', 'DESC']],
    ...options,
  });
  if (outing) return { passType: 'Outing', doc: outing };

  const leave = await LeaveApplication.findOne({
    where: { studentId, status: 'Out' },
    order: [['createdAt', 'DESC']],
    ...options,
  });
  if (leave) return { passType: 'Leave', doc: leave };

  return null;
};

const modelFor = (passType) => (passType === 'Outing' ? OutingRequest : LeaveApplication);

// POST /api/scan — private (Guard/Admin)
//
// ---------------------------------------------------------------------------
// THE reason this migration was worth doing.
//
// In MongoDB this handler performed five sequential, independent writes: the campusStatus
// flip, the pass save(), the cross-collection supersede, the ScanLog insert, and the guard
// duty stamp. There was no transaction, because the collections involved gave no way to
// have one that was worth the operational cost. If the process died between writes 1 and
// 4 — a deploy, an OOM, the gate station's power — a student was left marked Outside with
// NO scan log: a gate movement that never happened as far as every dashboard and every
// audit is concerned, and the one record a hostel gate exists to produce.
//
// The whole scan is one transaction now. Either the student moved and there is a log of
// it, or neither is true.
// ---------------------------------------------------------------------------
const createScanLog = async (req, res) => {
  // punctuality is decided server-side; never read from the body.
  const { studentId, student, direction: requestedDirection, outing, gate } = req.body;

  // 'AUTO' lets a single-scanner gate station omit the direction entirely.
  if (!requestedDirection || !['IN', 'OUT', 'AUTO'].includes(requestedDirection)) {
    return res.status(400).json({ message: 'A valid direction (IN/OUT/AUTO) is required' });
  }

  try {
    const studentDoc = await resolveStudent({ student, studentId });

    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    // Derived here rather than trusted from the client, which may be acting on a
    // preview that has since gone stale. The atomic flip below is still the lock, so a
    // concurrent scan at another gate loses the race and gets the usual 409 instead of
    // writing a log in the wrong direction.
    const direction =
      requestedDirection === 'AUTO' ? deriveDirection(studentDoc.campusStatus) : requestedDirection;

    // ---- Denial checks, before the transaction ----
    //
    // These run first and outside it on purpose. Two of them persist an 'Expired' status
    // and then refuse the exit; that write must SURVIVE the refusal, so that a dashboard
    // shows the same thing the gate just enforced. Rolling it back with the denial would
    // put the two back out of step, which is the confusion the write exists to prevent.
    let linkedPass = null;
    if (direction === 'OUT') {
      linkedPass = await resolveApprovedPass(studentDoc.id);

      if (!linkedPass) {
        return res.status(403).json({
          message:
            'This student has no caretaker-approved outing or leave pass. Exit denied until a request is approved.',
          campusStatus: studentDoc.campusStatus,
        });
      }

      const { windowStart, windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);
      // Guarded on the current status so this can never expire a pass that a concurrent
      // scan has already taken to 'Out'.
      const expirePass = () =>
        modelFor(linkedPass.passType).update(
          { status: 'Expired' },
          { where: { id: linkedPass.doc.id, status: 'Approved' } }
        );

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
          await expirePass();
          return res.status(403).json({
            message:
              'This leave pass has expired — leave passes are only valid until 5:30 PM on the departure day. Exit denied; the student must file a new request.',
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }
      } else {
        // Outing outTime is a departure deadline (early exit OK until outTime).
        // Past departure deadline: persist 'Expired'.
        if (isDeparturePassed(windowStart)) {
          await expirePass();
          return res.status(403).json({
            message:
              'This outing pass has expired — its approved departure deadline has already passed. Exit denied; the student must file a new request.',
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }

        // Judge the current moment against the gender/type departure window; gender comes
        // from the DB, never the QR. Before it opens: leave the pass untouched so it can
        // be used once the window opens.
        const policy = resolveOutingPolicy(studentDoc.gender, linkedPass.doc.outingType);
        if (!isWithinDepartureWindow(studentDoc.gender, linkedPass.doc.outingType, new Date())) {
          const windowText = `${clockLabel(policy.departStartMinutes)}-${clockLabel(
            policy.departEndMinutes
          )}`;
          return res.status(403).json({
            message: `This outing may only be used to exit between ${windowText} (campus time). Exit denied until the window opens.`,
            outTime: windowStart,
            inTime: windowEnd,
            campusStatus: studentDoc.campusStatus,
          });
        }
      }
    }

    // ---- The movement itself: all of it, or none of it ----
    let resolvedPunctuality = 'N/A';
    let logId = null;

    await sequelize.transaction(async (tx) => {
      // The atomic conditional flip, unchanged in spirit and now genuinely a lock. Under
      // READ COMMITTED, a second scan arriving concurrently blocks on this row, then
      // re-evaluates the WHERE against the committed new value — so it matches zero rows
      // and gets the 409 rather than both scans succeeding.
      const newStatus = direction === 'OUT' ? 'Outside' : 'Inside';
      const allowedFrom = direction === 'OUT' ? ['Inside'] : ['Outside', 'Overdue'];

      const [flipped] = await User.update(
        { campusStatus: newStatus, lastSeenAt: new Date() },
        {
          where: { id: studentDoc.id, campusStatus: { [Op.in]: allowedFrom } },
          transaction: tx,
        }
      );

      if (flipped === 0) {
        // Throwing rolls the transaction back; the catch turns it into the same 409 the
        // Mongo version returned inline, back when there was nothing to unwind.
        throw new ScanConflict({
          message:
            direction === 'OUT'
              ? 'This student is already marked outside — an exit has already been logged. Log an entry first.'
              : 'This student is already inside — an entry has already been logged. Log an exit first.',
          campusStatus: studentDoc.campusStatus,
        });
      }

      // Mutate the pass only after the flip has won the race. The status guard is new and
      // the transaction is what makes it safe to act on: if a caretaker cancelled this
      // pass in the moment between resolving it and here, zero rows update and the whole
      // scan rolls back rather than marking a cancelled pass as Out.
      if (direction === 'OUT' && linkedPass) {
        const [used] = await modelFor(linkedPass.passType).update(
          {
            status: 'Out',
            // Stamp actual gate-exit time so student dashboards show it without reading
            // scan logs. Leave applications have no actual_out_time column.
            ...(linkedPass.passType === 'Outing' ? { actualOutTime: new Date() } : {}),
          },
          { where: { id: linkedPass.doc.id, status: 'Approved' }, transaction: tx }
        );

        if (used === 0) {
          throw new ScanConflict({
            message:
              'This pass changed while the scan was being processed — it is no longer approved. Nothing was logged; scan again.',
            campusStatus: studentDoc.campusStatus,
          });
        }
        linkedPass.doc.setDataValue('status', 'Out');

        // Burn any conflicting approved pass in the other table so a student who departed
        // on one pass cannot exit twice after returning.
        const other = linkedPass.passType === 'Outing' ? LeaveApplication : OutingRequest;
        await other.update(
          {
            status: 'Expired',
            remarks: `Superseded by ${linkedPass.passType.toLowerCase()} departure`,
          },
          { where: { studentId: studentDoc.id, status: 'Approved' }, transaction: tx }
        );
      } else if (direction === 'IN') {
        linkedPass = await resolveOutPass(studentDoc.id, { transaction: tx });
        if (linkedPass) {
          const { windowEnd } = passWindow(linkedPass.passType, linkedPass.doc);
          resolvedPunctuality = isReturnLate(windowEnd) ? 'Overdue' : 'On-Time';
          await modelFor(linkedPass.passType).update(
            {
              status: 'Returned',
              // Punctuality and the actual gate-entry time live on the pass — student
              // dashboards read it, not the scan logs.
              returnPunctuality: resolvedPunctuality,
              ...(linkedPass.passType === 'Outing' ? { actualInTime: new Date() } : {}),
            },
            { where: { id: linkedPass.doc.id, status: 'Out' }, transaction: tx }
          );
          linkedPass.doc.setDataValue('status', 'Returned');
        }
      }

      const log = await ScanLog.create(
        {
          studentId: studentDoc.id,
          guardId: req.user._id,
          direction,
          // Prefer the server-resolved pass; a caller-supplied id is kept for backward
          // compatibility. scan_logs_one_pass CHECKs that at most one is set.
          outingId: linkedPass?.passType === 'Outing' ? linkedPass.doc.id : outing || null,
          leaveId: linkedPass?.passType === 'Leave' ? linkedPass.doc.id : null,
          passType: linkedPass?.passType ?? null,
          punctuality: resolvedPunctuality,
          gate: gate || 'Main Gate',
        },
        { transaction: tx }
      );
      logId = log.id;

      await User.update(
        { onDuty: true, lastActiveAt: new Date() },
        { where: { id: req.user._id }, transaction: tx }
      );
    });

    // A gate scan flips a pass Approved->Out or Out->Returned, which moves the caretaker's
    // "Out Now" counter. Reuse the outing channel both caretaker dashboards already listen
    // on so the tile updates immediately instead of waiting for the 30s poll.
    //
    // Deliberately AFTER the commit: broadcasting from inside the transaction would tell
    // dashboards to re-read state that no other connection can see yet, and that no other
    // connection would ever see if the transaction then rolled back.
    sseHub.broadcast('outing:changed', {
      reason: 'scan',
      direction,
      student: String(studentDoc.id),
      passType: linkedPass?.passType || null,
      status: linkedPass?.doc?.status || null,
    });

    const populated = await ScanLog.findByPk(logId, {
      include: [{ association: 'student', attributes: ['id', 'name', 'studentId'] }],
    });
    res.status(201).json(populated);
  } catch (error) {
    if (error instanceof ScanConflict) {
      return res.status(409).json(error.payload || { message: 'Scan conflict.' });
    }
    res.status(500).json({ message: error.message });
  }
};

// GET /api/scan/preview — private (Guard/Admin); read-only mirror of the live scan
// verdict, never trusts the QR.
const previewScan = async (req, res) => {
  const { studentId, sid } = req.query;

  try {
    // photoRow is included here and nowhere else in this file: the gate's preview card is
    // the one place a face photo is actually needed, and it is a single-row read.
    const studentDoc = await resolveStudent({ student: sid, studentId }, { include: ['photoRow'] });
    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found for this QR code' });
    }

    const activePass = await resolveOutPass(studentDoc.id);
    const punctuality = activePass
      ? isReturnLate(passWindow(activePass.passType, activePass.doc).windowEnd)
        ? 'Overdue'
        : 'On-Time'
      : 'N/A';

    const approvedPass = await resolveApprovedPass(studentDoc.id);

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
        if (isDeparturePassed(window.windowStart)) {
          exit = { allowed: false, reason: 'expired', passType: 'Outing', pass: window };
        } else if (
          !isWithinDepartureWindow(studentDoc.gender, approvedPass.doc.outingType, new Date())
        ) {
          exit = { allowed: false, reason: 'not-yet-valid', passType: 'Outing', pass: window };
        } else {
          exit = { allowed: true, reason: null, passType: 'Outing', pass: window };
        }
      }
    }

    res.json({
      student: {
        _id: studentDoc.id,
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

// GET /api/scan — private (Admin/Caretaker/Warden/Guard)
const getScanLogs = async (req, res) => {
  try {
    // Caretakers and wardens only see logs for students in their managed hostel. This used
    // to be hand-rolled here — a User.find(...).collation(...) for every student in the
    // hostel, then their ids as an $in — separately from utils/hostelScope, which did the
    // same thing slightly differently. Both are now the same JOIN.
    const scope = passScope(ScanLog, req.user, [
      // roomNumber/department are rendered and searched by the movement log view.
      'id', 'name', 'studentId', 'campusStatus', 'roomNumber', 'hostelName', 'department',
    ]);
    const where = mergeWhere(scope.where, req.query.direction ? { direction: req.query.direction } : null);

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const logs = await ScanLog.findAll({
      where,
      include: [...scope.include, { association: 'guard', attributes: ['id', 'name', 'studentId'] }],
      order: [['createdAt', 'DESC']],
      limit,
      subQuery: false,
    });
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
