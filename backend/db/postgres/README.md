# SafeExit — PostgreSQL

The MongoDB → PostgreSQL migration. This directory holds the hand-written DDL; the scripts
that apply and verify it live in `backend/scripts/`.

Nothing in the running application reads PostgreSQL yet. `MONGO_URI` is still the live
database, and the app is unchanged. This is Phase 1 groundwork.

## Files, and the order they run in

| File | When | What it does |
|---|---|---|
| `001_schema.sql` | Phase 1, first | 13 tables, indexes, foreign keys, the two one-active-pass unique indexes. Idempotent. |
| `002_post_etl_constraints.sql` | after the ETL | Rules legacy rows may violate, added `NOT VALID` so they bind future writes without failing on old data. |
| `003_validate_constraints.sql` | after cleaning data | Turns those checks on for the migrated rows too. |
| `004_drop_legacy_ids.sql` | weeks after cutover | Removes the `legacy_id` columns. Read the preconditions at the top first. |

```
001  →  ETL  →  002  →  clean the data  →  003        …then, much later, 004
```

## Standing up a database

### 1. Set `DATABASE_URL`

In `backend/.env` (which is gitignored and stays that way):

```
DATABASE_URL=postgres://safeexit:safeexit_dev@127.0.0.1:5432/safeexit
```

Optional tuning knobs are documented in `backend/src/config/postgres.js`.
`PGSSLMODE=require` turns on TLS for a server that wants it; the campus LAN one will not.

### 2. Get a server running — pick one

**Docker (matches what the compose file expects):**

```bash
docker compose up -d postgres      # from the repo root
```

**WSL** (Ubuntu 24.04 ships PostgreSQL 16; WSL2 forwards `localhost`, so Windows reaches
it on `127.0.0.1:5432`):

```bash
wsl -e bash -lc "sudo apt update && sudo apt install -y postgresql && sudo service postgresql start"
wsl -e bash -lc "sudo -u postgres psql -c \"CREATE ROLE safeexit LOGIN PASSWORD 'safeexit_dev'\""
wsl -e bash -lc "sudo -u postgres psql -c 'CREATE DATABASE safeexit OWNER safeexit'"
```

`sudo service postgresql start` has to be re-run after a Windows reboot — WSL does not
start services on its own.

**Native Windows:** the EDB installer from postgresql.org, then create the role and
database with the bundled pgAdmin or `psql`.

### 3. Apply and verify

```bash
cd backend
npm run pg:schema     # applies 001 and then verifies it
npm run pg:check      # verifies only — touches nothing but catalog tables
```

`pg:schema` prints the server version and `max_connections` on connect, which is how the
"what version does the college run?" question gets answered without waiting for anyone.
It refuses to run against anything below 9.5.

## Before touching the college server

`npm run pg:check` is safe to run as a first connection test: it reads catalog tables and
row counts and writes nothing. Use it to confirm the connection string, the role's
permissions, and the version before running `pg:schema` for real.

The schema needs no extensions, no superuser, and no `CREATE DATABASE` — `CREATE` on the
target database and its schema is enough. That is deliberate: it means the college can
hand over a single restricted role and nothing in this directory has to change.

## Before touching the data

```bash
cd backend
npm run pg:inventory     # strictly read-only, safe against live Atlas
```

This measures the source data and pre-flights every constraint the new schema adds — a
duplicate roll number, a hostel spelled two ways, a student holding two active passes, a
foreign key pointing at a deleted user. Each of those fails the ETL. It also reports which
database the data actually lives in, because `MONGO_URI` ends at the host with no database
name and has been relying on the driver default.

Then `mongodump` the database it names. That dump is the rollback.

## Notes on the schema

**PostgreSQL 9.5+, zero extensions.** UUIDs are generated in Node rather than by
`gen_random_uuid()`, and case-insensitive hostel matching uses a `lower()` functional index
rather than `citext`. Both dependencies were designed out so the college's version and
extension permissions are not a blocker. Develop against 16; it applies unchanged on 12.

**`legacy_id`** on eight tables holds the source MongoDB ObjectId. The ETL resolves foreign
keys through it in a second pass and stays idempotent via `ON CONFLICT (legacy_id) DO
UPDATE`, so it can be re-run while being debugged. `004` removes it after cutover.

**The one-active-pass indexes** are the biggest structural win here. In MongoDB the
equivalent needed 6.0+ for `$in` inside `partialFilterExpression`, could fail to build
*silently*, and needed `utils/verifyIndexes.js` to prove at startup that it had not. In
PostgreSQL the DDL either applies or it fails loudly. Their status list must stay identical
to `ACTIVE_PASS_STATUSES` in `src/config/passStatuses.js` — `test/schemaDdl.test.js`
asserts that, along with the role, status and hostel lists, so drift fails the suite rather
than quietly reopening the double-submit race.

**Blobs are `bytea`, not `text`.** Decoded bytes are ~25% smaller than the base64 the API
speaks, and `mime_type` is stored alongside so the data layer rebuilds the exact
`data:<mime>;base64,...` string the frontend already expects. Face photos and reusable
signatures moved to `user_photos` / `user_signatures`, making the roster budget that
`test/rosterPhotoBudget.test.js` guards by convention a structural property instead.
