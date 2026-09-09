# Deploying SafeExit on the college server

A **fresh install**. No data is migrated from anywhere: the college server starts with an
empty database and real records accumulate from the first day it is used.

That decision removes most of what `docs/CUTOVER.md` describes. There is nothing to freeze,
nothing to reconcile, and no old sessions to keep alive, because there is no old system on
this machine. Read this file, not that one.

**Budget half a day for the first attempt**, most of it waiting on other people: the
database role, the DNS name, and physical access to the gate station.

Steps 3 to 6 were rehearsed against a genuinely empty database before this was written: the
DDL and both constraint files apply, the five hostels seed, `ensureAdmins` provisions the
admin accounts from environment variables alone, the admin console answers on every
endpoint including the analytics pipelines with zero rows to aggregate, and admin sign-in
works. What was *not* rehearsed is anything specific to the machine itself — Docker, the
college's PostgreSQL, nginx, and the scanner.

---

## What you are standing up

| Piece | Where it runs | Notes |
|---|---|---|
| PostgreSQL 16 | the college's own server | They hand over one restricted role. No extensions, no superuser, no `CREATE DATABASE`. |
| Backend API | Docker, port 5000 on loopback | Image pulled from Docker Hub. |
| Frontend | Docker, port 3000 on loopback | Same. |
| nginx | the host | `nginx/safeexit.conf`. The only thing listening publicly. |

Neither container is exposed directly. nginx is the front door, which is what lets the
gate station reach the app by a plain campus hostname.

---

## 1. Before you go

**Ask the college for four things**, because each has a lead time:

1. A PostgreSQL database and a role that owns it. `CREATE` on that database and its schema
   is enough. The schema needs no extensions and no superuser, which is deliberate.
2. The hostname the app will answer on, and whether it will have TLS.
3. Docker installed on the box, with the Compose plugin. Engine 20.10 or newer.
4. Whether the machine can reach Docker Hub. If it cannot, the images have to be carried in
   with `docker save` and `docker load`, and that changes the plan enough to know early.

**Take one archive dump of the old Atlas cluster** and put it somewhere offline. Not a
rollback, since nothing here depends on it, but it is the only record of what the trial
collected and it costs one command. `mongodump` ships in the MongoDB Database Tools:

```powershell
winget install MongoDB.DatabaseTools
```

Then, from `backend/`, in a new terminal:

```powershell
$uri = node -e "require('dotenv').config({quiet:true});const u=new URL(process.env.MONGO_URI);u.pathname='/test';process.stdout.write(u.toString())"
mongodump --uri "$uri" --out .\dump-archive
```

Do not write `$MONGO_URI` directly. That is shell syntax, the value lives in `backend/.env`
rather than in the environment, and PowerShell would pass the literal string.

After that dump exists, the Atlas cluster can be shut down whenever you like.

---

## 2. Merge to main

Safe now, and it was not before. The deploy workflow used to SSH into EC2 on every push to
`main`, which would have pushed a PostgreSQL backend onto a box with no PostgreSQL, where it
would have crash-looped rather than started. **That job is removed.** The workflow now only
builds the two images and pushes them to Docker Hub.

```bash
git checkout main
git merge mohnish_new_branch
git push origin main
```

This is a fast-forward. `main` has nothing of its own — it is a strict ancestor of the
branch — so there is no conflict to resolve. The one conflict described in `CUTOVER.md`
only appears if you first put the maintenance middleware on `main`, and a fresh install has
no reason to.

Watch the Actions run finish, then confirm both tags updated on Docker Hub.

---

## 3. Set up the database

From a machine that can reach the database, with `DATABASE_URL` set:

```bash
cd backend
npm run pg:check      # reads catalog tables only. Writes nothing.
```

Run this **first**, always. It reports the server version, `max_connections`, and whether
the role can see anything, so a wrong connection string or a missing permission surfaces
before you try to create tables. It refuses to run against PostgreSQL older than 9.5.

Then apply the schema:

```bash
npm run pg:schema         # 001 — 13 tables, 60 indexes, both one-active-pass guards
npm run pg:constraints    # 002
npm run pg:validate       # 003 — instant here; there are no legacy rows to check
```

`002` and `003` exist to let a *migrated* database adopt rules its old rows might violate.
On an empty database they apply in one step and there is nothing to clean up first.

**You do not need Node on the college server.** Once the images are pulled in step 5, the
same commands run inside the backend container, and the DDL ships with the image:

```bash
docker compose -f docker-compose.prod.yml run --rm backend npm run pg:schema
```

### What you get for free

`001_schema.sql` seeds the five hostels — Kautilya, Aryabhatta and Nagarjuna for men,
Kadambini and Sarojini for women. Correct them there if the college's list differs, before
anyone registers, because a student row references a hostel by name.

---

## 4. Write `backend/.env`

Copy `backend/.env.example` and fill it in. Every variable is documented in that file. The
four that decide whether this works at all:

```
JWT_SECRET=<48 random bytes, fresh — never the development value>
DATABASE_URL=postgres://safeexit:...@host.docker.internal:5432/safeexit
FRONTEND_URL=http://safeexit.nitp.ac.in
ADMIN_1_NAME= / ADMIN_1_ID= / ADMIN_1_PIN=
```

**`host.docker.internal`, not `127.0.0.1`.** Inside a container, `127.0.0.1` is the
container. A `DATABASE_URL` pointing at localhost fails to connect while `psql` on the host
works perfectly, which is a confusing hour if you have not seen it before.
`docker-compose.prod.yml` maps that name to the host gateway for exactly this reason. A
database on a *different* machine takes its real hostname instead.

**`COOKIE_SECURE=false` and `ENABLE_HSTS=0` until TLS actually works.** Secure cookies over
plain HTTP are dropped silently, which kills the live event stream, because `EventSource`
cannot send an Authorization header. HSTS is worse: once a browser caches it, that host is
HTTPS-only there for a year, and one accidental HTTPS hit would leave the gate station
unable to load the app at all.

**`LEGACY_ID_GRACE=false`.** It accepts MongoDB ObjectIds as token subjects and exists only
for the weeks after a migration. This database was never migrated.

`MONGO_URI` is not needed. Nothing under `src/` reads it.

Admins come from the `ADMIN_n_*` variables, and the server provisions them on every boot.
Adding an admin later is an environment change and a restart, not a database edit.

**All three of `ADMIN_1_NAME`, `ADMIN_1_ID` and `ADMIN_1_PIN` are credentials.** Signing in
to the admin console requires the name as well as the ID and PIN, so a typo in the name
locks that admin out just as surely as a wrong PIN would.

---

## 5. Start it

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f backend
```

The boot log should show the PostgreSQL version, the pool size, and the admins it ensured.
It tells you plainly when email or push is disabled for a missing variable; both are
optional and nothing at the gate depends on either.

Then nginx: copy `nginx/safeexit.conf` into place, set `server_name` to the real hostname,
and reload. It proxies `/` to the frontend and `/api/backend/` straight to the API, the
second so the real client address survives for the rate limiter.

```bash
curl -si http://localhost:5000/health
```

---

## 6. Prove it works

In this order, because each step depends on the one before.

1. **Sign in as admin.** This takes **three** fields, not two: the name, the Admin ID and
   the PIN, all exactly as set in `.env`. `ADMIN_1_NAME` is a credential here, not a label,
   and a login with the right ID and PIN but no name is refused with `Invalid credentials`.
   If sign-in fails outright, the allowlist did not load and the boot log will say so.
2. **Create the staff** the college needs: a guard, one caretaker and one warden per hostel,
   and the chief warden. Hostel and gender scope decide what each of them can see.
3. **Register one student**, or have one register, and check they land in the right hostel.
4. **Submit and approve one outing request** end to end, so a pass exists.
5. **Scan that student out and back in at the real gate station, with the real USB scanner.**

Step 5 is the one that cannot be faked and the only one where being wrong means a person is
stuck at a barrier. Check all four outcomes: the scan log appears, the student's status
flipped and flipped back, the pass was consumed, and the guard's duty stamp recorded.

The scanner is a keyboard, not a camera. If a scan does nothing, the usual cause is focus
sitting in a text input that swallows the trailing Tab.

---

## 7. The first week

Watch for three things:

- Any 500 mentioning `invalid input syntax for type uuid`. That means an id reached a query
  without being validated, and it is worth fixing rather than living with.
- Gate scan latency. It measured 8ms at the 95th percentile and 40 concurrent scans in
  417ms on a development machine. Anything in seconds is a finding, not a slow day.
- `max_connections` pressure, if the college runs other things on that server.
  `PG_MAX_POOL_SIZE` defaults to 20 and must stay well under whatever they allocate.

### Taking backups

Nothing here is backed up by default, and from day one this database is the only copy of
real student movement records.

```bash
pg_dump "$DATABASE_URL" -Fc -f safeexit-$(date +%F).dump
```

Put it on a schedule and put the output somewhere that is not that server.

---

## What is now dead weight

Once the college server is live and the archive dump is safe, these exist only to read the
Atlas cluster and can be deleted along with the `mongoose` dependency:

- `backend/scripts/etl.js`
- `backend/scripts/mongoInventory.js`
- `backend/scripts/cutoverVerify.js`
- `docs/CUTOVER.md`, which describes a migration that is no longer happening

`db/postgres/004_drop_legacy_ids.sql` can also run, which removes the `legacy_id` column
from eight tables where it is now permanently NULL. Read its preconditions first: the
`legacyId` attribute has to come out of `src/models/_shared.js` and the eight models
**before** the column goes, or every read of those tables fails with
`column users.legacy_id does not exist`.

None of that is urgent. It is cleanup, and it is safer done after the first week than before
it.

---

## Known gaps, carried forward deliberately

- **A student can hold one active outing and one active leave at the same time.** Two
  partial unique indexes cannot span two tables, so the rule lives in application code with
  a single test guarding it. PostgreSQL can close it properly with a shared lock table
  written in the same transaction as the pass.
- **An outing with a departure time already in the past is accepted** when it is created.
  The gate then refuses it and stores it as expired, so nobody gets through, but the student
  finds out at the barrier rather than at submission.
- **A token outlives logout.** Sessions are stateless with a 30-day life and no revocation
  list, so signing out clears the browser but does not invalidate the token itself.
