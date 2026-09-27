const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');

// Campus-wide key/value settings that an admin changes at runtime and that must survive a
// restart — the kind of value an env var cannot hold because nobody redeploys to change
// it. Today that is only the profile-update window (see utils/profileWindow.js).
//
// Values are text, parsed by whoever owns the key. A typed column per setting would be a
// migration per setting; this table is meant to stay small and boring.
const AppSetting = getSequelize().define(
  'AppSetting',
  {
    key: { type: DataTypes.TEXT, primaryKey: true, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
  },
  {
    tableName: 'app_settings',
    timestamps: true,
    createdAt: false,
  }
);

module.exports = AppSetting;
