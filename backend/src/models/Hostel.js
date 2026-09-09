const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');

// The campus hostels, promoted from config/hostels.js to a real table so that
// users.hostel_name and users.managed_hostel can carry a real foreign key.
//
// config/hostels.js is STILL the source of truth for the application-level helpers
// (canonicalHostelName, genderForHostel) and for the seed rows in
// db/postgres/001_schema.sql. This model exists so the rare query that needs to join or
// list hostels from the database can, not to replace that module — a five-row lookup
// table does not deserve a round trip on every registration.
const Hostel = getSequelize().define(
  'Hostel',
  {
    name: { type: DataTypes.TEXT, primaryKey: true, allowNull: false },
    gender: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  },
  {
    tableName: 'hostels',
    // The table has created_at but no updated_at: a hostel's name is its identity, so a
    // rename is a new row plus an ON UPDATE CASCADE, not an edit.
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = Hostel;
