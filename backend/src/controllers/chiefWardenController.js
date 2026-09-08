const { Op } = require('sequelize');
const { User, OutingRequest, LeaveApplication, SOSAlert } = require('../models');
const { HOSTELS } = require('../config/hostels');
const { getOverdueStudentIds } = require('../utils/overdue');

const makeHostelSummary = (hostel) => ({
  name: hostel.name,
  gender: hostel.gender,
  students: { total: 0, inside: 0, outside: 0, overdue: 0 },
  activeSOS: 0,
  outings: { pending: 0, forwarded: 0 },
  leaves: { pending: 0, forwarded: 0 },
  caretaker: null,
  warden: null,
});

// GET /api/chief-warden/overview — private (ChiefWarden)
// This is deliberately operational rather than administrative: it exposes hostel
// health and assigned hostel staff, but no account-management or student contact list.
const getOverview = async (req, res) => {
  try {
    const now = new Date();
    const [
      students,
      hostelStaff,
      activeAlerts,
      pendingOutings,
      forwardedOutings,
      pendingLeaves,
      forwardedLeaves,
      overdueIds,
    ] = await Promise.all([
      User.findAll({ where: { role: 'Student' }, attributes: ['id', 'hostelName', 'campusStatus'], raw: true }),
      User.findAll({
        where: { role: { [Op.in]: ['Caretaker', 'Warden'] } },
        attributes: ['id', 'name', 'role', 'managedHostel'],
        raw: true,
      }),
      SOSAlert.findAll({ where: { status: 'Active' }, attributes: ['studentId'], raw: true }),
      // Do not count stale rows that have not yet gone through the lazy expiry
      // sweep performed by their full-list endpoints.
      OutingRequest.findAll({ where: { status: 'Pending', outTime: { [Op.gte]: now } }, attributes: ['studentId'], raw: true }),
      OutingRequest.findAll({ where: { status: 'Forwarded', outTime: { [Op.gte]: now } }, attributes: ['studentId'], raw: true }),
      LeaveApplication.findAll({ where: { status: 'Pending', leaveDate: { [Op.gte]: now } }, attributes: ['studentId'], raw: true }),
      LeaveApplication.findAll({ where: { status: 'Forwarded', leaveDate: { [Op.gte]: now } }, attributes: ['studentId'], raw: true }),
      getOverdueStudentIds(),
    ]);

    const hostels = HOSTELS.map(makeHostelSummary);
    const hostelByName = new Map(hostels.map((hostel) => [hostel.name.toLowerCase(), hostel]));
    const hostelForStudent = new Map();

    const studentsSummary = { total: students.length, inside: 0, outside: 0, overdue: 0 };
    for (const student of students) {
      const hostel = hostelByName.get(String(student.hostelName || '').trim().toLowerCase());
      if (hostel) {
        hostel.students.total += 1;
        hostelForStudent.set(String(student.id), hostel);
      }

      const isOverdue = overdueIds.has(String(student.id)) || student.campusStatus === 'Overdue';
      const state = isOverdue ? 'overdue' : student.campusStatus === 'Outside' ? 'outside' : 'inside';
      studentsSummary[state] += 1;
      if (hostel) hostel.students[state] += 1;
    }

    for (const staff of hostelStaff) {
      const hostel = hostelByName.get(String(staff.managedHostel || '').trim().toLowerCase());
      if (!hostel) continue;
      // `_id` is the response contract; the hostel cards link to the staff member by it.
      const summary = { _id: staff.id, name: staff.name };
      if (staff.role === 'Caretaker') hostel.caretaker = summary;
      if (staff.role === 'Warden') hostel.warden = summary;
    }

    const addRowsToHostel = (rows, apply) => {
      for (const row of rows) {
        const hostel = hostelForStudent.get(String(row.studentId));
        if (hostel) apply(hostel);
      }
    };

    addRowsToHostel(activeAlerts, (hostel) => { hostel.activeSOS += 1; });
    addRowsToHostel(pendingOutings, (hostel) => { hostel.outings.pending += 1; });
    addRowsToHostel(forwardedOutings, (hostel) => { hostel.outings.forwarded += 1; });
    addRowsToHostel(pendingLeaves, (hostel) => { hostel.leaves.pending += 1; });
    addRowsToHostel(forwardedLeaves, (hostel) => { hostel.leaves.forwarded += 1; });

    res.json({
      students: studentsSummary,
      activeSOS: activeAlerts.length,
      outings: { pending: pendingOutings.length, forwarded: forwardedOutings.length },
      leaves: { pending: pendingLeaves.length, forwarded: forwardedLeaves.length },
      hostels,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getOverview };
