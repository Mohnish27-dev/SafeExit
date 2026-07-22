
// Web Push service — wraps `web-push` with role-based notify helpers.

const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');

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

// Push to every device of every user matching `userFilter` (Mongoose query).
// `payload` = { title, body, url, urgency? }. Dead subscriptions (410/404)
// are removed automatically.
const notifyUsers = async (userFilter, payload) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const users = await User.find(userFilter).select('_id').lean();
    if (!users.length) return;

    const userIds = users.map((u) => u._id);
    const subs = await PushSubscription.find({ user: { $in: userIds } }).lean();
    if (!subs.length) return;

    const message = JSON.stringify({
      title: payload.title || 'SafeExit',
      body: payload.body || '',
      url: payload.url || '/dashboard/warden',
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
            await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
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

// Notify the warden(s) responsible for a student. `scope` may be:
//   - a bare gender string (legacy callers) — routes by managedGender.
//   - falsy — notifies every warden.
const wardenFilterForScope = (scope) => {
  if (!scope) return { role: 'Warden' };
  if (typeof scope === 'string') return { role: 'Warden', managedGender: scope };

  const { wardenId, hostelName, gender } = scope;
  if (wardenId) return { role: 'Warden', _id: wardenId };

  if (hostelName) {
    const or = [{ managedHostel: hostelName }];
    // Wardens not yet migrated to a specific hostel still catch by gender.
    if (gender) or.push({ managedHostel: { $exists: false }, managedGender: gender });
    return { role: 'Warden', $or: or };
  }
  if (gender) return { role: 'Warden', managedGender: gender };
  return { role: 'Warden' };
};

const notifyWardens = (scope, payload) =>
  notifyUsers(wardenFilterForScope(scope), payload);

const notifyAdmins = (payload) =>
  notifyUsers({ role: 'Admin' }, payload);

// Wardens + admins together (SOS); each role deep-links to its own dashboard.
// `scope` accepts the same forms as notifyWardens (hostel object or gender string).
const notifyWardensAndAdmins = async (scope, payload) => {
  await Promise.allSettled([
    notifyWardens(scope, payload),
    notifyAdmins({ ...payload, url: payload.adminUrl || payload.url }),
  ]);
};

module.exports = {
  notifyWardens,
  notifyWardensAndAdmins,
  VAPID_PUBLIC_KEY,
};
