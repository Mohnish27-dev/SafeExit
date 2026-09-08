const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, timestampFields } = require('./_shared');

// Was an embedded array on the user document with a Mongoose validator capping it at two.
//
// The cap is now STRUCTURAL rather than validated: `slot` is CHECKed to 1..2 and UNIQUE
// per user, so a third contact has nowhere to go — including on a write path that never
// called save(), which the old validator could not cover.
const CloseContact = getSequelize().define(
  'CloseContact',
  {
    id: uuidPk(),
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    // 1 or 2. Named `slot` and not `position` because POSITION is an SQL function name.
    slot: { type: DataTypes.SMALLINT, allowNull: false },
    name: { type: DataTypes.TEXT, allowNull: false },
    mobileNumber: { type: DataTypes.TEXT, allowNull: false, field: 'mobile_number' },
    roomNumber: { type: DataTypes.TEXT, allowNull: false, field: 'room_number' },
    ...timestampFields,
  },
  { tableName: 'close_contacts' }
);

// The Mongoose subdocument was declared `{ _id: false }` and serialised as exactly three
// fields. Keep that shape: the frontend renders these as a contact card and has never
// seen a row id, a user id or timestamps on one.
CloseContact.jsonHidden = new Set(['id', 'userId', 'createdAt', 'updatedAt']);

module.exports = CloseContact;
