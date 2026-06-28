const ScanLog = require('../models/ScanLog');
const User = require('../models/User');

// @desc    Record a gate scan (entry/exit) for a student
// @route   POST /api/scan
// @access  Private (Guard / Admin)
// Body: { studentId (roll number) OR student (_id), direction: 'IN'|'OUT',
//         outing?, punctuality?, gate? }
const createScanLog = async (req, res) => {
  const { studentId, student, direction, outing, punctuality, gate } = req.body;

  if (!direction || !['IN', 'OUT'].includes(direction)) {
    return res.status(400).json({ message: 'A valid direction (IN/OUT) is required' });
  }

  try {
    // Resolve the student either by Mongo _id or by their roll number (studentId).
    let studentDoc = null;
    if (student) {
      studentDoc = await User.findById(student);
    } else if (studentId) {
      studentDoc = await User.findOne({ studentId, role: 'Student' });
    }

    if (!studentDoc) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const log = await ScanLog.create({
      student: studentDoc._id,
      guard: req.user._id,
      direction,
      outing: outing || undefined,
      punctuality: punctuality || 'N/A',
      gate: gate || 'Main Gate'
    });

    // Keep the student's live campus status in sync with the latest movement.
    studentDoc.campusStatus =
      direction === 'OUT' ? (punctuality === 'Overdue' ? 'Overdue' : 'Outside') : 'Inside';
    studentDoc.lastSeenAt = new Date();
    await studentDoc.save();

    // Any scan implies the scanning guard is active / on duty.
    await User.findByIdAndUpdate(req.user._id, { onDuty: true, lastActiveAt: new Date() });

    const populated = await log.populate('student', 'name studentId roomNumber department year hostelName');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get gate scan logs (most recent first)
// @route   GET /api/scan
// @access  Private (Admin / Warden / Guard)
// Query: direction, limit
const getScanLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.direction) filter.direction = req.query.direction;

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const logs = await ScanLog.find(filter)
      .populate('student', 'name studentId roomNumber department year hostelName campusStatus')
      .populate('guard', 'name studentId')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createScanLog,
  getScanLogs
};
