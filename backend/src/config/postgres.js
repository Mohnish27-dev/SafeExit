// PostgreSQL connection configuration.
//
// Deliberately mirrors the philosophy of config/db.js: every one of these defaults to
// "wait forever" in the driver, which is the wrong trade for a gate station. A student
// standing at the barrier would rather see an error in a few seconds than watch a spinner
// while requests pile up behind a database that is not answering.
//
// The numbers here can be tighter than the Mongo ones were, because after the migration
// the database is on the campus LAN rather than across the internet at Atlas — removing
// that internet dependency is the main reason for the move.

const num = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// DATABASE_URL is the single source of truth, so the college can hand us a connection
// string without us guessing at host/port/user layout.
//   postgres://user:password@host:5432/safeexit
const connectionString = () => process.env.DATABASE_URL;

// The campus Postgres is on the LAN and will not speak TLS; a managed/remote one will.
// PGSSLMODE=require turns it on without a code change.
const sslConfig = () => {
  const mode = (process.env.PGSSLMODE || '').trim().toLowerCase();
  if (!mode || mode === 'disable') return false;
  // rejectUnauthorized:false covers a self-signed campus certificate. Set
  // PGSSLMODE=verify-full only once there is a CA the server actually chains to.
  return { rejectUnauthorized: mode === 'verify-full' };
};

// PG_SCHEMA moves every unqualified table reference into a named schema by setting the
// connection's search_path. Unset — the normal case, and always the case in production —
// means `public` and changes nothing.
//
// src/config/sequelize.js sets this for the app's own connection. It has to be set here
// too, because the migration scripts (applySchema, etl, cutoverVerify) open raw `pg`
// clients that never touch Sequelize. Without it a rehearsal in a throwaway schema would
// silently load the real ETL into `public` — the working data — which is the one outcome
// a rehearsal must not be able to produce.
const schemaOptions = () =>
  (process.env.PG_SCHEMA ? { options: `-c search_path=${process.env.PG_SCHEMA}` } : {});

const poolConfig = () => ({
  connectionString: connectionString(),
  ssl: sslConfig(),
  ...schemaOptions(),

  // Cap on concurrent server connections from this process. Postgres' own max_connections
  // is a hard global limit (default 100) shared with every other app on the college box,
  // so this must stay well under whatever they allocate us — unlike Mongo, where the pool
  // was ours alone. Confirm the server's max_connections before raising this.
  max: num(process.env.PG_MAX_POOL_SIZE, 20),

  // How long a request waits for a free pooled connection before failing. The pg default
  // is 0 = wait forever, which is the shape of an outage that looks like a hang.
  connectionTimeoutMillis: num(process.env.PG_CONNECTION_TIMEOUT_MS, 10000),

  // Return idle connections to the server rather than holding them open all night.
  idleTimeoutMillis: num(process.env.PG_IDLE_TIMEOUT_MS, 30000),

  // Server-side kill switch for a runaway query. Must stay comfortably above the slowest
  // legitimate query — the campus-wide history reads and the analytics pipelines.
  statement_timeout: num(process.env.PG_STATEMENT_TIMEOUT_MS, 30000),

  application_name: process.env.PG_APPLICATION_NAME || 'safeexit',
});

// Scripts (schema apply, ETL) want a pool with no statement timeout, because a bulk load
// or an index build legitimately runs for minutes.
const migrationPoolConfig = () => ({
  ...poolConfig(),
  max: num(process.env.PG_MIGRATION_POOL_SIZE, 4),
  statement_timeout: 0,
  application_name: 'safeexit-migration',
});

module.exports = { poolConfig, migrationPoolConfig, connectionString };
