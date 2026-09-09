# SafeExit — PostgreSQL

The MongoDB → PostgreSQL migration. This directory holds the hand-written DDL; the scripts
that apply and verify it live in `backend/scripts/`.

**The backend on this branch reads and writes PostgreSQL only.** Phases 0 to 3 are done:
schema, ETL, and the whole data layer. Mongoose survives as a dependency solely because
`scripts/etl.js`, `scripts/mongoInventory.js` and `scripts/cutoverVerify.js` read Atlas;
nothing in `src/` imports it.

`main` is still the live MongoDB system. Only Phase 4, the cutover, is left — the runbook
for it is `docs/CUTOVER.md`.

## Files, and the order they run in

| File | When | What it does |
|---|---|---|
| `001_schema.sql` | Phase 1, first | 13 tables, indexes, foreign keys, the two one-active-pass unique indexes. Idempotent. |
| `002_post_etl_constraints.sql` | after the ETL | Rules legacy rows may violate, added `NOT VALID` so they bind future writes without failing on old data. |
| `003_validate_constraints.sql` | after cleaning data | Turns those checks on for the migrated rows too. |
| `004_drop_legacy_ids.sql` | weeks after cutover | Removes the `legacy_id` columns. Read the preconditions at the top first. |

`scripts/cutoverVerify.js` (`npm run pg:verify`) sits between the ETL and the switch. It
reconciles both databases by `legacy_id` and refuses the cutover if anything was written to
Atlas after the ETL read it. Read-only on both sides; `docs/CUTOVER.md` explains what it
does and does not check.

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

Windows note: run these from **inside** WSL, not by wrapping them in PowerShell quotes.
PowerShell 5.1 mangles double quotes when passing arguments to a native `.exe`, so a
`bash -lc "... \"SQL\" ..."` one-liner reaches bash with an unbalanced quote and dies with
``unexpected EOF while looking for matching `"'``.

```bash
wsl                                    # then, at the Ubuntu prompt:
sudo apt update && sudo apt install -y postgresql && sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE safeexit LOGIN PASSWORD 'safeexit_dev'"
sudo -u postgres psql -c "CREATE DATABASE safeexit OWNER safeexit"
exit
```

If you would rather stay in PowerShell, the `--%` stop-parsing token passes the rest of the
line through verbatim. One command per line — `--%` consumes everything after it:

```powershell
wsl --% -e bash -lc "sudo -u postgres psql -c \"CREATE ROLE safeexit LOGIN PASSWORD 'safeexit_dev'\""
wsl --% -e bash -lc "sudo -u postgres psql -c \"CREATE DATABASE safeexit OWNER safeexit\""
```

`sudo service postgresql start` has to be re-run after a Windows reboot — WSL does not
start services on its own.

**If Node gets `ECONNREFUSED 127.0.0.1:5432` while psql inside WSL works**, two things are
usually wrong and both are one-time fixes:

1. *Postgres binds `127.0.0.1` inside WSL.* WSL2 only relays Windows localhost to services
   bound to `0.0.0.0`, so Node on Windows is refused. Add a drop-in rather than editing
   `postgresql.conf`:
   ```bash
   sudo tee /etc/postgresql/16/main/conf.d/10-safeexit-dev.conf <<< "listen_addresses = '*'"
   sudo tee -a /etc/postgresql/16/main/pg_hba.conf <<< "host all all 172.16.0.0/12 scram-sha-256"
   sudo service postgresql restart
   ```
   WSL2 is behind NAT and the Windows firewall, so this does not expose 5432 to the campus
   network. **Do not copy it onto the college server.**

2. *The distro idles out.* WSL2 shuts the VM down seconds after the last `wsl` command, and
   Postgres goes with it — so a command that worked a minute ago is refused now. Fix it from
   Windows in `%USERPROFILE%\.wslconfig`, then `wsl --shutdown` once to apply:
   ```ini
   [wsl2]
   vmIdleTimeout=604800000
   ```
   `vmIdleTimeout=-1` is *not* honoured — use a large positive value in milliseconds.

   **`vmIdleTimeout` does not always hold.** On a later session the VM was still shutting
   down between commands with that setting in place, and `wsl -l --running` reported no
   running distributions seconds after a successful `pg_isready`. The symptom is confusing
   because it is intermittent: one command connects, the next gets `ECONNREFUSED`, and the
   Windows→WSL localhost relay can be broken even while Postgres is listening on
   `0.0.0.0:5432` inside the distro.

   The reliable workaround is to hold the VM open with a long-running process for as long
   as you are working, in its own terminal:
   ```bash
   wsl -u root -e sh -c "service postgresql start; exec sleep 86400"
   ```
   While that is alive, `127.0.0.1:5432` stays reachable from Windows. If only the relay is
   broken (Postgres is listening but Windows cannot reach it), connecting to the distro's
   own address also works — `wsl -u root -e sh -c "hostname -I"` gives it — but that address
   changes on every VM restart, so it is a stopgap for one command rather than something to
   put in `.env`.

Verified on PostgreSQL 16.15 (Ubuntu 24.04, WSL2): `001_schema.sql` applies in 47 statements
to 13 tables / 60 indexes, and re-runs clean.

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
