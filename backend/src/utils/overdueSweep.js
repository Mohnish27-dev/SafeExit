const { Op } = require('sequelize');
const { OutingRequest, DelayNotice, EmailOtp } = require('../models');
const { isReturnLate } = require('./outingRules');
const { notifyCaretakers, notifyStudent } = require('./pushService');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const runOverdueSweep = async () => {
  try {
    const outings = await OutingRequest.findAll({
      where: {
        status: 'Out',
        // Mongo needed four clauses here because a field could be null OR absent. A
        // column is only ever NULL, so two say the same thing.
        [Op.or]: [{ overdueNotifiedAt: null }, { studentOverdueNotifiedAt: null }],
      },
      attributes: [
        'id',
        'studentId',
        'inTime',
        'targetCaretaker',
        'overdueNotifiedAt',
        'studentOverdueNotifiedAt',
        'status',
      ],
      include: [{ association: 'student', attributes: ['id', 'name', 'hostelName', 'gender'] }],
    });

    for (const o of outings) {
      if (!o.student || !isReturnLate(o.inTime)) continue;

      // The student already told staff they're running late — don't follow it with a
      // near-identical "Student Overdue" push. Still stamp overdueNotifiedAt below so
      // the row drops out of the sweep instead of being re-checked forever.
      const explained = (await DelayNotice.count({ where: { outingId: o.id } })) > 0;

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

      // Best-effort per row — a lost-race save just means the next tick retries.
      if (!o.studentOverdueNotifiedAt) {
        await notifyStudent(o.student.id, {
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

  // The replacement for the MongoDB TTL index on email_otps. Postgres has no TTL, and
  // pg_cron was deliberately not adopted for one DELETE — this tick already runs every
  // five minutes, so it carries it. Kept out of the try above so a failing overdue sweep
  // does not also stop the cleanup, and vice versa.
  //
  // Not a security boundary: otpController checks expiresAt on every read regardless of
  // when this last ran, so an unswept row is never accepted. This is housekeeping.
  try {
    await EmailOtp.purgeExpired();
  } catch (err) {
    console.error('Expired OTP purge failed:', err.message);
  }
};

// Kick off an immediate sweep, then repeat on the interval. Returns the timer.
const startOverdueSweep = () => {
  runOverdueSweep();
  return setInterval(runOverdueSweep, SWEEP_INTERVAL_MS);
};

module.exports = { startOverdueSweep, runOverdueSweep };
