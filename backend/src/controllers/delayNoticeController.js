const { DelayNotice, OutingRequest } = require('../models');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { notifyHostelStaffAndAdmins, notifyStudent } = require('../utils/pushService');
const { passScope, mergeWhere, studentInScope } = require('../utils/hostelScope');
const { isReturnLate } = require('../utils/outingRules');

const DELAY_STUDENT_FIELDS = [
  'id', 'name', 'studentId', 'roomNumber', 'hostelName', 'department', 'year', 'phoneNumber',
];
const ACK_FIELDS = ['id', 'name', 'role'];

const DELAY_REASONS = ['Traffic', 'Transport', 'Medical', 'Family', 'Weather', 'Other'];

// The trip a delay notice can attach to: only the student's live outing pass.
// Leave has a mandatory return-date field at application time and is not a
// short same-day trip like outings, so delay notices are outing-specific.
const findActiveTrip = async (studentId) => {
  const outing = await OutingRequest.findOne({
    where: { studentId, status: 'Out' },
    order: [['outTime', 'DESC']],
    attributes: ['id', 'inTime'],
  });
  if (outing) return { trip: outing, tripType: 'Outing', dueAt: outing.inTime };

  return null;
};

// A future instant, or undefined. Malformed input is dropped rather than rejected —
// a delay notice must never fail on an optional field (same leniency as SOS coords).
const sanitizeExpectedTime = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.getTime() < Date.now() - 60 * 1000) return undefined;
  return d;
};

const trimmed = (value, max) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

// One place that builds the fully-joined form of a notice, so the create, revise and
// acknowledge responses cannot drift apart in what they populate.
const loadNotice = (id, options = {}) =>
  DelayNotice.findByPk(id, {
    include: [
      { association: 'student', attributes: DELAY_STUDENT_FIELDS },
      { association: 'acknowledgedByUser', attributes: ACK_FIELDS },
    ],
    ...options,
  });

// POST /api/delay — private (Student)
const createDelayNotice = async (req, res) => {
  const { reason, note, newExpectedTime } = req.body;

  if (!DELAY_REASONS.includes(reason)) {
    return res.status(400).json({
      message: `Reason must be one of: ${DELAY_REASONS.join(', ')}.`,
    });
  }

  try {
    const active = await findActiveTrip(req.user._id);
    if (!active) {
      return res.status(409).json({
        message: 'You can only send a delay notice while you are out on an approved outing pass.',
      });
    }

    const { trip, dueAt } = active;
    const cleanNote = trimmed(note, 300);
    const expected = sanitizeExpectedTime(newExpectedTime);

    // One notice per trip: a second filing is the student revising their estimate,
    // so update in place rather than spamming staff with duplicate rows.
    const existing = await DelayNotice.findOne({ where: { outingId: trip.id, status: 'Pending' } });
    if (existing) {
      existing.reason = reason;
      existing.note = cleanNote ?? null;
      existing.newExpectedTime = expected ?? null;
      await existing.save();

      sseHub.broadcast('delay:updated', {
        id: existing.id,
        tripType: existing.tripType,
        status: existing.status,
      });

      return res.json(await loadNotice(existing.id));
    }

    // `trip` and `tripType` are read-only virtuals now — the notice names the column it
    // means. delay_notices_one_trip CHECKs that exactly one of outing_id/leave_id is set,
    // and the foreign key means a notice can no longer point at a pass that does not
    // exist, which the untyped Mongo `trip` ObjectId allowed.
    const notice = await DelayNotice.create({
      studentId: req.user._id,
      outingId: trip.id,
      reason,
      note: cleanNote,
      newExpectedTime: expected,
      originalInTime: dueAt,
      filedWhileOverdue: isReturnLate(dueAt),
    });

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel staff too.
    sseHub.broadcast('delay:created', {
      id: notice.id,
      tripType: notice.tripType,
      status: notice.status,
    });

    // Everyone responsible for this student hears it at once: routed caretaker,
    // hostel warden, chief warden and admins.
    notifyHostelStaffAndAdmins(
      { hostelName: req.user.hostelName, gender: req.user.gender },
      {
        title: '🕒 Student Running Late',
        body: `${req.user.name} reported a delay (${reason})${cleanNote ? `: ${cleanNote}` : '.'}`,
        url: '/dashboard/caretaker?view=delays',
        wardenUrl: '/dashboard/warden?view=delays',
        adminUrl: '/dashboard/admin?view=delays',
        chiefWardenUrl: '/dashboard/chief-warden?view=delays',
        urgency: 'high',
      }
    );

    res.status(201).json(notice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/delay/mine — private (Student)
const getMyDelayNotices = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const where = { studentId: req.user._id };
    const notices = await DelayNotice.findAll({
      where,
      include: [{ association: 'acknowledgedByUser', attributes: ACK_FIELDS }],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
    });

    return sendPage(res, notices, {
      limit,
      skip,
      label: 'delay/mine',
      count: () => DelayNotice.count({ where }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/delay — private (Admin/Caretaker/Guard/Warden/ChiefWarden)
const getDelayNotices = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(DelayNotice, req.user, DELAY_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, req.query.status ? { status: req.query.status } : null);
    const include = [...scope.include, { association: 'acknowledgedByUser', attributes: ACK_FIELDS }];

    const notices = await DelayNotice.findAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      // Required whenever `where` reaches into a joined table alongside a limit: without
      // it Sequelize windows the base table in a subquery the join predicates cannot see.
      subQuery: false,
    });

    return sendPage(res, notices, {
      limit,
      skip,
      label: 'delay/list',
      // distinct, because the scope join must not multiply the count.
      count: () => DelayNotice.count({ where, include: scope.include, distinct: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/delay/:id/acknowledge — private (Admin/Caretaker/Warden/ChiefWarden)
// Acknowledge only: the pass's return time is never rewritten, so the student stays
// on the overdue list and the record of a late return stays honest.
const acknowledgeDelayNotice = async (req, res) => {
  try {
    const notice = await DelayNotice.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'name', 'gender', 'hostelName'] }],
    });

    if (!notice) {
      return res.status(404).json({ message: 'Delay notice not found' });
    }

    // Server-side scope re-check, same as the outing decision endpoints.
    if (!studentInScope(req.user, notice.student)) {
      return res.status(403).json({ message: 'This delay notice is outside your scope.' });
    }

    if (notice.status === 'Acknowledged') {
      return res.status(409).json({ message: 'This delay notice is already acknowledged.' });
    }

    notice.status = 'Acknowledged';
    notice.acknowledgedBy = req.user._id;
    notice.acknowledgedAt = new Date();
    // Express 5 leaves req.body undefined when the request carries no body at all,
    // which is exactly what the dashboards send for a plain acknowledge.
    const ackNote = trimmed(req.body?.acknowledgementNote, 300);
    if (ackNote) notice.acknowledgementNote = ackNote;

    await notice.save();

    sseHub.broadcast('delay:updated', {
      id: notice.id,
      status: notice.status,
    });

    // Close the loop for the student — they know someone saw it.
    notifyStudent(notice.studentId, {
      title: '✅ Delay Notice Seen',
      body: `${req.user.name} acknowledged your delay notice.${ackNote ? ` "${ackNote}"` : ''}`,
      url: '/dashboard/student/delay-notice',
    });

    res.json(await loadNotice(notice.id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/delay/stream — private (staff), SSE
const streamDelayEvents = (req, res) => {
  sseHub.attach(req, res);
};

module.exports = {
  createDelayNotice,
  getMyDelayNotices,
  getDelayNotices,
  acknowledgeDelayNotice,
  streamDelayEvents,
};
