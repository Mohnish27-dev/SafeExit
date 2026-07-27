const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const { genderForHostel } = require('../config/hostels');
const { caretakerStudentFilter, COLLATION } = require('../utils/caretakerScope');
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

    const caretakers = await User.find({ role: 'Caretaker', managedGender: gender })
      .select('_id name managedHostel')
      .sort({ managedHostel: 1 })
      .lean();

    const ownHostel = String(req.user.hostelName || '').trim().toLowerCase();
    const list = caretakers.map((w) => ({
      _id: w._id,
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
// Live occupancy for the dashboard's "Live Stats" card: how many from THIS caretaker's
// hostel are off campus right now. Counts only — no student identities are returned.
//
// Scoped by RESIDENCE (hostelName), not by request routing. A student may route a request
// to another hostel's caretaker, but they still sleep in this building — occupancy has to
// follow where they live, or a routed-away student would be counted by the wrong hostel
// and missing from their own.
//
// Counted from the PASS (status 'Out'), never User.campusStatus, so a half-failed gate
// scan can't drift the number. Outing + leave, deduped by student.
//   outNow       — students currently off campus.
//   overdue      — the subset past their return window (same isReturnLate the gate enforces).
//   totalStudents— the hostel roster, for the share bar.
const getCaretakerStats = async (req, res) => {
  try {
    const studentFilter = caretakerStudentFilter(req.user);

    const empty = {
      outNow: 0,
      overdue: 0,
      totalStudents: 0,
      generatedAt: new Date(),
    };

    // No hostel and no gender configured — the caretaker oversees nobody yet.
    if (!studentFilter) return res.json(empty);

    // Only the ids are needed now that names are never rendered.
    const residents = await User.find(studentFilter)
      .collation(COLLATION)
      .select('_id')
      .lean();

    if (residents.length === 0) return res.json(empty);

    const ids = residents.map((s) => s._id);

    const [outOutings, outLeaves] = await Promise.all([
      // Pull the return window so overdue is derived with the gate's own rule.
      OutingRequest.find({ status: 'Out', student: { $in: ids } })
        .select('student inTime')
        .lean(),
      LeaveApplication.find({ status: 'Out', student: { $in: ids } })
        .select('student returnDate')
        .lean(),
    ]);

    // A student shouldn't hold an outing and a leave pass at once, but dedupe anyway so a
    // data anomaly can never report more students out than actually live here. First pass
    // wins; outings are checked first since they're the shorter, more time-critical trip.
    const dueByStudent = new Map();
    for (const o of outOutings) {
      const key = String(o.student);
      if (!dueByStudent.has(key)) dueByStudent.set(key, o.inTime);
    }
    for (const l of outLeaves) {
      const key = String(l.student);
      if (!dueByStudent.has(key)) dueByStudent.set(key, l.returnDate);
    }

    let overdue = 0;
    for (const due of dueByStudent.values()) {
      if (isReturnLate(due)) overdue += 1;
    }

    res.json({
      outNow: dueByStudent.size,
      overdue,
      totalStudents: residents.length,
      generatedAt: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSelectableCaretakers, getCaretakerStats };

