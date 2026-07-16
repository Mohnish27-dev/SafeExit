const mongoose = require('mongoose');

// One doc per subscribed device; a 410 Gone endpoint is auto-deleted by the push service.
const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Exactly as pushManager.subscribe() returns it.
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

// Same browser re-subscribing yields the same endpoint — upsert, don't duplicate.
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
pushSubscriptionSchema.index({ user: 1 });

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
module.exports = PushSubscription;
