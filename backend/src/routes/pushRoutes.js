const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const PushSubscription = require('../models/PushSubscription');
const { VAPID_PUBLIC_KEY } = require('../utils/pushService');

// GET /api/push/vapid-key — public (the key is public by definition)
router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ message: 'Push notifications not configured on this server.' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — private
router.post('/subscribe', protect, async (req, res) => {
  const { subscription } = req.body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ message: 'Invalid push subscription object.' });
  }

  try {
    // Upsert by endpoint so a re-subscribing browser doesn't create a duplicate.
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      {
        user: req.user._id,
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Push subscription saved.' });
  } catch (err) {
    console.error('Push subscribe error:', err.message);
    res.status(500).json({ message: 'Failed to save push subscription.' });
  }
});

// DELETE /api/push/subscribe — private
router.delete('/subscribe', protect, async (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({ message: 'Subscription endpoint is required.' });
  }

  try {
    await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });
    res.json({ message: 'Push subscription removed.' });
  } catch (err) {
    console.error('Push unsubscribe error:', err.message);
    res.status(500).json({ message: 'Failed to remove push subscription.' });
  }
});

module.exports = router;
