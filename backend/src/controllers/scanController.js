const { Op } = require('sequelize');
const { sequelize, ScanLog, User, OutingRequest, LeaveApplication } = require('../models');
const sseHub = require('../utils/sseHub');
const { ciEquals } = require('../utils/ciCompare');
const { passScope, mergeWhere } = require('../utils/hostelScope');
const { isLegacyId } = require('../utils/legacyIdGrace');
const { UUID_RE } = require('../middlewares/validateParams');
const { hideGirlFromGuard } = require('../config/hostels');
const {
  isReturnLate,
  leaveDayRelation,
  computeOutingReturnDeadline,
  outingTypeFor,
} = require('../utils/outingRules');
const { EXPIRABLE_STATUSES } = require('../utils/passExpiry');

// Outing rows from the old request flow that never left the gate. A gate exit replaces them
// with the outing it creates, and a leave departure burns them, so none can be used later.
const OPEN_OUTING_STATUSES = ['Pending', 'Approved', 'Forwarded'];

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

// A student carries two QRs, identical but for one field: the outing QR (no `p`, the same
// payload every screenshot taken before the leave QR existed carries) and the leave QR
// (`p: 'L'`). The gate forwards which one was scanned as `purpose`, and on an EXIT that alone
// decides the pass: the clock no longer has to guess whether a student with a leave today is
// going home or only into town. Entries ignore it: the student is back, whichever pass took
// them out. The QR is still identity-only — a leave QR is refused unless the DB holds a leave
// valid today, so a screenshot cannot grant anything. Anything unrecognised is an outing,
// like the college ID card.
const readPurpose = (value) => (value === 'leave' ? 'leave' : 'outing');

// Why a leave-QR exit is refused, shown to the guard. `code` lets the gate translate it.
const LEAVE_REFUSALS = {
  NO_LEAVE: 'This student has no approved leave. To go out on an outing, scan their Outing QR.',
  LEAVE_NOT_APPROVED: "This student's leave has not been approved yet.",
  LEAVE_NOT_TODAY: "This student's leave is approved for a later day, not today.",
  LEAVE_EXPIRED: "This student's leave day is over; the leave has expired.",
};

// The student's live, unused leave (one_active_leave_per_student allows one) and what it
// means at the gate right now:
//   usable  — approved, and today is its departure day: a leave-QR exit leaves on it.
//   refusal — the code a leave-QR exit is refused with when nothing is usable.
//   lapsed  — its day is over unused: the caller persists it as Expired, so the dashboards
//             stop offering it. A leave for a LATER day is never touched, so taking an
//             outing today cannot burn it.
const resolveExitLeave = async (studentId, options = {}) => {
  const leave = await LeaveApplication.findOne({
    where: { studentId, status: { [Op.in]: EXPIRABLE_STATUSES } },
    order: [['createdAt', 'DESC']],
    ...options,
  });
  if (!leave) return { usable: null, lapsed: null, refusal: 'NO_LEAVE', leave: null };

  const day = leaveDayRelation(leave.leaveDate);
  if (day === 'OVER') return { usable: null, lapsed: leave, refusal: 'LEAVE_EXPIRED', leave };
  if (leave.status !== 'Approved') return { usable: null, lapsed: null, refusal: 'LEAVE_NOT_APPROVED', leave };
  if (day === 'AHEAD') return { usable: null, lapsed: null, refusal: 'LEAVE_NOT_TODAY', leave };
  return { usable: leave, lapsed: null, refusal: null, leave };
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
  const { studentId, student, direction: requestedDirection, gate } = req.body;
  const purpose = readPurpose(req.body.purpose);

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

    // ---- Which pass the exit uses ----
    //
    // The scanned QR decides (readPurpose). An outing exit is never refused. A leave exit
    // is refused unless a leave is valid today, BEFORE anything is written, so a refused
    // scan leaves no trace beyond the lapse below.
    //
    // A leave whose day is over is persisted as Expired here, outside the transaction, so
    // it stays expired even if the scan itself is refused or then loses a race.
    let exitLeave = null;
    if (direction === 'OUT') {
      const { usable, lapsed, refusal, leave } = await resolveExitLeave(studentDoc.id);
      if (lapsed) {
        // Guarded on status so it can never touch a leave a concurrent scan took 'Out'.
        await LeaveApplication.update(
          { status: 'Expired' },
          { where: { id: lapsed.id, status: { [Op.in]: EXPIRABLE_STATUSES } } }
        );
      }
      if (purpose === 'leave') {
        if (!usable) {
          return res.status(409).json({
            message: LEAVE_REFUSALS[refusal],
            code: refusal,
            leaveDate: leave?.leaveDate ?? null,
            campusStatus: studentDoc.campusStatus,
          });
        }
        exitLeave = usable;
      }
    }

    // ---- The movement itself: all of it, or none of it ----
    let linkedPass = null;
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

      // Mutate passes only after the flip has won the race, so a concurrent scan at another
      // gate (which gets the 409 above) can never create or consume anything.
      if (direction === 'OUT' && exitLeave) {
        // The status guard matters: if a caretaker cancelled this leave in the moment since
        // it was resolved, zero rows update and the whole scan rolls back rather than marking
        // a cancelled leave as Out.
        const [used] = await LeaveApplication.update(
          { status: 'Out' },
          { where: { id: exitLeave.id, status: 'Approved' }, transaction: tx }
        );
        if (used === 0) {
          throw new ScanConflict({
            message:
              "This student's leave changed while the scan was being processed. Nothing was logged; scan again.",
            campusStatus: studentDoc.campusStatus,
          });
        }
        exitLeave.setDataValue('status', 'Out');
        linkedPass = { passType: 'Leave', doc: exitLeave };

        // Burn any leftover outing from the old request flow so it can't be used after the
        // student returns from leave.
        await OutingRequest.update(
          { status: 'Expired', remarks: 'Superseded by leave departure' },
          { where: { studentId: studentDoc.id, status: { [Op.in]: OPEN_OUTING_STATUSES } }, transaction: tx }
        );
      } else if (direction === 'OUT') {
        // The exit scan IS the outing: no request, no approval, no destination. Created
        // inside the transaction, so the movement and its outing commit together or not at
        // all.
        const exitAt = new Date();

        // one_active_outing_per_student allows a single live outing row, so anything still
        // open from the old request flow is retired first, in the same transaction. Shown to
        // the student as "Not used".
        await OutingRequest.update(
          { status: 'Expired', remarks: 'Replaced by gate exit' },
          { where: { studentId: studentDoc.id, status: { [Op.in]: OPEN_OUTING_STATUSES } }, transaction: tx }
        );
        // Only scans write campusStatus, so a row still 'Out' for a student who was just
        // 'Inside' should not exist. If old data left one behind, close it rather than fail
        // this exit on the unique index.
        await OutingRequest.update(
          { status: 'Returned', remarks: 'Closed automatically: no entry scan was logged before the next exit' },
          { where: { studentId: studentDoc.id, status: 'Out' }, transaction: tx }
        );

        const outing = await OutingRequest.create(
          {
            studentId: studentDoc.id,
            // The column stays NOT NULL for the rows written before this change.
            destination: '',
            purpose: 'Outing',
            outingType: outingTypeFor(studentDoc.gender),
            // The real departure; there is no separate exit-by deadline any more.
            outTime: exitAt,
            actualOutTime: exitAt,
            inTime: computeOutingReturnDeadline(exitAt),
            status: 'Out',
            autoApproved: true,
          },
          { transaction: tx }
        );
        linkedPass = { passType: 'Outing', doc: outing };
      } else if (direction === 'IN') {
        linkedPass = await resolveOutPass(studentDoc.id, { transaction: tx });
        if (linkedPass) {
          // A leave's return date is the student's expected return, not a deadline, so a
          // leave return is never judged late (utils/overdue.js treats it the same way).
          if (linkedPass.passType === 'Outing') {
            resolvedPunctuality = isReturnLate(linkedPass.doc.inTime) ? 'Overdue' : 'On-Time';
          }
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
          // Always the server-resolved pass. A caller-supplied id is not accepted: with no
          // pass behind it, it would break scan_logs_pass_type_matches and fail the scan.
          outingId: linkedPass?.passType === 'Outing' ? linkedPass.doc.id : null,
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

    // A gate scan creates an outing, takes a leave Approved->Out, or closes a pass
    // Out->Returned, any of which moves the caretaker's "Out Now" counter. Reuse the outing
    // channel both caretaker dashboards already listen on so the tile updates immediately
    // instead of waiting for the 30s poll.
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
    // Mirrors createScanLog: only an outing return can be late.
    const punctuality = activePass?.passType === 'Outing'
      ? isReturnLate(activePass.doc.inTime)
        ? 'Overdue'
        : 'On-Time'
      : 'N/A';

    // Read-only mirror of the exit createScanLog would log for the QR that was scanned.
    // A leave QR leaves on the leave valid today or is refused with the reason; an outing QR
    // always creates an outing due back by the return deadline. `leaveToday` flags an outing
    // QR shown on the student's leave day, so the guard can ask for the leave QR instead
    // before the countdown commits it.
    const purpose = readPurpose(req.query.purpose);
    const { usable: exitLeave, refusal, leave } = await resolveExitLeave(studentDoc.id);
    const exitAt = new Date();
    let exit;
    if (purpose === 'leave') {
      exit = exitLeave
        // The destination goes with an approved leave so the guard can see where the student
        // is headed before letting them out.
        ? {
            allowed: true,
            reason: null,
            passType: 'Leave',
            pass: { ...passWindow('Leave', exitLeave), destination: exitLeave.destination },
          }
        : {
            allowed: false,
            reason: refusal,
            message: LEAVE_REFUSALS[refusal],
            passType: 'Leave',
            leaveDate: leave?.leaveDate ?? null,
          };
    } else {
      exit = {
        allowed: true,
        reason: null,
        passType: 'Outing',
        pass: { windowStart: exitAt, windowEnd: computeOutingReturnDeadline(exitAt) },
        leaveToday: exitLeave ? passWindow('Leave', exitLeave) : null,
      };
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
      purpose,
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
    const isGuard = req.user.role === 'Guard';
    const scope = passScope(ScanLog, req.user, [
      // roomNumber/department are rendered and searched by the movement log view.
      'id', 'name', 'studentId', 'campusStatus', 'roomNumber', 'hostelName', 'department',
      // Read for a guard only to spot girls below; stripped before the response.
      ...(isGuard ? ['gender'] : []),
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
    if (!isGuard) return res.json(logs);

    // The gate guard gets only a girl's name, roll number and hostel (config/hostels.hideGirlFromGuard).
    const rows = logs.map((l) => l.toJSON());
    for (const { student } of rows) {
      if (!student) continue;
      hideGirlFromGuard(student);
      delete student.gender;
    }
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createScanLog,
  previewScan,
  getScanLogs
};
