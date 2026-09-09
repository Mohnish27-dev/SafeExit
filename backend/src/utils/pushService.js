// Web Push service — wraps `web-push` with role-based notify helpers.

const webpush = require('web-push');
const { Op } = require('sequelize');
const { PushSubscription } = require('../models');
const { ciEquals } = require('./ciCompare');

// VAPID keys generated once (`web-push generate-vapid-keys`), stored in .env.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@safeexit.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    'VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY not set in .env — push notifications disabled.'
  );
}

// Push to every device of every user matching `userFilter` (a Sequelize `where` on users).
// `payload` = { title, body, url, urgency? }. Dead subscriptions (410/404) are removed
// automatically.
//
// This used to be two round trips — select the matching user ids, then select every
// subscription whose `user` was in that list. The second query carried the whole id list
// as an $in, which for a role fan-out across every caretaker is the same shape as the
// hostelScope problem. It is one INNER JOIN now, and the users table is never read into
// Node at all (`attributes: []`).
const notifyUsers = async (userFilter, payload) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const subs = await PushSubscription.findAll({
      include: [{ association: 'user', where: userFilter, attributes: [], required: true }],
    });
    if (!subs.length) return;

    const message = JSON.stringify({
      title: payload.title || 'NITP-SafeExit',
      body: payload.body || '',
      url: payload.url || '/dashboard/caretaker',
      urgency: payload.urgency || 'normal',
    });

    const options = {
      TTL: 86400, // 24h — survive device doze/offline
      urgency: payload.urgency || 'normal',
    };

    // Parallel sends; per-sub failures don't block the rest.
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, message, options);
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.destroy({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error(
              'Push send failed:',
              err.statusCode || '',
              err.body || err.message
            );
          }
        }
      })
    );
  } catch (err) {
    // Best-effort: never break the triggering action.
    console.error('Push notification error:', err.message);
  }
};

// Notify the caretaker(s) responsible for a student. `scope` may be:
//   - a bare gender string (legacy callers) — routes by managedGender.
//   - falsy — notifies every caretaker.
//
// `{ managedHostel: { $exists: false } }` became `managedHostel: null`: an absent Mongo
// field and a NULL column are the same "not assigned to a hostel yet", and the column is
// nullable precisely so it can mean that.
const staffFilterForScope = (role, scope) => {
  if (!scope) return { role };
  if (typeof scope === 'string') return { role, managedGender: scope };

  const { caretakerId, hostelName, gender } = scope;
  if (caretakerId && role === 'Caretaker') return { role, id: caretakerId };

  if (hostelName) {
    // Case-insensitive on purpose: a hostel name reaching here came off a student row,
    // and users_role_managed_ci is the index built for exactly this comparison.
    // 'user.' qualifies the column because this filter is applied inside the include
    // above, where Sequelize aliases the joined users table as `user`.
    const or = [ciEquals('user.managed_hostel', hostelName)];
    // Staff not yet migrated to a specific hostel still catch by gender.
    if (gender) or.push({ managedHostel: null, managedGender: gender });
    return { role, [Op.or]: or };
  }
  if (gender) return { role, managedGender: gender };
  return { role };
};

const caretakerFilterForScope = (scope) => staffFilterForScope('Caretaker', scope);
const wardenFilterForScope = (scope) => staffFilterForScope('Warden', scope);

const notifyCaretakers = (scope, payload) =>
  notifyUsers(caretakerFilterForScope(scope), payload);

const notifyAdmins = (payload) =>
  notifyUsers({ role: 'Admin' }, payload);

// ChiefWarden is campus-wide oversight, so it takes no hostel/gender scope.
const notifyChiefWardens = (payload) =>
  notifyUsers({ role: 'ChiefWarden' }, payload);

// A single student, e.g. to confirm their delay notice was acknowledged.
const notifyStudent = (studentId, payload) => {
  if (!studentId) return Promise.resolve();
  return notifyUsers({ role: 'Student', id: studentId }, payload);
};

const notifyWarden = (wardenId, payload) => {
  if (!wardenId) return Promise.resolve();
  return notifyUsers({ role: 'Warden', id: wardenId }, payload);
};

const notifyWardensForScope = (scope, payload) =>
  notifyUsers(wardenFilterForScope(scope), payload);

const notifyHostelStaffAndAdmins = async (scope, payload) => {
  await Promise.allSettled([
    notifyCaretakers(scope, payload),
    notifyWardensForScope(scope, { ...payload, url: payload.wardenUrl || payload.url }),
    notifyAdmins({ ...payload, url: payload.adminUrl || payload.url }),
    notifyChiefWardens({ ...payload, url: payload.chiefWardenUrl || payload.adminUrl || payload.url }),
  ]);
};

const notifyCaretakersAndAdmins = notifyHostelStaffAndAdmins;

module.exports = {
  notifyCaretakers,
  notifyWarden,
  notifyWardensForScope,
  notifyChiefWardens,
  notifyStudent,
  notifyHostelStaffAndAdmins,
  notifyCaretakersAndAdmins,
  VAPID_PUBLIC_KEY,
  // Exported for tests: the scope-to-filter mapping is where a routing bug would hide.
  caretakerFilterForScope,
  wardenFilterForScope,
};
