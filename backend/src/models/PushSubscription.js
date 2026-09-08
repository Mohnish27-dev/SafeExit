const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields } = require('./_shared');

// One row per subscribed device. A 410 Gone endpoint is deleted by utils/pushService.js.
//
// Mongo stored the browser's subscription object verbatim, nested two deep
// ({ endpoint, keys: { p256dh, auth } }), and put the unique index on the dotted path
// 'subscription.endpoint'. Here the three values are plain columns with a real UNIQUE on
// endpoint, and the `subscription` virtual rebuilds the nested object — which matters
// because web-push is handed that object shape directly.
const PushSubscription = getSequelize().define(
  'PushSubscription',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },

    // Same browser re-subscribing yields the same endpoint, so this is what an upsert
    // conflicts on rather than creating a duplicate device row.
    endpoint: { type: DataTypes.TEXT, allowNull: false },
    p256dh: { type: DataTypes.TEXT, allowNull: false },
    auth: { type: DataTypes.TEXT, allowNull: false },

    subscription: {
      type: DataTypes.VIRTUAL,
      // Exactly the shape web-push's sendNotification() expects, and exactly what
      // pushManager.subscribe() returned on the client.
      get() {
        const endpoint = this.getDataValue('endpoint');
        if (!endpoint) return undefined;
        return {
          endpoint,
          keys: {
            p256dh: this.getDataValue('p256dh'),
            auth: this.getDataValue('auth'),
          },
        };
      },
      // Accepts the raw object straight off the request body, so the subscribe route
      // stays a one-liner. The NOT NULL columns reject an incomplete one at the
      // database, which is stricter than the old nested-required fields were in practice.
      set(value) {
        this.setDataValue('endpoint', value?.endpoint ?? null);
        this.setDataValue('p256dh', value?.keys?.p256dh ?? null);
        this.setDataValue('auth', value?.keys?.auth ?? null);
      },
    },

    ...timestampFields,
  },
  { tableName: 'push_subscriptions' }
);

// The flat columns are the storage; `subscription` is the shape every caller works with.
PushSubscription.jsonHidden = new Set(['endpoint', 'p256dh', 'auth']);

module.exports = PushSubscription;
