# Cutover — MongoDB to PostgreSQL

Phase 4, the last one. Phases 0 to 3 are done: the schema is applied, the ETL runs, and the
backend on `mohnish_new_branch` reads and writes PostgreSQL only. `main` is still the live
MongoDB system.

This is the runbook for the switch. Read all of it before starting any of it.

**Budget about 90 minutes**, of which roughly ten are a write freeze. Do it outside gate
hours — after the 19:59 gender window closes and before 06:00 — so that a freeze, or a
rollback, costs nobody a scan.

---

## What actually goes wrong, and what each step is for

One failure mode matters more than the rest, because it is silent. Between the moment the
final ETL finishes reading Atlas and the moment the backend starts answering from Postgres,
anything a user writes lands in the old database and does not exist in the new one. A pass
gets approved and vanishes. A student walks out through the gate and stays marked Inside.
Nobody sees it until the next morning, when the barrier refuses someone who is standing
outside it.

Two things exist for that gap and nothing else: `MAINTENANCE_MODE`, which closes it, and
`npm run pg:verify`, which proves it stayed closed.

The second failure mode is loud and easy: every JWT ever issued carries a MongoDB ObjectId,
which is not a uuid, so every session breaks at once. `LEGACY_ID_GRACE` handles it.

---

## Before the day

1. **Rehearse the whole thing.**

   ```bash
   cd backend
   npm run cutover:rehearse
   ```

   This runs every step below that does not need the college server, in this order, using
   the same commands and the same code. It builds a throwaway PostgreSQL schema, applies the
   DDL, runs the real ETL into it, applies and validates the constraints, runs the verifier,
   boots the real Express app against the result, and drops the schema at the end. It refuses
   to run unless `DATABASE_URL` is local, and it only ever reads MongoDB.

   Twelve checks. The ones worth knowing about:

   - **R6 proves the verifier actually blocks.** It hides a row from the reconciliation and
     requires a non-zero exit. A verifier that only ever says "ok" is indistinguishable from
     a broken one, and you would find out on the night.
   - **R7 mints a token whose subject is a MongoDB ObjectId** and requires it to authenticate,
     which is the whole of the grace period in one assertion.
   - **R10 walks a migrated student out through the gate and back in**, through the real
     endpoint and the real five-write transaction.
   - **R11 freezes and unfreezes** over real HTTP on the real router stack.

   What it cannot cover, and what therefore stays manual: the USB scanner itself, secret
   rotation, and the college server's own version, permissions and firewall.

   `npm run pg:verify` on its own is read-only on both databases and safe to run as often as
   you like, including against live Atlas during working hours.

2. **Take a `mongodump`.** It is the rollback, and it is the only one.

   ```bash
   mongodump --uri "$MONGO_URI" --db test --out ./dump-precutover
   ```

3. **Confirm the college's Postgres** with `npm run pg:check`. It reads catalog tables and
   row counts and writes nothing, so it is a safe first connection.

4. **Tell people.** Sessions survive (see step 6), but writes are refused for a few minutes
   and the wording users see is `MAINTENANCE_MESSAGE`.

---

## The cutover

### 1. Freeze writes on the live system

Set in `backend/.env` on the server, then restart the backend only:

```
MAINTENANCE_MODE=true
```

```bash
docker compose -f docker-compose.prod.yml up -d backend
```

The prod compose file reads `backend/.env` through `env_file`, so this needs no image
rebuild.

Reads keep working throughout — the roster, the overdue list, the SSE stream. Every POST,
PUT, PATCH and DELETE answers `503` with a `Retry-After`. That includes logging in, which is
the reason to keep this window short.

**The freeze has to live in the backend, not in nginx.** Requests reach the API by two
paths — `/api/backend/*` proxied straight through nginx, and `/api/*` rewritten by Next.js
— so an nginx rule would have to cover `location /` as well, which is the entire frontend.
The middleware catches both paths however the request arrives.

**`src/middlewares/maintenanceMode.js` has no database coupling of any kind**, precisely so
it can be applied to whichever backend is live at the time. Right now that is the MongoDB
one on `main`, so put the middleware and its one line in `src/app.js` onto `main` first and
push — the deploy workflow fires on a push to `main`, and what it deploys is the existing
Mongo app with the freeze on.

That freeze commit costs exactly one merge conflict later, in `backend/src/app.js`, when the
Postgres branch merges in step 7. It has been tested: resolving it with

```bash
git checkout --theirs backend/src/app.js
```

leaves the merged tree byte-identical to `mohnish_new_branch`, because that branch already
contains the same middleware. No other file conflicts. Expect it, do not debug it.

Confirm the freeze took hold with a read, not a write:

```bash
curl -si http://localhost:5000/health | grep -i x-maintenance-mode
```

### 2. Run the final ETL

```bash
cd backend
npm run pg:etl
```

The whole load is one transaction, so a failure leaves the target exactly as it was. It
upserts on `legacy_id`, so running it again after a previous run is fine and expected — that
is what makes this step safe to repeat.

Then the constraints:

```bash
npm run pg:constraints    # 002 — NOT VALID, so old rows cannot block it
npm run pg:validate       # 003 — turns them on for the migrated rows too
```

### 3. Prove nothing was lost

```bash
npm run pg:verify
```

Read-only on both databases. Exit 0 means go, exit 1 means stop.

It does **not** compare row counts, because the counts are supposed to differ — the ETL
deliberately skips the July test cohort's orphans and the five `Department` accounts, so
Postgres holds around 366 fewer rows than Atlas by design. Instead it reconciles every row
by `legacy_id` and dates the ones that did not make it, using the timestamp an ObjectId
carries in its first four bytes. A missing row created *before* the ETL read the data is a
documented skip. A missing row created *after* it is a lost write, and a blocker.

It also compares the fields whose disagreement is expensive rather than untidy: roll numbers,
because a printed college ID card resolves by them; `campus_status`, because it decides
whether the next scan is an exit or an entry; and pass status, because an approval during the
gap changes an existing row and so leaves its id untouched, which section 2 would never see.

For those last two it checks *which side moved*. A rehearsal on a live dev stack lapses
passes to `Expired` on the Postgres copy all by itself, and the final ETL overwrites that —
a warning, not a blocker. Only a change Mongo made after the cutoff is fatal.

If it reports blockers, the fix is always the same: writes are still getting through, so
re-check the freeze, run `npm run pg:etl` again, and verify again.

### 4. Rotate the secrets

`backend/.env` currently holds live Atlas credentials, Gmail SMTP credentials, the VAPID
private key and the admin PINs, all in plaintext, and the deploy workflow copies that file
to EC2. Rotate them **now**, not earlier: rotating before this point breaks the running
system, and rotating later leaves the old Atlas credentials valid against a database you are
about to stop watching.

### 5. Switch the database

In `backend/.env`:

```
DATABASE_URL=postgres://safeexit:...@127.0.0.1:5432/safeexit
```

Leave `MONGO_URI` in place. `scripts/etl.js` and `scripts/mongoInventory.js` still need it,
and it is what makes step 8's rollback a config change rather than a restore.

### 6. Keep everyone logged in

```
LEGACY_ID_GRACE=true
```

This is the default, so it is really a matter of not setting it to `false`. Tokens are signed
with a 30-day life and carry the row's primary key as their subject, which until this moment
was a MongoDB ObjectId. `protect` resolves a 24-hex subject through `legacy_id` instead of
rejecting it, so nobody is signed out by the switch — including whoever is standing at the
barrier. Cached QR codes resolve the same way at the gate.

`src/utils/legacyIdGrace.js` owns the switch for both call sites, and is the single grep
target when it is time to remove it.

**A passkey enrolled before today still works**, because that path matches on the credential
id rather than the user handle. But the handle is the uuid now, so a *re-registration* mints
a second passkey rather than replacing the first. Both authenticate; the account simply lists
two. There is a note to this effect in `authController`.

### 7. Deploy, then unfreeze

`main` is a strict ancestor of `mohnish_new_branch` — 39 commits behind, with nothing of its
own — so apart from the freeze commit from step 1 this merge carries no surprises.

```bash
git checkout main
git merge mohnish_new_branch
git checkout --theirs backend/src/app.js   # the one expected conflict; see step 1
git add backend/src/app.js && git commit
git push origin main                        # this is what triggers the deploy
```

Watch the workflow finish and the containers come up. Then remove `MAINTENANCE_MODE` from
`backend/.env` (or set it to `false`) and restart the backend:

```bash
docker compose -f docker-compose.prod.yml up -d backend
curl -si http://localhost:5000/health | grep -i x-maintenance-mode   # expect no output
```

Note that this deploy carries far more than the database change — `main` predates helmet,
compression, the rate limiters, `validateParams` and the central error handler. All of it
ships at once. That is an argument for doing the six-role walk in step 8 properly, not a
reason to split the deploy.

### 8. Smoke-test the gate for real

Not with curl. **One real exit and one real entry, with a real student and the real scanner.**

The gate is the only part of this system where being wrong is measured in a person standing
at a barrier, and it is the one path that touches five tables in a single transaction. Check
that the scan log appears, the student's status flipped, and the pass was consumed.

Then walk the six roles through their dashboards once: student, guard, caretaker, warden,
chief warden, admin.

---

## Rollback

Up to and including step 5, rolling back is putting `MAINTENANCE_MODE=false` back and
restarting. Nothing has changed on Atlas; the ETL only ever reads it.

After step 7, roll back by redeploying `main` and pointing `MONGO_URI` at the untouched
Atlas cluster. Writes made against Postgres in the meantime are lost, which is the real
reason step 8 happens immediately rather than the next morning.

`dump-precutover` is the floor under all of it.

---

## The two weeks after

Leave the Atlas cluster alive and **read-only**. It costs nothing and it is the answer to
every "was this always like that?" question that comes up.

Watch for:

- 401s on `/api/auth/profile`, which would mean the legacy grace is not doing its job.
- Any 500 mentioning `invalid input syntax for type uuid`, which means an id path was
  missed.
- Gate scan latency. Measured on the ported stack at p95 20ms serial and 456ms for 40
  concurrent scans, so anything in seconds is a finding.

## Then, and only then

All four preconditions are listed at the top of `db/postgres/004_drop_legacy_ids.sql`. In
order:

1. Confirm two clean weeks and take a fresh `pg_dump`.
2. Delete the legacy fallback: `src/utils/legacyIdGrace.js` and its two call sites in
   `src/middlewares/authMiddleware.js` and `src/controllers/scanController.js`. Also drop
   `legacyId` from `src/models/_shared.js` and the eight models that spread it — leaving
   the attribute behind after the column is gone turns every `SELECT` into
   `column users.legacy_id does not exist`.
3. `node scripts/applySchema.js drop-legacy`. There is deliberately no `npm run` alias
   for this one.
4. Remove the `mongoose` dependency and delete `scripts/etl.js`, `scripts/mongoInventory.js`
   and `scripts/cutoverVerify.js`. All three exist only to read Atlas.

## Known gaps, carried forward deliberately

- **A student can hold one active outing *and* one active leave.** Two partial unique
  indexes cannot span two tables. The rule lives in application code, guarded only by
  `test/crossCollectionPassBlocking.test.js`. Postgres can close it properly with a shared
  `active_pass_locks` table written in the same transaction as the pass — a post-cutover
  decision, not a cutover one.
- **Three stress assertions fail on purpose** (A9, E1, E7 in `backend/stress/`). They are
  findings, and all three are pre-existing product gaps rather than migration regressions:
  an outing with a past departure time is accepted at create, `outTime` is not enforced as a
  deadline at the gate, and a Bearer token outlives logout. Do not fix them here.
