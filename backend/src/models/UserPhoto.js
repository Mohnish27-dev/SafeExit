const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { timestampFields } = require('./_shared');

// The student face photo, lifted out of the user row.
//
// In MongoDB, test/rosterPhotoBudget.test.js kept these ~300KB blobs off list endpoints
// BY CONVENTION — a test asserting nobody adds `photo` to a projection string. Here it is
// structural: the bytes are in a different table, so a careless SELECT * on the roster
// physically cannot pull them. The security dashboard polls that roster every 15 seconds.
//
// user_id is the primary key: one photo per user, enforced by the schema rather than by
// whoever wrote the upload handler.
const UserPhoto = getSequelize().define(
  'UserPhoto',
  {
    userId: { type: DataTypes.UUID, primaryKey: true, allowNull: false, field: 'user_id' },
    photo: { type: DataTypes.BLOB, allowNull: false },
    mimeType: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'image/jpeg', field: 'mime_type' },
    // Denormalised so a "how much are we storing" query never reads the blobs themselves.
    byteSize: { type: DataTypes.INTEGER, allowNull: false, field: 'byte_size' },
    ...timestampFields,
  },
  { tableName: 'user_photos' }
);

module.exports = UserPhoto;
