const OutingRequest = require('../models/OutingRequest');
const DelayNotice = require('../models/DelayNotice');
const { isReturnLate } = require('./outingRules');
const { notifyCaretakers, notifyStudent } = require('./pushService');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const runOverdueSweep = async () => {
  try {
    const outings = await OutingRequest.find({
      status: 'Out',
      $or: [
        { overdueNotifiedAt: null },
        { overdueNotifiedAt: { $exists: false } },
        { studentOverdueNotifiedAt: null },
        { studentOverdueNotifiedAt: { $exists: false } },
      ],
    })
      .populate('student', 'name hostelName gender')
      .select('student inTime targetCaretaker overdueNotifiedAt studentOverdueNotifiedAt status');

    for (const o of outings) {
      if (!o.student || !isReturnLate(o.inTime)) continue;

      // The student already told staff they're running late — don't follow it with a
      // near-identical "Student Overdue" push. Still stamp overdueNotifiedAt below so
      // the doc drops out of the sweep instead of being re-checked forever.
      const explained = await DelayNotice.exists({ trip: o._id });

      if (!explained && !o.overdueNotifiedAt) {
        const scope = o.targetCaretaker
          ? { caretakerId: o.targetCaretaker }
          : { hostelName: o.student.hostelName, gender: o.student.gender };

        await notifyCaretakers(scope, {
          title: '⏰ Student Overdue',
          body: `${o.student.name} has missed their outing return time.`,
          url: '/dashboard/caretaker?view=overdue',
          urgency: 'high',
        });
        o.overdueNotifiedAt = new Date();
      }

      // A filed delay notice suppresses the duplicate staff push, but still marks
      // that audience handled so this outing does not remain in every sweep.
      if (!o.overdueNotifiedAt) o.overdueNotifiedAt = new Date();

      // Best-effort per doc — a lost-race save just means the next tick retries.
      if (!o.studentOverdueNotifiedAt) {
        await notifyStudent(o.student._id, {
          title: 'Your outing is overdue',
          body: 'Your expected return time has passed. Open your dashboard to report a delay.',
          url: '/dashboard/student',
          urgency: 'high',
        });
        o.studentOverdueNotifiedAt = new Date();
      }
      try {
        await o.save();
      } catch (err) {
        // ignore
      }
    }
  } catch (err) {
    // Never let a bad tick crash the process.
    console.error('Overdue sweep failed:', err.message);
  }
};

// Kick off an immediate sweep, then repeat on the interval. Returns the timer.
const startOverdueSweep = () => {
  runOverdueSweep();
  return setInterval(runOverdueSweep, SWEEP_INTERVAL_MS);
};

module.exports = { startOverdueSweep, runOverdueSweep };
