const { SOSAlert } = require('../models');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { notifyCaretakersAndAdmins } = require('../utils/pushService');
const { genderScopedPassScope, mergeWhere, studentInGenderScope } = require('../utils/hostelScope');

const SOS_STUDENT_FIELDS = ['id', 'name', 'studentId', 'roomNumber', 'hostelName', 'department', 'year'];
const SOS_CONTACT_FIELDS = [...SOS_STUDENT_FIELDS, 'phoneNumber', 'guardianPhoneNumber'];
const SOS_CONTACT_ROLES = new Set(['Admin', 'Caretaker', 'Warden', 'ChiefWarden']);

// Guards receive the operational identity and location only. Emergency phone details —
// and the student's nominated close contacts — are limited to the four staff roles
// responsible for escalation and follow-up.
//
// closeContacts used to be part of a projection string because it was an embedded array
// on the user document. It is a table now, so widening the scope for staff means adding
// a nested include rather than a word to a string, and a guard's query never joins it.
const sosStudentInclude = (role, options = {}) => {
  const privileged = SOS_CONTACT_ROLES.has(role);
  return {
    association: 'student',
    attributes: privileged ? SOS_CONTACT_FIELDS : SOS_STUDENT_FIELDS,
    ...(privileged ? { include: [{ association: 'closeContacts' }] } : {}),
    ...options,
  };
};

const HANDLER_FIELDS = ['id', 'name', 'role'];

const VALID_SOS_TYPES = new Set(['harassment', 'medical', 'unsafe', 'stalking', 'other']);
const DEFAULT_SOS_TYPE = 'other';

const loadAlert = (id, role) =>
  SOSAlert.findByPk(id, {
    include: [sosStudentInclude(role), { association: 'handledByUser', attributes: HANDLER_FIELDS }],
  });

// POST /api/sos — private (Student)
const createSOSAlert = async (req, res) => {
  const { type, note, location, coords } = req.body;

  try {
    // Malformed GPS is silently dropped — an SOS must never fail on bad coords. The
    // `coords` setter on the model applies the same latitude/longitude sanity check, so
    // this stays belt-and-braces rather than the only guard.
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
      studentId: req.user._id,
      type: safeType,
      note: safeNote || undefined,
      location,
      // Assigning the virtual splits this across coord_lat/coord_lng/coord_accuracy.
      coords: safeCoords,
    });

    // Always the full contact form: whoever receives this is escalating it.
    const populated = await loadAlert(alert.id, 'Admin');

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel caretakers too.
    sseHub.broadcast('sos:created', {
      id: populated.id,
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
    const where = { studentId: req.user._id };
    const alerts = await SOSAlert.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
    });

    return sendPage(res, alerts, {
      limit,
      skip,
      label: 'sos/mine',
      count: () => SOSAlert.count({ where }),
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
    const scope = genderScopedPassScope(req.user);
    const where = mergeWhere(scope.where, req.query.status ? { status: req.query.status } : null);

    // The scope decides whether the student join filters and whether it is required; the
    // caller's role decides which columns come back through it.
    const scopedStudent = scope.include[0];
    const include = [
      sosStudentInclude(req.user.role, { required: scopedStudent.required, where: scopedStudent.where }),
      { association: 'handledByUser', attributes: HANDLER_FIELDS },
    ];

    const alerts = await SOSAlert.findAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    return sendPage(res, alerts, {
      limit,
      skip,
      label: 'sos/list',
      count: () => SOSAlert.count({ where, include: scope.include, distinct: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/sos/:id/status — private (Admin/Caretaker)
const updateSOSStatus = async (req, res) => {
  const { status, resolutionNote } = req.body;

  try {
    const alert = await SOSAlert.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });
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

    await alert.save();
    const populated = await loadAlert(alert.id, req.user.role);

    sseHub.broadcast('sos:updated', {
      id: populated.id,
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
