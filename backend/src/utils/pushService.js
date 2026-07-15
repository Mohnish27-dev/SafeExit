// Web Push notification service. Wraps the `web-push` library and provides
// high-level helpers to notify users by role (and optionally by managedGender).
//
// The Push API is free — the heavy lifting is done by the browser vendors' push
// servers (Google FCM for Chrome, Mozilla for Firefox, Apple APNs for Safari).
// We only need a VAPID key pair to identify ourselves as the sender.

const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');

// Configure VAPID. These keys are generated once (`web-push generate-vapid-keys`)
// and stored in the .env. The subject is a contact email or URL that push servers
// can use to reach the operator if something goes wrong.
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

// Send a push notification to every subscribed device of every user matching
// the given filter. Failed sends (410 Gone = unsubscribed, 404 = expired) are
// cleaned up automatically so we don't keep hitting dead endpoints.
//
// `userFilter` is a Mongoose query object for User, e.g.
//   { role: 'Warden', managedGender: 'Female' }
//
// `payload` is { title, body, url, urgency? }. `url` is the page to open when
// the user clicks the notification (defaults to /dashboard/warden).
const notifyUsers = async (userFilter, payload) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return; // Push not configured

  try {
    // Find all users matching the filter, then all their push subscriptions.
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
      // Long TTL so a message queued while the phone is dozing/offline is still
      // delivered when the device reconnects, instead of silently expiring.
      TTL: 86400, // 24h
      urgency: payload.urgency || 'normal',
    };

    // Fire all push sends in parallel. Individual failures are caught per-sub
    // so one dead endpoint doesn't block the rest.
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, message, options);
        } catch (err) {
          // 410 Gone or 404 Not Found means the subscription is no longer valid
          // (user cleared browser data, unsubscribed, or the push service expired it).
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
          } else {
            // Other errors (VAPID mismatch, 401/403 from the push service,
            // network, 429 rate limit) — log so delivery failures are visible,
            // but don't crash the request that triggered the notification.
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
    // Best-effort: a notification failure should never break the primary action
    // (creating an outing request, SOS alert, etc.).
    console.error('Push notification error:', err.message);
  }
};

// Convenience: notify all wardens managing a specific hostel (gendered scope).
const notifyWardens = (managedGender, payload) =>
  notifyUsers(
    managedGender
      ? { role: 'Warden', managedGender }
      : { role: 'Warden' },
    payload
  );

// Convenience: notify all admins (SOS alerts, critical events).
const notifyAdmins = (payload) =>
  notifyUsers({ role: 'Admin' }, payload);

// Convenience: notify wardens + admins together (SOS). Each role gets a URL
// deep-linking to its own dashboard's SOS section, so tapping the
// notification lands the user directly on the actionable list.
const notifyWardensAndAdmins = async (managedGender, payload) => {
  await Promise.allSettled([
    notifyWardens(managedGender, payload),
    notifyAdmins({ ...payload, url: payload.adminUrl || payload.url }),
  ]);
};

module.exports = {
  notifyUsers,
  notifyWardens,
  notifyAdmins,
  notifyWardensAndAdmins,
  VAPID_PUBLIC_KEY,
};
