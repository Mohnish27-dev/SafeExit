const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields, parseDataUrl, toDataUrl } = require('./_shared');
const UserPhoto = require('./UserPhoto');
const UserSignature = require('./UserSignature');

const sequelize = getSequelize();

// The polymorphic account table: Student + staff (managedHostel/managedGender) + Guard
// (onDuty), exactly as the Mongo document was. What is NOT here any more are the two
// embedded arrays and the two base64 blobs — closeContacts, webAuthnCredentials, photo
// and signature all live in their own tables now (see models/index.js for the wiring).
const User = sequelize.define(
  'User',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    name: { type: DataTypes.TEXT, allowNull: false },

    // login_id and email were `unique + sparse` in Mongoose. A Postgres UNIQUE constraint
    // already permits many NULLs, which is exactly that behaviour — many staff accounts
    // share "no email". The lowercasing that Mongoose did with `lowercase: true` is a
    // CHECK constraint in the schema, so it is enforced against every writer, not just
    // this one; the setters below keep this writer on the right side of it.
    loginId: {
      type: DataTypes.TEXT,
      field: 'login_id',
      set(value) {
        const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : value;
        this.setDataValue('loginId', trimmed === '' ? null : trimmed ?? null);
      },
    },
    email: {
      type: DataTypes.TEXT,
      set(value) {
        const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : value;
        this.setDataValue('email', trimmed === '' ? null : trimmed ?? null);
      },
    },
    // Optional: a WebAuthn-only account has none.
    password: { type: DataTypes.TEXT },

    // ChiefWarden is the campus-wide hostel oversight role: below Admin, but not tied to
    // one hostel the way Warden/Caretaker are.
    role: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Student' },
    gender: { type: DataTypes.TEXT },

    // Staff scoping. managedGender is derived from the managed hostel's gender.
    managedGender: { type: DataTypes.TEXT, field: 'managed_gender' },
    // A real FK to hostels(name). No Sequelize association is declared for it on purpose:
    // an association would make toJSON collapse `hostelName` into a nested object, and
    // every frontend view reads `hostelName` as a string. The FK still does its job in
    // the database; config/hostels.js still answers the questions the app asks.
    managedHostel: { type: DataTypes.TEXT, field: 'managed_hostel' },

    // Roll number. The gate's college-ID-card path resolves students by THIS value
    // (resolveStudent in scanController), so it survived the migration byte-exact.
    // Note the collision of names, which the schema forced: this is users.student_id, the
    // roll number, while outing_requests.student_id is a foreign key to users.id.
    studentId: { type: DataTypes.TEXT, field: 'student_id' },
    department: { type: DataTypes.TEXT },
    year: { type: DataTypes.TEXT },
    roomNumber: { type: DataTypes.TEXT, field: 'room_number' },
    hostelName: { type: DataTypes.TEXT, field: 'hostel_name' },
    phoneNumber: { type: DataTypes.TEXT, field: 'phone_number' },
    // 002_post_etl_constraints.sql rejects the empty string where it allows NULL, because
    // '' is not a phone number and 16 legacy users stored one. Normalise here so no
    // caller has to remember.
    guardianPhoneNumber: {
      type: DataTypes.TEXT,
      field: 'guardian_phone_number',
      set(value) {
        const trimmed = typeof value === 'string' ? value.trim() : value;
        this.setDataValue('guardianPhoneNumber', trimmed === '' ? null : trimmed ?? null);
      },
    },

    // Live gate state, maintained by gate scans and duty toggles.
    campusStatus: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Inside', field: 'campus_status' },
    lastSeenAt: { type: DataTypes.DATE, field: 'last_seen_at' },
    onDuty: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'on_duty' },
    lastActiveAt: { type: DataTypes.DATE, field: 'last_active_at' },

    // webAuthnRegistered is a convenience flag; webAuthnCredentials is the source of truth.
    // The explicit `field` matters here: Sequelize's automatic snake_casing would produce
    // web_authn_registered, and the column is webauthn_registered.
    webAuthnRegistered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'webauthn_registered' },
    // Transient challenge issued during a WebAuthn ceremony, verified on the next request.
    currentChallenge: { type: DataTypes.TEXT, field: 'current_challenge' },

    // ---- Virtuals that preserve the Mongo document shape ----
    //
    // `photo` and `signature` were string fields on the user document and are still
    // strings in every API response. They now come from user_photos / user_signatures,
    // so reading them requires the association to have been included — which is the
    // point: a list endpoint that does not ask for them cannot accidentally transfer
    // them. Undefined here means "not loaded", the same thing an unselected Mongo field
    // meant, and utils/signature.js already treats that as "not set up yet".
    photo: {
      type: DataTypes.VIRTUAL,
      get() {
        const row = this.photoRow;
        return row ? toDataUrl(row.photo, row.mimeType) : undefined;
      },
    },
    signature: {
      type: DataTypes.VIRTUAL,
      get() {
        const row = this.signatureRow;
        return row ? toDataUrl(row.signature, row.mimeType) : undefined;
      },
    },

    ...timestampFields,
  },
  {
    tableName: 'users',
    hooks: {
      // The port of userSchema.pre('save'). Fires on create and on instance.save(); it
      // does NOT fire for User.update(), exactly as Mongoose's pre('save') did not fire
      // for updateOne. Every password write in this codebase goes through an instance.
      beforeSave: async (user) => {
        if (!user.changed('password') || !user.password) return;
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      },
    },
  }
);

// photoRow/signatureRow are the raw join rows behind the `photo`/`signature` virtuals and
// carry nothing a caller wants. password and currentChallenge were never in a response
// and are hidden structurally here rather than relying on every projection to omit them.
User.jsonHidden = new Set(['photoRow', 'signatureRow', 'currentChallenge', 'password']);

User.prototype.matchPassword = function (enteredPassword) {
  // A WebAuthn-only account has no password hash. bcrypt.compare against undefined
  // throws rather than returning false, which would surface as a 500 on a login attempt.
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(String(enteredPassword), this.password);
};

// ---------------------------------------------------------------------------
// Blob writes
//
// `user.photo = dataUrl; await user.save()` cannot work any more — the bytes are in
// another table. These are the replacement, and they keep the encode/decode in the data
// layer where the rest of it lives. Passing null deletes the row, which is how a photo
// gets cleared.
// ---------------------------------------------------------------------------

const writeBlob = async (Model, column, userId, dataUrl, options = {}) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    await Model.destroy({ where: { userId }, ...options });
    return null;
  }
  const [row] = await Model.upsert(
    {
      userId,
      [column]: parsed.buffer,
      mimeType: parsed.mime,
      byteSize: parsed.buffer.length,
    },
    options
  );
  return row;
};

User.setPhoto = (userId, dataUrl, options) => writeBlob(UserPhoto, 'photo', userId, dataUrl, options);
User.setSignature = (userId, dataUrl, options) => writeBlob(UserSignature, 'signature', userId, dataUrl, options);

// One-row reads for the two per-row byte endpoints (GET /users/:id/photo and the
// signature stamping path), so a caller that only wants the bytes does not have to build
// an include.
User.getPhoto = async (userId) => {
  const row = await UserPhoto.findByPk(userId);
  return row ? toDataUrl(row.photo, row.mimeType) : null;
};
User.getSignature = async (userId) => {
  const row = await UserSignature.findByPk(userId);
  return row ? toDataUrl(row.signature, row.mimeType) : null;
};

module.exports = User;
