const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { timestampFields } = require('./_shared');

// The user's reusable signature, lifted out of the user row for the same reason as the
// photo — see UserPhoto.js. Captured once at onboarding or from the profile; the server
// stamps a snapshot copy onto each outing/leave row, so changing this never rewrites
// history.
const UserSignature = getSequelize().define(
  'UserSignature',
  {
    userId: { type: DataTypes.UUID, primaryKey: true, allowNull: false, field: 'user_id' },
    signature: { type: DataTypes.BLOB, allowNull: false },
    mimeType: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'image/png', field: 'mime_type' },
    byteSize: { type: DataTypes.INTEGER, allowNull: false, field: 'byte_size' },
    ...timestampFields,
  },
  { tableName: 'user_signatures' }
);

module.exports = UserSignature;
