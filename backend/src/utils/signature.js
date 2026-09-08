// Validation and read helpers for signature images.
//
// Signatures are captured ONCE (onboarding or profile) and stored on the user; request
// documents carry a snapshot copy stamped by the server at submit/approval time.
//
// What changed in the Postgres migration: the bytes are `bytea` now, not base64 text, and
// the user's own signature lives in its own table (user_signatures). The API still speaks
// `data:image/png;base64,...` — the model getters rebuild that exactly — so every check
// in this file is unchanged.

const { Op, literal } = require('sequelize');
const { User } = require('../models');

// A drawn pad signature base64s to ~10-20KB as a PNG. An uploaded photo is JPEG and the
// client resizes it to fit; this leaves margin above the client's ~320KB target.
const MAX_SIGNATURE_BYTES = 400 * 1024;

// PNG or JPEG. Drawn signatures are PNG because they carry a transparent background;
// photographed ones are JPEG, which keeps a camera capture far smaller than PNG would.
const isSignatureDataUrl = (value) =>
  typeof value === 'string' &&
  /^data:image\/(png|jpeg);base64,/.test(value) &&
  value.length <= MAX_SIGNATURE_BYTES;

// Machine-readable contract for "this user has no saved signature yet".
// 428 is deliberate: these endpoints already return 400 and 409 for other reasons
// (and the caretaker dashboard reads 409 as "request expired"), so neither is
// distinguishable client-side. 428 is otherwise unused in this backend.
const SIGNATURE_REQUIRED_CODE = 'SIGNATURE_REQUIRED';
const SIGNATURE_REQUIRED_STATUS = 428;

// The caller's own saved signature, or null.
//
// This used to read req.user.signature, because `protect` loaded the whole user
// document. It no longer does, and now it structurally cannot: the bytes are in
// user_signatures and no query reaches them without asking. Only the submit and approve
// paths actually stamp a signature, so they pay for this single keyed read a few hundred
// times a day rather than a few hundred times a minute.
const fetchOwnSignature = async (user) => {
  if (!user || !user._id) return null;
  const dataUrl = await User.getSignature(user._id);
  return isSignatureDataUrl(dataUrl) ? dataUrl : null;
};

const sendSignatureRequired = (res, message) =>
  res.status(SIGNATURE_REQUIRED_STATUS).json({ code: SIGNATURE_REQUIRED_CODE, message });

// ---- List projections ----
//
// List endpoints never return signature bytes: they are polled every 15-30s and a row can
// carry three ~15KB blobs. They return has*Signature booleans instead, and the UI fetches
// the bytes from GET /:id/signatures when a card expands or a modal opens.
//
// The Mongo version enforced this with a projection string every list query had to
// remember to pass — one word away from a 1000x response. It is the models' defaultScope
// now, so a list query excludes them by DEFAULT and the one endpoint that serves bytes
// opts in with .scope('withSignatures'). The failure mode is inverted: forgetting
// something makes the response too small, not too large.

const SIGNATURE_FIELDS = ['studentSignature', 'caretakerSignature', 'wardenSignature'];

const FLAG_FOR = {
  studentSignature: 'hasStudentSignature',
  caretakerSignature: 'hasCaretakerSignature',
  wardenSignature: 'hasWardenSignature',
};

// Which of these rows carry which signature, without pulling any blob into Node.
//
// One query now, not one per field: Postgres evaluates `<column> IS NOT NULL` per row and
// returns three booleans, so this is a single indexed lookup over the id list instead of
// three. Nothing but ids and booleans crosses the wire — the bytea pages are never even
// read, because a TOASTed value is only fetched when the value itself is selected.
const signaturePresence = async (Model, ids, fields) => {
  const presence = {};
  if (!ids.length) return presence;

  const columns = fields.map((field) => {
    const column = Model.rawAttributes[field]?.field;
    if (!column) throw new Error(`signaturePresence: ${Model.name} has no ${field} attribute`);
    return [field, column];
  });

  const rows = await Model.findAll({
    where: { id: { [Op.in]: ids.map(String) } },
    attributes: [
      'id',
      // Bare column name, not table-qualified: this query has no joins, so it is
      // unambiguous, and it avoids depending on the alias Sequelize picks for the table.
      ...columns.map(([field, column]) => [literal(`("${column}" IS NOT NULL)`), field]),
    ],
    raw: true,
  });

  for (const [field] of columns) {
    presence[field] = new Set(rows.filter((row) => row[field]).map((row) => String(row.id)));
  }
  return presence;
};

const withSignatureFlags = (obj, presence) => {
  const out = { ...obj };
  for (const [field, ids] of Object.entries(presence)) {
    out[FLAG_FOR[field]] = ids.has(String(obj._id ?? obj.id));
  }
  return out;
};

module.exports = {
  isSignatureDataUrl,
  fetchOwnSignature,
  sendSignatureRequired,
  SIGNATURE_FIELDS,
  signaturePresence,
  withSignatureFlags,
  SIGNATURE_REQUIRED_CODE,
  SIGNATURE_REQUIRED_STATUS,
  MAX_SIGNATURE_BYTES,
};
