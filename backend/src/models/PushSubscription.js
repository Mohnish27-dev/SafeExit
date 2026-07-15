const mongoose = require('mongoose');

// Each browser/device that subscribes to push notifications gets its own
// PushSubscription document. A single user (warden) may have multiple devices
// (phone, tablet, laptop) — each one subscribes independently and gets its own
// push endpoint from the browser vendor (Google FCM, Mozilla, Apple APNs).
//
// When we need to notify e.g. "all wardens managing the girls' hostel", we look
// up every PushSubscription whose `user` has role=Warden + managedGender=Female,
// and fire a web-push message to each endpoint. If the endpoint returns 410 Gone
// (user unsubscribed or cleared browser data), we auto-delete the stale doc.

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // The PushSubscription object exactly as the browser's
  // `pushManager.subscribe()` returns it — an endpoint URL plus the two
  // encryption keys the push service needs to deliver the message.
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
}, {
  timestamps: true,
});

// One device = one endpoint. If the user re-subscribes on the same browser,
// the endpoint will be the same so we upsert rather than create duplicates.
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
// Fast lookup when broadcasting to a role.
pushSubscriptionSchema.index({ user: 1 });

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
module.exports = PushSubscription;
