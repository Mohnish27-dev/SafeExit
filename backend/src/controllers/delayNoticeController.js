const DelayNotice = require('../models/DelayNotice');
const OutingRequest = require('../models/OutingRequest');
const sseHub = require('../utils/sseHub');
const { notifyHostelStaffAndAdmins, notifyStudent } = require('../utils/pushService');
const { scopedStudentFilter, studentInScope } = require('../utils/hostelScope');
const { isReturnLate } = require('../utils/outingRules');

const DELAY_STUDENT_FIELDS = 'name studentId roomNumber hostelName department year phoneNumber';

const DELAY_REASONS = ['Traffic', 'Transport', 'Medical', 'Family', 'Weather', 'Other'];

// The trip a delay notice can attach to: only the student's live outing pass.
// Leave has a mandatory return-date field at application time and is not a
// short same-day trip like outings, so delay notices are outing-specific.
const findActiveTrip = async (studentId) => {
  const outing = await OutingRequest.findOne({ student: studentId, status: 'Out' })
    .sort({ outTime: -1 })
    .select('_id inTime');
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

    const { trip, tripType, dueAt } = active;
    const cleanNote = trimmed(note, 300);
    const expected = sanitizeExpectedTime(newExpectedTime);

    // One notice per trip: a second filing is the student revising their estimate,
    // so update in place rather than spamming staff with duplicate rows.
    const existing = await DelayNotice.findOne({ trip: trip._id, status: 'Pending' });
    if (existing) {
      existing.reason = reason;
      existing.note = cleanNote;
      existing.newExpectedTime = expected;
      const revised = await existing.save();

      sseHub.broadcast('delay:updated', {
        id: revised._id,
        tripType: revised.tripType,
        status: revised.status,
      });

      return res.json(revised);
    }

    const notice = await DelayNotice.create({
      student: req.user._id,
      trip: trip._id,
      tripType,
      reason,
      note: cleanNote,
      newExpectedTime: expected,
      originalInTime: dueAt,
      filedWhileOverdue: isReturnLate(dueAt),
    });

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel staff too.
    sseHub.broadcast('delay:created', {
      id: notice._id,
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
    const notices = await DelayNotice.find({ student: req.user._id })
      .populate('acknowledgedBy', 'name role')
      .sort({ createdAt: -1 });
    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/delay — private (Admin/Caretaker/Guard/Warden/ChiefWarden)
const getDelayNotices = async (req, res) => {
  try {
    const filter = { ...(await scopedStudentFilter(req.user)) };
    if (req.query.status) filter.status = req.query.status;

    const notices = await DelayNotice.find(filter)
      .populate('student', DELAY_STUDENT_FIELDS)
      .populate('acknowledgedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/delay/:id/acknowledge — private (Admin/Caretaker/Warden/ChiefWarden)
// Acknowledge only: the pass's return time is never rewritten, so the student stays
// on the overdue list and the record of a late return stays honest.
const acknowledgeDelayNotice = async (req, res) => {
  try {
    const notice = await DelayNotice.findById(req.params.id)
      .populate('student', 'name gender hostelName');

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

    const updated = await notice.save();

    sseHub.broadcast('delay:updated', {
      id: updated._id,
      status: updated.status,
    });

    // Close the loop for the student — they know someone saw it.
    notifyStudent(updated.student._id, {
      title: '✅ Delay Notice Seen',
      body: `${req.user.name} acknowledged your delay notice.${ackNote ? ` "${ackNote}"` : ''}`,
      url: '/dashboard/student/delay-notice',
    });

    const populated = await updated.populate([
      { path: 'student', select: DELAY_STUDENT_FIELDS },
      { path: 'acknowledgedBy', select: 'name role' },
    ]);

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/delay/stream — private (staff), SSE
const streamDelayEvents = (req, res) => {
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  sseHub.addClient(res);

  // Keeps proxies from killing the idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
};

module.exports = {
  createDelayNotice,
  getMyDelayNotices,
  getDelayNotices,
  acknowledgeDelayNotice,
  streamDelayEvents,
};
