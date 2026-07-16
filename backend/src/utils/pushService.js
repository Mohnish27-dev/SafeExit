
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

const notifyWardens = (managedGender, payload) =>
  notifyUsers(
    managedGender
      ? { role: 'Warden', managedGender }
      : { role: 'Warden' },
    payload
  );

const notifyAdmins = (payload) =>
  notifyUsers({ role: 'Admin' }, payload);

// Wardens + admins together (SOS); each role deep-links to its own dashboard.
const notifyWardensAndAdmins = async (managedGender, payload) => {
  await Promise.allSettled([
    notifyWardens(managedGender, payload),
    notifyAdmins({ ...payload, url: payload.adminUrl || payload.url }),
  ]);
};

module.exports = {
  notifyWardens,
  notifyWardensAndAdmins,
  VAPID_PUBLIC_KEY,
};
