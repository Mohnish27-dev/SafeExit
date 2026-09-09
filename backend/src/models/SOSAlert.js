const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields } = require('./_shared');

// The student profile is referenced, not copied, so the latest name/room/phone always
// shows. The SOS views poll hardest of anything in the app — every 8 seconds on both the
// admin and caretaker dashboards — so the indexes on this table matter far more than its
// write volume suggests. They live in db/postgres/001_schema.sql.
const SOSAlert = getSequelize().define(
  'SOSAlert',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },

    type: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'other',
      // Mongoose did this with `lowercase: true, trim: true`. The controller already
      // normalises and falls back to 'other' for anything unrecognised — an SOS must
      // never fail on a bad type — but the CHECK constraint is case-sensitive, so this
      // keeps a direct write from tripping it.
      set(value) {
        this.setDataValue('type', typeof value === 'string' ? value.trim().toLowerCase() : value);
      },
    },
    note: { type: DataTypes.TEXT },
    location: { type: DataTypes.TEXT },

    // Was a nested `coords` subdocument. Flattened to three columns so a query can filter
    // or aggregate on latitude without unpacking JSON, with the nested shape rebuilt by
    // the virtual below — the frontend still reads alert.coords.lat.
    coordLat: { type: DataTypes.DOUBLE, field: 'coord_lat' },
    coordLng: { type: DataTypes.DOUBLE, field: 'coord_lng' },
    // Metres, from the browser Geolocation API.
    coordAccuracy: { type: DataTypes.DOUBLE, field: 'coord_accuracy' },

    coords: {
      type: DataTypes.VIRTUAL,
      // Reads the flattened columns back into the shape the API has always returned.
      // undefined rather than an object of nulls when there is no fix, because that is
      // what an absent Mongo subdocument produced and the UI tests truthiness.
      get() {
        const lat = this.getDataValue('coordLat');
        const lng = this.getDataValue('coordLng');
        if (lat === null || lat === undefined || lng === null || lng === undefined) return undefined;
        const accuracy = this.getDataValue('coordAccuracy');
        return accuracy === null || accuracy === undefined ? { lat, lng } : { lat, lng, accuracy };
      },
      // Accepts the same object the controller already builds, so createSOSAlert keeps
      // passing `coords` straight through. Anything malformed clears all three columns:
      // bad GPS is dropped silently by design — an SOS must never fail on coordinates.
      set(value) {
        const ok =
          value &&
          Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
          Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
        this.setDataValue('coordLat', ok ? value.lat : null);
        this.setDataValue('coordLng', ok ? value.lng : null);
        this.setDataValue(
          'coordAccuracy',
          ok && Number.isFinite(value.accuracy) ? value.accuracy : null
        );
      },
    },

    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Active' },
    handledBy: { type: DataTypes.UUID, field: 'handled_by' },
    resolutionNote: { type: DataTypes.TEXT, field: 'resolution_note' },

    ...timestampFields,
  },
  { tableName: 'sos_alerts' }
);

// The flat columns are an implementation detail of the `coords` virtual; the API shape is
// the nested object it rebuilds.
SOSAlert.jsonHidden = new Set(['coordLat', 'coordLng', 'coordAccuracy']);

module.exports = SOSAlert;
