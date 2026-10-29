const { Op } = require('sequelize');
const { User, LeaveApplication, OutingRequest } = require('../models');
const { genderForHostel } = require('../config/hostels');
const { ciEquals } = require('../utils/ciCompare');
const { isReturnLate } = require('../utils/outingRules');

// GET /api/caretaker/selectable — private (Student)
// Lists the caretakers a student may route a request to: every assigned caretaker whose
// managed gender matches the student's own gender (the boys<->girls fence). The
// student's own-hostel caretaker is flagged isDefault so the client can pre-select it.
// The gender boundary is enforced here on the server — the client list is convenience only.
const getSelectableCaretakers = async (req, res) => {
  try {
    const gender = req.user.gender || genderForHostel(req.user.hostelName);
    if (!gender) {
      return res.json([]);
    }

    const caretakers = await User.findAll({
      where: { role: 'Caretaker', managedGender: gender },
      attributes: ['id', 'name', 'managedHostel'],
      order: [['managedHostel', 'ASC']],
      raw: true,
    });

    const ownHostel = String(req.user.hostelName || '').trim().toLowerCase();
    const list = caretakers.map((w) => ({
      // The response key stays `_id`: the student's caretaker picker sends this value
      // straight back as targetCaretaker.
      _id: w.id,
      name: w.name,
      hostel: w.managedHostel,
      isDefault: String(w.managedHostel || '').trim().toLowerCase() === ownHostel,
    }));

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/caretaker/stats — private (Caretaker)
// Live occupancy for the dashboard's "Live Stats" card.
// Default returns `{ outNow }` for backward-compatibility with existing tests.
// Passing `?detailed=true` returns the full breakdown for the caretaker's managed hostel:
// `{ outNow, total, inside, outside, onLeave, overdue, hostel }`.
const getCaretakerStats = async (req, res) => {
  try {
    const managedHostel = String(req.user?.managedHostel || req.query?.hostel || '').trim();
    const isDetailed = Boolean(req.query?.detailed);

    if (!managedHostel) {
      return res.json(
        isDetailed
          ? { outNow: 0, total: 0, inside: 0, outside: 0, onLeave: 0, overdue: 0, hostel: '' }
          : { outNow: 0 }
      );
    }

    // Gate scans maintain campusStatus atomically, making it the live occupancy source.
    const outNow = await User.count({
      where: {
        role: 'Student',
        campusStatus: { [Op.in]: ['Outside', 'Overdue'] },
        [Op.and]: [ciEquals('hostel_name', managedHostel)],
      },
    });

    if (!isDetailed) {
      return res.json({ outNow });
    }

    const [total, inside, onLeaveApps, outings] = await Promise.all([
      User.count({
        where: {
          role: 'Student',
          residency: 'Hostel',
          [Op.and]: [ciEquals('hostel_name', managedHostel)],
        },
      }),
      User.count({
        where: {
          role: 'Student',
          residency: 'Hostel',
          campusStatus: 'Inside',
          [Op.and]: [ciEquals('hostel_name', managedHostel)],
        },
      }),
      LeaveApplication.findAll({
        where: { status: 'Out' },
        include: [
          {
            association: 'student',
            where: { [Op.and]: [ciEquals('hostel_name', managedHostel)] },
            attributes: ['id'],
          },
        ],
        attributes: ['id', 'studentId'],
        raw: true,
      }),
      OutingRequest.findAll({
        where: { status: 'Out' },
        include: [
          {
            association: 'student',
            where: { [Op.and]: [ciEquals('hostel_name', managedHostel)] },
            attributes: ['id'],
          },
        ],
        attributes: ['id', 'studentId', 'inTime'],
        raw: true,
      }),
    ]);

    const onLeave = onLeaveApps.length;
    let overdue = 0;
    for (const o of outings) {
      if (isReturnLate(o.inTime)) overdue++;
    }
    const outside = Math.max(0, outNow - onLeave - overdue);

    res.json({
      outNow,
      total,
      inside,
      outside,
      onLeave,
      overdue,
      hostel: managedHostel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/caretaker/on-leave — private (Caretaker)
// Lists all students belonging to this caretaker's hostel who are currently away on an active leave.
// Once a student returns and security scans their QR at the main gate, their leave transitions
// from 'Out' -> 'Returned' and campusStatus -> 'Inside', removing them from this roster instantly.
const getOnLeaveStudents = async (req, res) => {
  try {
    const managedHostel = String(req.user?.managedHostel || req.query?.hostel || '').trim();
    if (!managedHostel) return res.json([]);

    const leaves = await LeaveApplication.findAll({
      where: { status: 'Out' },
      include: [
        {
          association: 'student',
          where: { [Op.and]: [ciEquals('hostel_name', managedHostel)] },
          attributes: [
            'id',
            'name',
            'studentId',
            'roomNumber',
            'phoneNumber',
            'guardianPhoneNumber',
            'department',
            'year',
            'hostelName',
          ],
        },
      ],
      order: [['returnDate', 'ASC']],
    });

    const list = leaves.map((l) => ({
      _id: l.id,
      id: l.id,
      student: l.student
        ? {
            _id: l.student.id,
            id: l.student.id,
            name: l.student.name,
            rollNumber: l.student.studentId,
            studentId: l.student.studentId,
            roomNumber: l.student.roomNumber,
            phoneNumber: l.student.phoneNumber,
            guardianPhoneNumber: l.student.guardianPhoneNumber,
            department: l.student.department,
            year: l.student.year,
            hostelName: l.student.hostelName,
          }
        : null,
      destination: l.destination,
      reason: l.reason,
      leaveDate: l.leaveDate,
      returnDate: l.returnDate,
      expectedDepartureTime: l.expectedDepartureTime,
      parentPhone: l.parentPhone,
      isEmergency: l.isEmergency,
      status: l.status,
      decidedAt: l.decidedAt,
      decidedByRole: l.decidedByRole,
      createdAt: l.createdAt,
    }));

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/caretaker/active-outings — private (Caretaker)
// Lists all students belonging to this caretaker's hostel who are currently out on an outing.
const getActiveOutings = async (req, res) => {
  try {
    const managedHostel = String(req.user?.managedHostel || req.query?.hostel || '').trim();
    if (!managedHostel) return res.json([]);

    const outings = await OutingRequest.findAll({
      where: { status: 'Out' },
      include: [
        {
          association: 'student',
          where: { [Op.and]: [ciEquals('hostel_name', managedHostel)] },
          attributes: [
            'id',
            'name',
            'studentId',
            'roomNumber',
            'phoneNumber',
            'guardianPhoneNumber',
            'department',
            'year',
            'hostelName',
          ],
        },
      ],
      order: [['inTime', 'ASC']],
    });

    const list = outings.map((o) => ({
      _id: o.id,
      id: o.id,
      student: o.student
        ? {
            _id: o.student.id,
            id: o.student.id,
            name: o.student.name,
            rollNumber: o.student.studentId,
            studentId: o.student.studentId,
            roomNumber: o.student.roomNumber,
            phoneNumber: o.student.phoneNumber,
            guardianPhoneNumber: o.student.guardianPhoneNumber,
            department: o.student.department,
            year: o.student.year,
            hostelName: o.student.hostelName,
          }
        : null,
      destination: o.destination || 'Campus Outing',
      purpose: o.purpose || 'Outing',
      outingType: o.outingType,
      outTime: o.outTime || o.actualOutTime,
      inTime: o.inTime,
      isOverdue: isReturnLate(o.inTime),
      status: o.status,
      createdAt: o.createdAt,
    }));

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/caretaker/students — private (Caretaker)
// Lists all students residing in this caretaker's hostel with their live campus status.
const getHostelStudents = async (req, res) => {
  try {
    const managedHostel = String(req.user?.managedHostel || req.query?.hostel || '').trim();
    if (!managedHostel) return res.json([]);

    const { getAwayStudentIds } = require('../utils/overdue');
    const { overdueIds, onLeaveIds } = await getAwayStudentIds();

    const students = await User.findAll({
      where: {
        role: 'Student',
        residency: 'Hostel',
        [Op.and]: [ciEquals('hostel_name', managedHostel)],
      },
      attributes: [
        'id',
        'name',
        'studentId',
        'roomNumber',
        'hostelName',
        'department',
        'year',
        'phoneNumber',
        'guardianPhoneNumber',
        'campusStatus',
        'lastSeenAt',
        'createdAt',
      ],
      order: [['roomNumber', 'ASC'], ['name', 'ASC']],
      raw: true,
    });

    for (const s of students) {
      if (['Outside', 'Overdue'].includes(s.campusStatus)) {
        const id = String(s.id);
        s.campusStatus = overdueIds.has(id) ? 'Overdue' : onLeaveIds.has(id) ? 'OnLeave' : 'Outside';
      }
      s._id = s.id;
    }

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSelectableCaretakers,
  getCaretakerStats,
  getOnLeaveStudents,
  getActiveOutings,
  getHostelStudents,
};
