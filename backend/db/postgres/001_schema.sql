-- ============================================================================
-- SafeExit — PostgreSQL schema (Phase 1 of the MongoDB -> PostgreSQL migration)
--
-- Target: PostgreSQL 9.5+ with ZERO extensions.
--   * UUIDs are generated in Node (crypto.randomUUID / Sequelize UUIDV4) and inserted
--     explicitly, so gen_random_uuid() / pgcrypto are never needed.
--   * Case-insensitive hostel matching uses a functional lower() index, not citext.
--   * No CREATE DATABASE / CREATE ROLE / OWNER statements — this file runs as whatever
--     role the college grants, inside whatever database they hand us.
--   * updated_at is maintained by the application (Sequelize timestamps), not by a
--     trigger, so no CREATE FUNCTION privilege is required.
--
-- Idempotent: every statement is IF NOT EXISTS, so this file can be re-applied while
-- the ETL is being debugged.
--
-- Every table carries legacy_id CHAR(24) UNIQUE — the source MongoDB ObjectId. It exists
-- so the two-pass ETL can resolve foreign keys by legacy id without holding a giant
-- ObjectId->UUID map in memory, and so re-runs are idempotent via
-- ON CONFLICT (legacy_id) DO UPDATE. Drop these columns after cutover.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- hostels — promoted from backend/src/config/hostels.js to a real table.
--
-- In MongoDB, hostelName was a free string and five call sites papered over casing with
-- .collation({locale:'en',strength:2}). Here the FK makes "Kautilya" vs "kautilya"
-- unrepresentable. Gender is IMPLIED by the hostel (a student picks a hostel, not a
-- gender) — that rule now lives in the database.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hostels (
  name        text PRIMARY KEY,
  gender      text NOT NULL CHECK (gender IN ('Male', 'Female')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Blocks a second casing of the same hostel from ever being inserted.
CREATE UNIQUE INDEX IF NOT EXISTS hostels_name_ci ON hostels (lower(name));

INSERT INTO hostels (name, gender) VALUES
  ('Kautilya',   'Male'),
  ('Aryabhatta', 'Male'),
  ('Nagarjuna',  'Male'),
  ('Kadambini',  'Female'),
  ('Sarojini',   'Female')
ON CONFLICT (name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- users — the polymorphic account table: Student + staff + Guard.
--
-- The two embedded arrays (closeContacts, webAuthnCredentials) and the two base64 blobs
-- (photo, signature) have been lifted out into their own tables below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                     uuid PRIMARY KEY,
  legacy_id              char(24) UNIQUE,

  name                   text NOT NULL,
  -- login_id and email were `unique + sparse` in Mongoose. Postgres UNIQUE already
  -- permits many NULLs, which is exactly that behaviour — many staff share "no email".
  login_id               text UNIQUE,
  email                  text UNIQUE,
  password               text,

  role                   text NOT NULL DEFAULT 'Student'
                           CHECK (role IN ('Student','Caretaker','Warden','ChiefWarden','Guard','Admin')),
  gender                 text CHECK (gender IN ('Male','Female','Other')),

  -- Staff scoping. managed_gender is derived from the managed hostel's gender.
  managed_gender         text CHECK (managed_gender IN ('Male','Female')),
  managed_hostel         text REFERENCES hostels(name) ON UPDATE CASCADE,

  -- Roll number. The gate's college-ID-card path resolves students by THIS value, so it
  -- must survive the migration byte-exact — see resolveStudent in scanController.
  student_id             text,
  department             text,
  year                   text,
  room_number            text,
  hostel_name            text REFERENCES hostels(name) ON UPDATE CASCADE,
  phone_number           text,
  guardian_phone_number  text,

  -- Live gate state.
  campus_status          text NOT NULL DEFAULT 'Inside'
                           CHECK (campus_status IN ('Inside','Outside','Overdue')),
  last_seen_at           timestamptz,
  on_duty                boolean NOT NULL DEFAULT false,
  last_active_at         timestamptz,

  -- webauthn_registered is a convenience flag; webauthn_credentials is the source of truth.
  webauthn_registered    boolean NOT NULL DEFAULT false,
  current_challenge      text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_lowercase_login CHECK (login_id IS NULL OR login_id = lower(login_id)),
  CONSTRAINT users_lowercase_email CHECK (email    IS NULL OR email    = lower(email))
);

-- Replaces userSchema.index({role, hostelName}) + the collation. Queries must use
-- WHERE role = $1 AND lower(hostel_name) = lower($2) to hit this.
CREATE INDEX IF NOT EXISTS users_role_hostel_ci  ON users (role, lower(hostel_name));
CREATE INDEX IF NOT EXISTS users_role_managed_ci ON users (role, lower(managed_hostel));

-- Plain counterparts: hostelScope.genderScopedStudentFilter, the scanController gender
-- fallback, and pushService's role+managed_gender fan-out (every SOS, every new request,
-- every overdue sweep tick).
CREATE INDEX IF NOT EXISTS users_role_gender         ON users (role, gender);
CREATE INDEX IF NOT EXISTS users_role_managed_gender ON users (role, managed_gender);

-- The gate's roll-number lookup. NOT unique: MongoDB never enforced it, so asserting
-- uniqueness here could fail the ETL on legacy duplicates. Promote it in
-- 002_post_etl_constraints.sql once the data is proven clean.
CREATE INDEX IF NOT EXISTS users_student_id ON users (student_id);


-- ---------------------------------------------------------------------------
-- close_contacts — was an embedded array with a "max 2" Mongoose validator.
--
-- The limit is now STRUCTURAL: slot is CHECKed to 1..2 and UNIQUE per user, so a third
-- contact has nowhere to go. A validator that only ran on save() could not do that.
-- ("slot", not "position" — POSITION is an SQL function name.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS close_contacts (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot           smallint NOT NULL CHECK (slot IN (1, 2)),
  name           text NOT NULL CHECK (char_length(name) <= 100),
  mobile_number  text NOT NULL,
  room_number    text NOT NULL CHECK (char_length(room_number) <= 30),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);

CREATE INDEX IF NOT EXISTS close_contacts_user ON close_contacts (user_id);


-- ---------------------------------------------------------------------------
-- webauthn_credentials — was an embedded array. public_key was a Mongo Buffer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- base64url credential id. WebAuthn guarantees this is globally unique; Mongo never
  -- asserted it, so a duplicate here means real data corruption and should fail loudly.
  credential_id  text NOT NULL UNIQUE,
  public_key     bytea,
  counter        bigint NOT NULL DEFAULT 0,
  transports     text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user ON webauthn_credentials (user_id);


-- ---------------------------------------------------------------------------
-- user_photos / user_signatures — the base64 blobs, lifted out of users.
--
-- In MongoDB, test/rosterPhotoBudget.test.js kept the ~300KB face photos out of list
-- endpoints BY CONVENTION: a test asserting nobody adds `photo` to a projection string.
-- Here it is structural — a careless SELECT * on the roster physically cannot pull them.
--
-- Stored as bytea, not text: the decoded bytes are ~25% smaller than the base64 the API
-- speaks. mime_type is kept so the data layer can rebuild the exact
-- "data:<mime>;base64,..." URL the frontend expects — the JSON contract does not change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_photos (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo       bytea NOT NULL,
  mime_type   text NOT NULL DEFAULT 'image/jpeg',
  byte_size   integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_signatures (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  signature   bytea NOT NULL,
  mime_type   text NOT NULL DEFAULT 'image/png',
  byte_size   integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- outing_requests
--
-- The three *_signature columns stay inline as bytea rather than moving to a side table:
-- Postgres TOASTs large values out of the main heap automatically, so any query that does
-- not name the column never reads those pages. Phase 3 adds a Sequelize defaultScope that
-- excludes them, so list endpoints stay narrow.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outing_requests (
  id                          uuid PRIMARY KEY,
  legacy_id                   char(24) UNIQUE,

  student_id                  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  destination                 text NOT NULL,
  purpose                     text NOT NULL,
  -- With the student's gender, selects the rule set in utils/outingRules.js:
  -- Nearby/Market are female-only, General is the single male path.
  outing_type                 text NOT NULL DEFAULT 'General'
                                CHECK (outing_type IN ('Nearby','Market','General')),
  out_time                    timestamptz NOT NULL,
  in_time                     timestamptz NOT NULL,

  -- Approved -> Expired happens lazily at read time when out_time passes unused.
  -- 'Forwarded' = a caretaker escalated it to the hostel warden.
  status                      text NOT NULL DEFAULT 'Pending'
                                CHECK (status IN ('Pending','Approved','Rejected','Out',
                                                  'Returned','Expired','Cancelled','Forwarded')),
  -- True when approved by the system rule, not a caretaker (approved_by stays NULL).
  auto_approved               boolean NOT NULL DEFAULT false,
  -- Stamped when the entry scan closes the trip; student dashboards read this, not scan logs.
  return_punctuality          text CHECK (return_punctuality IN ('On-Time','Overdue')),

  overdue_notified_at         timestamptz,
  -- Separate marker for the student's own browser push.
  student_overdue_notified_at timestamptz,
  actual_out_time             timestamptz,
  actual_in_time              timestamptz,

  decision                    text CHECK (decision IN ('Approved','Rejected')),
  decided_at                  timestamptz,
  decided_by_role             text CHECK (decided_by_role IN ('Caretaker','Warden')),
  remarks                     text,

  -- Immutable per-request snapshots of the drawn signatures. Changing a user's reusable
  -- signature never rewrites these.
  student_signature           bytea,
  student_signature_mime      text,
  caretaker_signature         bytea,
  caretaker_signature_mime    text,
  warden_signature            bytea,
  warden_signature_mime       text,

  approved_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
  target_caretaker            uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_to                uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_by                uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_note              text,
  forwarded_at                timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- createOutingRequest's active-pass block, and the gate scan's pass resolution. The
-- (student_id) prefix also serves getMyOutingRequests.
CREATE INDEX IF NOT EXISTS outing_student_status_created ON outing_requests (student_id, status, created_at DESC);
-- getPendingRequests — the caretaker queue, oldest first.
CREATE INDEX IF NOT EXISTS outing_status_created         ON outing_requests (status, created_at);
-- getOverdueOutings and the 5-minute overdue sweep, both keyed on status='Out'.
CREATE INDEX IF NOT EXISTS outing_status_intime          ON outing_requests (status, in_time);
-- getForwardedRequests — the warden's action queue.
CREATE INDEX IF NOT EXISTS outing_forwarded_queue        ON outing_requests (forwarded_to, status, forwarded_at);
-- The target_caretaker branch of the caretaker scope filter (utils/hostelScope.js).
CREATE INDEX IF NOT EXISTS outing_target_caretaker       ON outing_requests (target_caretaker);
-- getAllOutingRequests — chief-warden campus-wide list, polled every 30s with no filter.
CREATE INDEX IF NOT EXISTS outing_created                ON outing_requests (created_at DESC);
-- The history endpoints' sort.
CREATE INDEX IF NOT EXISTS outing_decided                ON outing_requests (decided_at DESC);

-- ==== The correctness guard, not a performance index ====
--
-- createOutingRequest reads the active requests, finds nothing blocking, then creates.
-- Two concurrent POSTs from one student both pass that check and both succeed. No amount
-- of application code closes that race; the database has to assert it.
--
-- This is the single biggest structural upgrade in the migration. MongoDB needed 6.0+ to
-- accept $in inside partialFilterExpression, could fail the build SILENTLY, and needed
-- 116 lines of utils/verifyIndexes.js to prove at startup that it had not. Here the DDL
-- either applies or this file fails loudly, so verifyIndexes.js and most of
-- test/oneActivePassIndex.test.js get DELETED in Phase 3 rather than ported.
--
-- The status list MUST stay identical to ACTIVE_PASS_STATUSES in
-- backend/src/config/passStatuses.js. If they drift, the index enforces a different rule
-- than the controller's 409 and the double-submit race reopens.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_outing_per_student
  ON outing_requests (student_id)
  WHERE status IN ('Pending','Approved','Forwarded','Out');


-- ---------------------------------------------------------------------------
-- leave_applications — mirrors outing_requests; see the notes there.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_applications (
  id                        uuid PRIMARY KEY,
  legacy_id                 char(24) UNIQUE,

  student_id                uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  destination               text NOT NULL,
  reason                    text NOT NULL,
  leave_date                timestamptz NOT NULL,
  return_date               timestamptz NOT NULL,
  -- Audit trail of what the student agreed to — not a security boundary.
  acknowledgement           boolean NOT NULL DEFAULT false,

  -- Pending/Approved -> Expired happens lazily at read time; Out/Returned only via scans.
  status                    text NOT NULL DEFAULT 'Pending'
                              CHECK (status IN ('Pending','Approved','Rejected','Cancelled',
                                                'Expired','Out','Returned','Forwarded')),

  decision                  text CHECK (decision IN ('Approved','Rejected')),
  decided_at                timestamptz,
  decided_by_role           text CHECK (decided_by_role IN ('Caretaker','Warden')),
  remarks                   text,

  student_signature         bytea,
  student_signature_mime    text,
  caretaker_signature       bytea,
  caretaker_signature_mime  text,
  warden_signature          bytea,
  warden_signature_mime     text,

  approved_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  target_caretaker          uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_to              uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  forwarded_note            text,
  forwarded_at              timestamptz,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_student_status_created ON leave_applications (student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS leave_status_created         ON leave_applications (status, created_at);
CREATE INDEX IF NOT EXISTS leave_forwarded_queue        ON leave_applications (forwarded_to, status, forwarded_at);
CREATE INDEX IF NOT EXISTS leave_target_caretaker       ON leave_applications (target_caretaker);
CREATE INDEX IF NOT EXISTS leave_created                ON leave_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS leave_decided                ON leave_applications (decided_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_leave_per_student
  ON leave_applications (student_id)
  WHERE status IN ('Pending','Approved','Forwarded','Out');

-- KNOWN GAP, unchanged from MongoDB: these two indexes cannot stop a student holding one
-- active outing AND one active leave at the same time. That rule lives in application
-- code (see test/crossCollectionPassBlocking.test.js) and stays there for now. Postgres
-- CAN close it — a shared active_pass_locks table with student_id as PRIMARY KEY, written
-- inside the same transaction as the pass — but that is a deliberate decision for after
-- cutover, not something to bundle into the port.


-- ---------------------------------------------------------------------------
-- scan_logs — one gate movement; source of truth for movement logs and campus status.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_logs (
  id           uuid PRIMARY KEY,
  legacy_id    char(24) UNIQUE,

  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Nullable so seeded/system logs still validate.
  guard_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  direction    text NOT NULL CHECK (direction IN ('IN','OUT')),

  outing_id    uuid REFERENCES outing_requests(id) ON DELETE SET NULL,
  leave_id     uuid REFERENCES leave_applications(id) ON DELETE SET NULL,
  pass_type    text CHECK (pass_type IN ('Outing','Leave')),

  -- 'N/A' when there is no window to judge against.
  punctuality  text NOT NULL DEFAULT 'N/A' CHECK (punctuality IN ('On-Time','Overdue','N/A')),
  gate         text NOT NULL DEFAULT 'Main Gate',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Outing-first resolution in scanController means at most one of these is ever set.
  CONSTRAINT scan_logs_one_pass CHECK (outing_id IS NULL OR leave_id IS NULL)
);

CREATE INDEX IF NOT EXISTS scan_logs_created           ON scan_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS scan_logs_student_created   ON scan_logs (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_logs_direction_created ON scan_logs (direction, created_at DESC);


-- ---------------------------------------------------------------------------
-- sos_alerts — the hardest-polled views in the app (8s, admin + caretaker dashboards).
-- The student profile is referenced, not copied, so the latest name/room/phone shows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sos_alerts (
  id               uuid PRIMARY KEY,
  legacy_id        char(24) UNIQUE,

  student_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type             text NOT NULL DEFAULT 'other'
                     CHECK (type IN ('harassment','medical','unsafe','stalking','other')),
  note             text,
  location         text,
  -- Was an embedded `coords` sub-document.
  coord_lat        double precision,
  coord_lng        double precision,
  coord_accuracy   double precision,  -- metres, from the browser Geolocation API

  status           text NOT NULL DEFAULT 'Active'
                     CHECK (status IN ('Active','Acknowledged','Resolved')),
  handled_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note  text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sos_student_created ON sos_alerts (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sos_status_created  ON sos_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sos_created         ON sos_alerts (created_at DESC);


-- ---------------------------------------------------------------------------
-- delay_notices — a student's "I'll be late" notice. Advisory only: new_expected_time
-- never feeds isReturnLate, so the gate scan and the overdue sweep keep judging
-- punctuality against the pass's own in_time.
--
-- MongoDB stored an untyped `trip` ObjectId plus a `tripType` discriminator, with no
-- referential integrity in either direction. Split here into two real FKs so a notice can
-- never point at a pass that does not exist. Notices are outing-only now; leave_id exists
-- so pre-rule rows still load. The Sequelize model exposes `trip` / `tripType` as virtuals
-- so controllers keep reading the shape they read today.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delay_notices (
  id                    uuid PRIMARY KEY,
  legacy_id             char(24) UNIQUE,

  student_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  outing_id             uuid REFERENCES outing_requests(id) ON DELETE CASCADE,
  leave_id              uuid REFERENCES leave_applications(id) ON DELETE CASCADE,

  reason                text NOT NULL
                          CHECK (reason IN ('Traffic','Transport','Medical','Family','Weather','Other')),
  note                  text CHECK (note IS NULL OR char_length(note) <= 300),
  -- The student's own estimate. Staff-facing information, not a new deadline.
  new_expected_time     timestamptz,
  -- Snapshot of the deadline at filing time, so later reads keep the audit trail.
  original_in_time      timestamptz,
  filed_while_overdue   boolean NOT NULL DEFAULT false,

  status                text NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending','Acknowledged')),
  acknowledged_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at       timestamptz,
  acknowledgement_note  text CHECK (acknowledgement_note IS NULL OR char_length(acknowledgement_note) <= 300),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Exactly one trip, always. `trip` was NOT NULL in Mongoose.
  CONSTRAINT delay_notices_one_trip CHECK ((outing_id IS NULL) <> (leave_id IS NULL))
);

CREATE INDEX IF NOT EXISTS delay_student_outing ON delay_notices (student_id, outing_id);
CREATE INDEX IF NOT EXISTS delay_outing_status  ON delay_notices (outing_id, status);


-- ---------------------------------------------------------------------------
-- push_subscriptions — one row per subscribed device. A 410 Gone endpoint is deleted by
-- the push service. Same browser re-subscribing yields the same endpoint: upsert on it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY,
  legacy_id   char(24) UNIQUE,

  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);


-- ---------------------------------------------------------------------------
-- email_otps — stores only a bcrypt hash of the OTP, so a DB leak cannot be replayed.
--
-- MongoDB expired these with a TTL index. Postgres has no TTL and we are NOT adding
-- pg_cron for it: utils/overdueSweep.js already ticks every 5 minutes, so Phase 3 appends
--   DELETE FROM email_otps WHERE expires_at < now();
-- to that tick. Zero new infrastructure. The index below is what makes that sweep cheap.
--
-- Expiry is checked at read time regardless of when the sweep last ran, so a row that
-- outlives its expires_at is never accepted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_otps (
  id           uuid PRIMARY KEY,
  legacy_id    char(24) UNIQUE,

  email        text NOT NULL,
  otp_hash     text NOT NULL,
  purpose      text NOT NULL DEFAULT 'student-registration',
  attempts     integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- One live code per email+purpose — a resend overwrites.
  UNIQUE (email, purpose),
  CONSTRAINT email_otps_lowercase CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS email_otps_expires ON email_otps (expires_at);
