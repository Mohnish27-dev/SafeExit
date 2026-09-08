const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, timestampFields } = require('./_shared');

// Was an embedded array on the user document. Attribute names deliberately keep the
// Mongoose spelling (credentialID, publicKey) because @simplewebauthn/server is handed
// these objects directly in authController — renaming them would change that call site
// for no gain.
const WebauthnCredential = getSequelize().define(
  'WebauthnCredential',
  {
    id: uuidPk(),
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    // base64url credential id. WebAuthn guarantees this is globally unique; Mongo never
    // asserted it, so the UNIQUE constraint here would only fire on real corruption.
    credentialID: { type: DataTypes.TEXT, allowNull: false, field: 'credential_id' },
    // COSE public key bytes. Stays a raw Buffer, NOT a data URL — this is not an image
    // and @simplewebauthn wants the bytes.
    publicKey: { type: DataTypes.BLOB, field: 'public_key' },
    // bigint, so the pg driver hands it back as a string to avoid precision loss.
    // A WebAuthn signature counter is a uint32, so Number is always exact here and the
    // verifier compares it numerically.
    counter: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      get() {
        const raw = this.getDataValue('counter');
        return raw === null || raw === undefined ? 0 : Number(raw);
      },
    },
    transports: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    ...timestampFields,
  },
  { tableName: 'webauthn_credentials' }
);

WebauthnCredential.jsonHidden = new Set(['id', 'userId', 'createdAt', 'updatedAt']);

module.exports = WebauthnCredential;
