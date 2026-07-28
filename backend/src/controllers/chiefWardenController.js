const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');
const { HOSTELS } = require('../config/hostels');
const { getOverdueStudentIds } = require('../utils/overdue');

const makeHostelSummary = (hostel) => ({
  name: hostel.name,
  gender: hostel.gender,
  students: { total: 0, inside: 0, outside: 0, overdue: 0 },
  activeSOS: 0,
  openComplaints: 0,
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
      openComplaints,
      pendingOutings,
      forwardedOutings,
      pendingLeaves,
      forwardedLeaves,
      overdueIds,
    ] = await Promise.all([
      User.find({ role: 'Student' }).select('_id hostelName campusStatus').lean(),
      User.find({ role: { $in: ['Caretaker', 'Warden'] } })
        .select('name role managedHostel')
        .lean(),
      SOSAlert.find({ status: 'Active' }).select('student').lean(),
      Complaint.find({ status: { $in: ['Open', 'In Progress'] } }).select('student').lean(),
      // Do not count stale rows that have not yet gone through the lazy expiry
      // sweep performed by their full-list endpoints.
      OutingRequest.find({ status: 'Pending', outTime: { $gte: now } }).select('student').lean(),
      OutingRequest.find({ status: 'Forwarded', outTime: { $gte: now } }).select('student').lean(),
      LeaveApplication.find({ status: 'Pending', leaveDate: { $gte: now } }).select('student').lean(),
      LeaveApplication.find({ status: 'Forwarded', leaveDate: { $gte: now } }).select('student').lean(),
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
        hostelForStudent.set(String(student._id), hostel);
      }

      const isOverdue = overdueIds.has(String(student._id)) || student.campusStatus === 'Overdue';
      const state = isOverdue ? 'overdue' : student.campusStatus === 'Outside' ? 'outside' : 'inside';
      studentsSummary[state] += 1;
      if (hostel) hostel.students[state] += 1;
    }

    for (const staff of hostelStaff) {
      const hostel = hostelByName.get(String(staff.managedHostel || '').trim().toLowerCase());
      if (!hostel) continue;
      const summary = { _id: staff._id, name: staff.name };
      if (staff.role === 'Caretaker') hostel.caretaker = summary;
      if (staff.role === 'Warden') hostel.warden = summary;
    }

    const addRowsToHostel = (rows, apply) => {
      for (const row of rows) {
        const hostel = hostelForStudent.get(String(row.student));
        if (hostel) apply(hostel);
      }
    };

    addRowsToHostel(activeAlerts, (hostel) => { hostel.activeSOS += 1; });
    addRowsToHostel(openComplaints, (hostel) => { hostel.openComplaints += 1; });
    addRowsToHostel(pendingOutings, (hostel) => { hostel.outings.pending += 1; });
    addRowsToHostel(forwardedOutings, (hostel) => { hostel.outings.forwarded += 1; });
    addRowsToHostel(pendingLeaves, (hostel) => { hostel.leaves.pending += 1; });
    addRowsToHostel(forwardedLeaves, (hostel) => { hostel.leaves.forwarded += 1; });

    res.json({
      students: studentsSummary,
      activeSOS: activeAlerts.length,
      openComplaints: openComplaints.length,
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
