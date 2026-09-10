// The Sequelize instance — the Postgres counterpart to config/db.js.
//
// config/postgres.js already owns every tuning decision (pool size, the timeouts that
// turn a dead database into an error instead of a hang, SSL). This file does NOT
// re-derive any of that: it reads poolConfig() and hands the numbers to Sequelize in the
// shape Sequelize wants them. One place to change a timeout, not two.
//
// Deliberately absent: sequelize.sync(). The schema is owned by db/postgres/*.sql and
// applied by scripts/applySchema.js. sync() would let a model typo silently reshape a
// production table, which is exactly the failure mode the numbered DDL files exist to
// prevent. The models describe the schema; they do not create it. test/schemaDdl.test.js
// and test/modelSchemaDrift.test.js assert the two never drift apart.

const { Sequelize } = require("sequelize");
const { poolConfig, connectionString } = require("./postgres");

let sequelize = null;

// Sequelize logs every statement to console.log by default, which on a 15s dashboard poll
// is a wall of SQL nobody reads. Off unless explicitly asked for.
const logging = () =>
	process.env.SQL_LOG === "true"
		? (sql, ms) => console.log(`[sql ${ms}ms] ${sql}`)
		: false;

const buildOptions = () => {
	const cfg = poolConfig();

	return {
		dialect: "postgres",
		logging: logging(),
		benchmark: process.env.SQL_LOG === "true",

		// Every model maps camelCase attributes onto snake_case columns EXPLICITLY, via
		// `field:` on each attribute. Sequelize's automatic underscored:true is not used:
		// its lodash-based snake_case turns `webAuthnRegistered` into `web_authn_registered`
		// while the column is `webauthn_registered`, and that mismatch would surface as a
		// runtime "column does not exist" rather than at boot.
		define: {
			underscored: false,
			timestamps: true,
			freezeTableName: true,
			createdAt: "createdAt",
			updatedAt: "updatedAt",
		},

		pool: {
			max: cfg.max,
			min: 0,
			// Sequelize's own name for pg's connectionTimeoutMillis: how long a request waits
			// for a free pooled connection before failing rather than queueing forever.
			acquire: cfg.connectionTimeoutMillis,
			idle: cfg.idleTimeoutMillis,
		},

		dialectOptions: {
			// Server-side kill switch for a runaway query. Sequelize has no option of its own
			// for this; it passes dialectOptions straight to the pg Client.
			statement_timeout: cfg.statement_timeout,
			application_name: cfg.application_name,

			// PG_SCHEMA moves every unqualified table reference into a named schema, by setting
			// the connection's search_path. Unset (the normal case) means `public` and changes
			// nothing.
			//
			// It exists because backend/stress/ boots the REAL app and seeds a hundred students
			// — it must never be able to touch the working data. The dev role cannot CREATEDB,
			// so a throwaway schema is the isolation that is actually available, and it is the
			// same constraint the college's server will impose. It is also the hook if they ever
			// want the app in a named schema rather than public.
			...(process.env.PG_SCHEMA
				? { options: `-c search_path=${process.env.PG_SCHEMA}` }
				: {}),
		},

		// A campus LAN can drop a connection without either side noticing. Retry the
		// handful of errors that mean "the socket died", not the ones that mean "your
		// query is wrong".
		retry: {
			max: 2,
			match: [
				/ECONNRESET/,
				/ECONNREFUSED/,
				/Connection terminated unexpectedly/,
			],
		},
	};
};

// Defining a model does not need a reachable database, and several tests exercise the
// models with nothing but stubs. So a missing DATABASE_URL is NOT fatal here — it is
// fatal in connectPostgres() below, at boot, where the message can be a useful one
// instead of an ECONNREFUSED ten frames deep in the pg driver.
const getSequelize = () => {
	if (!sequelize) {
		const url = connectionString();
		sequelize = url
			? new Sequelize(url, buildOptions())
			: new Sequelize(buildOptions());
	}
	return sequelize;
};

// Called once at boot. Proves the credentials work and prints what we actually connected
// to, so a misconfigured DATABASE_URL fails at startup rather than on the first scan.
const connectPostgres = async () => {
	if (!connectionString()) {
		// Same trade as config/db.js: nothing in this app works without the database, so
		// failing to start is correct, and saying why plainly is the whole value of the check.
		console.error(
			"[db] DATABASE_URL is not set. The backend cannot start without PostgreSQL — see backend/db/postgres/README.md.",
		);
		process.exit(1);
	}
	const db = getSequelize();
	try {
		await db.authenticate();
		const [[info]] = await db.query(
			"SELECT current_database() AS db, version() AS version, current_setting('max_connections') AS max_conn",
		);
		const version = String(info.version).split(" ").slice(0, 2).join(" ");
		console.log(
			`PostgreSQL Connected: ${info.db} (${version}, max_connections=${info.max_conn}, pool max=${poolConfig().max})`,
		);
		// The pool is a hard global limit shared with everything else on the college box.
		// Silently exceeding it looks like random connection failures under load.
		if (
			Number(info.max_conn) > 0 &&
			poolConfig().max > Number(info.max_conn) / 2
		) {
			console.warn(
				`[db] pool max (${poolConfig().max}) is over half the server's max_connections ` +
					`(${info.max_conn}). Lower PG_MAX_POOL_SIZE unless this app owns the server.`,
			);
		}
	} catch (error) {
		console.error(`[db] could not connect: `, error);
		process.exit(1);
	}
	return db;
};

const closePostgres = async () => {
	if (sequelize) {
		await sequelize.close();
		sequelize = null;
	}
};

module.exports = { getSequelize, connectPostgres, closePostgres, buildOptions };
