// Shared plumbing for every Sequelize model.
//
// Two jobs, both about keeping the JSON contract identical to the Mongoose one so that
// none of the 22 frontend files that read `_id` off a response has to change:
//
//   1. `_id` — Postgres primary keys are uuid columns named `id`. Every response still
//      says `_id`, mapped here, at the data layer, exactly as planned.
//   2. base64 blobs — photos and signatures are `bytea` in the database and were base64
//      `data:` URLs in Mongo. The API still speaks data URLs; the conversion happens in
//      attribute getters/setters so no controller has to know.

const crypto = require('crypto');
const { DataTypes } = require('sequelize');

// ---------------------------------------------------------------------------
// Primary keys
// ---------------------------------------------------------------------------

// UUIDs are generated in Node, never by the server: gen_random_uuid() is built in only
// from PG 13 and otherwise needs pgcrypto, and the college's extension permissions were
// never going to be a thing worth blocking the migration on. See db/postgres/001_schema.sql.
const uuidPk = () => ({
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
  defaultValue: () => crypto.randomUUID(),
});

// Dropped by db/postgres/004_drop_legacy_ids.sql after cutover. Until then every model
// carries it so the ETL stays re-runnable and a support question ("which Mongo document
// was this?") is answerable.
const legacyId = () => ({
  type: DataTypes.CHAR(24),
  allowNull: true,
  unique: true,
  field: 'legacy_id',
});

// Sequelize is configured with underscored:false and explicit `field:` everywhere, so the
// two timestamp columns need naming too. Spread into every model's attribute list.
const timestampFields = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};

// ---------------------------------------------------------------------------
// The `_id` JSON contract
// ---------------------------------------------------------------------------

// Only ever applied to output this data layer produced, so "has an `id`" unambiguously
// means "was a row". `_id` is added alongside `id` rather than replacing it: responses
// stay byte-compatible with the Mongoose ones for existing readers, and anything written
// after the migration can use the honest name.
const applyIdContract = (value) => {
  if (Array.isArray(value)) return value.map(applyIdContract);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    // The mime columns exist so the data layer can rebuild the exact data URL. They are
    // an implementation detail of that rebuild and were never in the Mongo documents.
    if (key.endsWith('SignatureMime') || key === 'mimeType') continue;
    out[key] = applyIdContract(val);
  }
  if (out.id !== undefined && out._id === undefined) out._id = out.id;
  return out;
};

const EMPTY_SET = new Set();

const isModelInstance = (value) =>
  !!value && typeof value === 'object' && typeof value.toJSON === 'function' && !!value.constructor?.associations;

// Installed on every model by models/index.js. Three jobs beyond the plain `_id`:
//
//  1. It recurses through loaded associations by calling THEIR toJSON, rather than
//     letting get({plain:true}) flatten them — which would skip a nested model's own
//     jsonHidden set and its FK collapsing.
//
//  2. It collapses each belongs-to pair back into the single field the Mongoose response
//     had. Sequelize refuses to let an association alias equal an attribute name, so the
//     foreign key stays `approvedBy` (the Mongo name, so filters read the same) and the
//     association is aliased `approvedByUser`. Here the two become one `approvedBy` again
//     — the raw id when nothing was included, the populated object when it was, exactly
//     the shape `.populate('approvedBy')` produced.
//
//  3. It drops whatever the model listed in `jsonHidden`: password hashes, the flat
//     columns behind a virtual, and the join rows behind the photo/signature virtuals.
function idContractToJSON() {
  const model = this.constructor;
  const hidden = model.jsonHidden || EMPTY_SET;
  const raw = this.get();

  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (hidden.has(key)) continue;
    if (key.endsWith('SignatureMime') || key === 'mimeType') continue;
    out[key] = isModelInstance(val)
      ? val.toJSON()
      : Array.isArray(val)
        ? val.map((item) => (isModelInstance(item) ? item.toJSON() : applyIdContract(item)))
        : applyIdContract(val);
  }

  for (const association of Object.values(model.associations || {})) {
    if (association.associationType !== 'BelongsTo') continue;
    const { as: alias, foreignKey: fk } = association;
    const jsonKey = association.options?.jsonKey;
    if (!jsonKey) continue;
    if (hidden.has(alias) || hidden.has(jsonKey) || hidden.has(fk)) {
      delete out[alias];
      delete out[fk];
      continue;
    }
    // Loaded => the populated object wins; not loaded => the foreign key stands in.
    // Either way exactly one field survives, under the name the API has always used.
    const loaded = Object.prototype.hasOwnProperty.call(out, alias);
    out[jsonKey] = loaded ? out[alias] : out[fk];
    if (alias !== jsonKey) delete out[alias];
    if (fk !== jsonKey) delete out[fk];
  }

  if (out.id !== undefined && out._id === undefined) out._id = out.id;
  return out;
}

// ---------------------------------------------------------------------------
// base64 data URLs <-> bytea
// ---------------------------------------------------------------------------

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/is;

// Returns null for anything that is not a base64 data URL, which is the same "absent"
// the callers already treat as "not set up yet" (see utils/signature.js).
const parseDataUrl = (value) => {
  if (typeof value !== 'string') return null;
  const match = DATA_URL_RE.exec(value.trim());
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return null;
  return { buffer, mime: match[1].toLowerCase() };
};

const toDataUrl = (buffer, mime) => {
  if (!buffer || !buffer.length) return null;
  return `data:${mime || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
};

// Defines the `<name>` / `<name>Mime` attribute pair for one inline blob column.
//
// The getter rebuilds the data URL the API has always returned; the setter takes a data
// URL and splits it. Assigning null or a non-data-URL clears both halves, so a bad write
// can never leave bytes behind with a stale mime type.
//
// `fallbackMime` is what a row migrated before mime types were recorded gets described
// as. The ETL sets the real value for everything it loaded, so this only covers rows
// written by hand.
const blobAttribute = (name, column, fallbackMime) => ({
  [name]: {
    type: DataTypes.BLOB,
    field: column,
    allowNull: true,
    get() {
      const buf = this.getDataValue(name);
      if (!buf) return null;
      return toDataUrl(buf, this.getDataValue(`${name}Mime`) || fallbackMime);
    },
    set(value) {
      const parsed = parseDataUrl(value);
      this.setDataValue(name, parsed ? parsed.buffer : null);
      this.setDataValue(`${name}Mime`, parsed ? parsed.mime : null);
    },
  },
  [`${name}Mime`]: {
    type: DataTypes.TEXT,
    field: `${column}_mime`,
    allowNull: true,
  },
});

// The column pair for one inline blob, for building `attributes.exclude` lists.
const blobColumns = (name) => [name, `${name}Mime`];

module.exports = {
  uuidPk,
  legacyId,
  timestampFields,
  applyIdContract,
  idContractToJSON,
  parseDataUrl,
  toDataUrl,
  blobAttribute,
  blobColumns,
};
