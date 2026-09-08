// The Postgres analogue of Mongo's estimatedDocumentCount().
//
// One list endpoint — GET /api/outing/all, the chief warden's campus-wide view — has no
// predicate at all, so an exact COUNT(*) reads every row in the table purely to fill in
// the X-Total-Count header. Mongo answered that from collection metadata; Postgres keeps
// the same statistic in pg_class.reltuples, maintained by autovacuum/ANALYZE.
//
// It is an ESTIMATE, which is the right trade for a header describing a list the caller is
// paging through anyway. Where the number has to be exact, use Model.count().
//
// reltuples is -1 on a table that has never been analysed (and 0 on an genuinely empty
// one), so fall back to a real count rather than reporting a negative total. On a small
// table that fallback is cheap, which is exactly when it happens.

const { getSequelize } = require('../config/sequelize');

const estimatedRowCount = async (Model) => {
  const table = String(Model.getTableName());
  try {
    const row = await getSequelize().query(
      'SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = to_regclass(:table)',
      { plain: true, replacements: { table } }
    );
    const estimate = row ? Number(row.estimate) : -1;
    if (Number.isFinite(estimate) && estimate >= 0) return estimate;
  } catch (err) {
    console.warn(`[rowCount] estimate for ${table} failed, falling back to count(): ${err.message}`);
  }
  return Model.count();
};

module.exports = { estimatedRowCount };
