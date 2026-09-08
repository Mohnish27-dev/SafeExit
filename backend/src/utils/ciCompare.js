// Case-insensitive text comparison, done the way the schema is indexed for.
//
// In MongoDB, five call sites papered over hostel-name casing with
// .collation({ locale: 'en', strength: 2 }). Postgres has no per-query collation knob of
// that kind, and the zero-extension rule ruled out citext. Instead 001_schema.sql builds
// functional indexes on lower(hostel_name) and lower(managed_hostel) — which the planner
// only uses if the query says lower() the same way. This helper is the single place that
// spelling lives, so a caller cannot accidentally write a comparison that works but
// sequentially scans the table.
//
// The column must be given as the database column name, qualified with the model alias
// when it appears inside an include ('user.managed_hostel'), because that is how
// Sequelize names the joined table in the generated SQL.

const { where, fn, col } = require('sequelize');

const ciEquals = (column, value) => where(fn('lower', col(column)), String(value ?? '').trim().toLowerCase());

module.exports = { ciEquals };
