const SOSAlert = require('../models/SOSAlert');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { notifyCaretakersAndAdmins } = require('../utils/pushService');
const { genderScopedStudentFilter, studentInGenderScope } = require('../utils/hostelScope');

const SOS_STUDENT_FIELDS = 'name studentId roomNumber hostelName department year';
const SOS_CONTACT_ROLES = new Set(['Admin', 'Caretaker', 'Warden', 'ChiefWarden']);
const sosStudentFieldsFor = (role) =>
  SOS_CONTACT_ROLES.has(role)
    ? `${SOS_STUDENT_FIELDS} phoneNumber guardianPhoneNumber closeContacts`
    : SOS_STUDENT_FIELDS;

const VALID_SOS_TYPES = new Set(['harassment', 'medical', 'unsafe', 'stalking', 'other']);
const DEFAULT_SOS_TYPE = 'other';

// POST /api/sos — private (Student)
const createSOSAlert = async (req, res) => {
  const { type, note, location, coords } = req.body;

  try {
    // Malformed GPS is silently dropped — an SOS must never fail on bad coords.
    let safeCoords;
    if (
      coords &&
      Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90 &&
      Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180
    ) {
      safeCoords = {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : undefined
      };
    }

    // Missing, wrong-case, or unrecognized types default to 'other' — an SOS must never fail on a bad type.
    const rawType = typeof type === 'string' ? type.trim().toLowerCase() : '';
    const safeType = VALID_SOS_TYPES.has(rawType) ? rawType : DEFAULT_SOS_TYPE;

    let safeNote = typeof note === 'string' ? note.trim() : (note || '');
    if (typeof type === 'string' && type.trim() && !VALID_SOS_TYPES.has(rawType)) {
      const typeAnnotation = `[Reported type: ${type.trim()}]`;
      safeNote = safeNote ? `${safeNote} ${typeAnnotation}` : typeAnnotation;
    }

    const alert = await SOSAlert.create({
      student: req.user._id,
      type: safeType,
      note: safeNote || undefined,
      location,
      coords: safeCoords
    });

    const populated = await alert.populate(
      'student',
      `${SOS_STUDENT_FIELDS} phoneNumber guardianPhoneNumber closeContacts`
    );

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel caretakers too.
    sseHub.broadcast('sos:created', {
      id: populated._id,
      type: populated.type,
      status: populated.status,
    });

    // SOS is never fenced to one hostel — broadcast to EVERY caretaker of the student's
    // gender scope, plus all admins, so an away hostel caretaker can never bottleneck it.
    notifyCaretakersAndAdmins(req.user.gender, {
      title: '🚨 SOS ALERT',
      body: `${req.user.name} has raised an emergency (${safeType})!${safeCoords ? ' 📍 Location attached' : ''}`,
      url: '/dashboard/caretaker?view=sos',
      adminUrl: '/dashboard/admin?view=sos',
      urgency: 'high',
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/sos/mine — private (Student)
const getMySOSAlerts = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = { student: req.user._id };
    const alerts = await SOSAlert.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendPage(res, alerts, {
      limit,
      skip,
      label: 'sos/mine',
      count: () => SOSAlert.countDocuments(filter),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/sos — private (Admin/Caretaker/Guard)
//
// Bounded, but note the ordering: newest first, so a truncated response withholds the
// OLDEST alerts. An unresolved alert from last month can therefore fall off the end —
// the dashboard should pass ?status=Active (which shrinks the filter) rather than rely
// on scrolling a campus-wide history.
const getSOSAlerts = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    Object.assign(filter, await genderScopedStudentFilter(req.user));

    const alerts = await SOSAlert.find(filter)
      // Guards receive the operational identity/location only. Emergency phone details
      // are limited to the four staff roles responsible for escalation and follow-up.
      .populate('student', sosStudentFieldsFor(req.user.role))
      .populate('handledBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendPage(res, alerts, {
      limit,
      skip,
      label: 'sos/list',
      count: () => SOSAlert.countDocuments(filter),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/sos/:id/status — private (Admin/Caretaker)
const updateSOSStatus = async (req, res) => {
  const { status, resolutionNote } = req.body;

  try {
    const alert = await SOSAlert.findById(req.params.id).populate('student', 'gender hostelName');
    if (!alert) {
      return res.status(404).json({ message: 'SOS alert not found' });
    }

    // SOS is gender-scoped, not hostel-fenced: any caretaker of the student's gender may act.
    if (!studentInGenderScope(req.user, alert.student)) {
      return res.status(403).json({
        message: 'This alert is outside your scope.',
      });
    }

    if (status) alert.status = status;
    if (resolutionNote) alert.resolutionNote = resolutionNote;
    alert.handledBy = req.user._id;

    const updated = await alert.save();
    const populated = await updated.populate('student', sosStudentFieldsFor(req.user.role));

    sseHub.broadcast('sos:updated', {
      id: populated._id,
      status: populated.status,
      handledBy: req.user._id,
    });

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/sos/stream — private (Admin/Caretaker/Guard), SSE
const streamSOSEvents = (req, res) => {
  sseHub.attach(req, res);
};

module.exports = {
  createSOSAlert,
  getMySOSAlerts,
  getSOSAlerts,
  updateSOSStatus,
  streamSOSEvents
};
