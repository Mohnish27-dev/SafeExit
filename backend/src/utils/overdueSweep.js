const OutingRequest = require('../models/OutingRequest');
const { isReturnLate } = require('./outingRules');
const { notifyWardens } = require('./pushService');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const runOverdueSweep = async () => {
  try {
    const outings = await OutingRequest.find({ status: 'Out', overdueNotifiedAt: null })
      .populate('student', 'name hostelName gender')
      .select('student inTime targetWarden overdueNotifiedAt status');

    for (const o of outings) {
      if (!o.student || !isReturnLate(o.inTime)) continue;

      const scope = o.targetWarden
        ? { wardenId: o.targetWarden }
        : { hostelName: o.student.hostelName, gender: o.student.gender };

      await notifyWardens(scope, {
        title: '⏰ Student Overdue',
        body: `${o.student.name} has missed their outing return time.`,
        url: '/dashboard/warden?view=overdue',
        urgency: 'high',
      });

      // Best-effort per doc — a lost-race save just means the next tick retries.
      o.overdueNotifiedAt = new Date();
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
