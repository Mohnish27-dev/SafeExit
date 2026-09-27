// npm run seed:wardens [-- path/to/wardens.json] [--dry-run]
//
// --dry-run prints the warden accounts already in the database and exactly what the seed
// would do, then rolls everything back. Run it first on any database you have not looked
// at, to find the old IDs to put in `replacesLoginId`.
//
// Provisions the Google sign-in accounts for the hostel wardens and the Chief Warden from
// one JSON file (default: backend/wardens.json, which is git-ignored; copy
// wardens.example.json to start). Safe to re-run: accounts are matched by email, so a
// second run only applies changes (a renamed warden, a hostel reassignment).
//
// File shape:
//   {
//     "chiefWarden": { "name": "...", "email": "...@nitp.ac.in", "replacesLoginId": "cwdn001" },
//     "wardens": [
//       { "name": "Rakesh Kumar", "email": "rakeshk.me@nitp.ac.in", "hostel": "Kautilya", "phone": "9876543210" },
//       ...
//     ]
//   }
//
// `name` and `phone` are optional. An account created without a name shows its email until
// the person's first Google sign-in, which fills in the name from their Google profile;
// re-running the seed without a name never clears a name the account already has.
//
// `replacesLoginId` (optional, on any entry) converts an existing ID + PIN account into the
// Google one IN PLACE instead of creating a new row. Use it for the people who already
// have an account: their past approvals keep pointing at them. Converting drops the PIN
// and any passkeys, so the old credentials stop working immediately.
//
// Nothing is deleted. Old ID + PIN warden accounts that are not converted are listed at
// the end; they can no longer sign in (the backend refuses PIN login for wardens), and an
// admin can remove them from People once they are no longer needed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { connectPostgres, closePostgres } = require('../src/config/sequelize');
const { sequelize, User, WebauthnCredential } = require('../src/models');
const { isCollegeEmail, normalizeEmail } = require('../src/config/emailPolicy');
const { isValidHostel, canonicalHostelName, genderForHostel } = require('../src/config/hostels');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--'));
const file = path.resolve(fileArg || path.join(__dirname, '..', 'wardens.json'));

// Thrown at the end of a dry run, so the transaction rolls back after doing all the work.
class DryRun extends Error {}

const readEntries = () => {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Copy wardens.example.json to wardens.json and fill it in.`);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = [];
  const problems = [];

  const add = (raw, role, where) => {
    const name = String(raw?.name || '').trim();
    const email = normalizeEmail(raw?.email);
    const hostel = role === 'Warden' ? canonicalHostelName(raw?.hostel) : null;
    const phone = raw?.phone ? String(raw.phone).replace(/\D/g, '') : null;
    if (phone && !/^\d{10,15}$/.test(phone)) problems.push(`${where}: "${raw.phone}" is not a phone number`);
    if (!isCollegeEmail(email)) problems.push(`${where}: "${raw?.email}" is not an @nitp.ac.in email`);
    if (role === 'Warden' && !isValidHostel(raw?.hostel)) {
      problems.push(`${where}: unknown hostel "${raw?.hostel}"`);
    }
    const replacesLoginId = raw?.replacesLoginId
      ? String(raw.replacesLoginId).trim().toLowerCase().replace(/\s+/g, '')
      : null;
    entries.push({ role, name, email, phone, hostel, replacesLoginId, where });
  };

  if (data.chiefWarden) add(data.chiefWarden, 'ChiefWarden', 'chiefWarden');
  (data.wardens || []).forEach((w, i) => add(w, 'Warden', `wardens[${i}] (${w?.email || '?'})`));

  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.email)) problems.push(`${e.where}: ${e.email} is listed twice`);
    seen.add(e.email);
  }
  if (problems.length) throw new Error(`Fix ${file} first:\n  - ${problems.join('\n  - ')}`);
  return entries;
};

// Turn `user` into the Google account described by `entry`. Clearing the password and the
// passkeys is what actually retires the old ID + PIN.
const applyEntry = async (user, entry, tx) => {
  // No name in the file: keep the one on record, else the email as a placeholder that the
  // first Google sign-in replaces (authController googleLogin).
  user.name = entry.name || user.name || entry.email;
  if (entry.phone) user.phoneNumber = entry.phone;
  user.loginId = entry.email;
  user.email = entry.email;
  user.role = entry.role;
  user.password = null;
  user.studentId = null;
  user.webAuthnRegistered = false;
  user.currentChallenge = null;
  user.managedHostel = entry.hostel;
  user.managedGender = entry.hostel ? genderForHostel(entry.hostel) : null;
  await user.save({ transaction: tx });
  await WebauthnCredential.destroy({ where: { userId: user.id }, transaction: tx });
};

const run = async () => {
  const entries = readEntries();
  await connectPostgres();

  const existing = await User.findAll({
    where: { role: { [Op.in]: ['Warden', 'ChiefWarden'] } },
    attributes: ['name', 'loginId', 'role', 'managedHostel'],
    order: [['role', 'ASC'], ['managedHostel', 'ASC']],
  });
  console.log(`Warden accounts in this database now (${existing.length}):`);
  for (const u of existing) {
    console.log(`  ${u.role.padEnd(11)} ${String(u.loginId).padEnd(28)} ${u.name}${u.managedHostel ? ` (${u.managedHostel})` : ''}`);
  }
  console.log('');

  const log = [];
  try {
    await sequelize.transaction(async (tx) => {
      await seedAll(entries, log, tx);
      if (dryRun) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }

  console.log(log.join('\n'));
  if (dryRun) {
    console.log('\nDRY RUN: nothing was saved. Run again without --dry-run to apply.');
    await closePostgres();
    process.exit(0);
  }

  // Anyone still on ID + PIN. They cannot sign in any more; listed so they are not forgotten.
  const leftovers = await User.findAll({
    where: { role: { [Op.in]: ['Warden', 'ChiefWarden'] }, email: null },
    attributes: ['name', 'loginId', 'role', 'managedHostel'],
  });
  if (leftovers.length) {
    console.log('\nOld ID + PIN accounts still present (they can no longer sign in):');
    for (const u of leftovers) {
      console.log(`  ${u.role.padEnd(11)} ${u.loginId}  ${u.name}${u.managedHostel ? ` (${u.managedHostel})` : ''}`);
    }
    console.log('Convert them with "replacesLoginId", or remove them from Admin > People.');
  }

  await closePostgres();
  process.exit(0);
};

const seedAll = async (entries, log, tx) => {
  for (const entry of entries) {
    const byEmail = await User.findOne({
      where: { [Op.or]: [{ email: entry.email }, { loginId: entry.email }] },
      transaction: tx,
    });

    if (byEmail) {
      if (byEmail.role !== entry.role) {
        throw new Error(`${entry.email} already belongs to a ${byEmail.role} account; not changing its role.`);
      }
      await applyEntry(byEmail, entry, tx);
      log.push(`updated   ${entry.role.padEnd(11)} ${entry.email}${entry.hostel ? ` (${entry.hostel})` : ''}`);
      continue;
    }

    if (entry.replacesLoginId) {
      const legacy = await User.findOne({ where: { loginId: entry.replacesLoginId }, transaction: tx });
      if (!legacy || legacy.role !== entry.role) {
        throw new Error(`${entry.where}: no ${entry.role} account with ID "${entry.replacesLoginId}" to replace.`);
      }
      await applyEntry(legacy, entry, tx);
      log.push(`converted ${entry.role.padEnd(11)} ${entry.replacesLoginId} -> ${entry.email}`);
      continue;
    }

    if (entry.role === 'ChiefWarden') {
      const other = await User.findOne({ where: { role: 'ChiefWarden' }, transaction: tx });
      if (other) {
        throw new Error(
          `A Chief Warden account already exists (${other.email || other.loginId}). ` +
            `Add "replacesLoginId": "${other.loginId}" to chiefWarden to convert it.`
        );
      }
    }

    const user = User.build({ role: entry.role, name: entry.name });
    await applyEntry(user, entry, tx);
    log.push(`created   ${entry.role.padEnd(11)} ${entry.email}${entry.hostel ? ` (${entry.hostel})` : ''}`);
  }
};

run().catch(async (err) => {
  console.error(`Seeding failed: ${err.message}`);
  await closePostgres().catch(() => {});
  process.exit(1);
});
