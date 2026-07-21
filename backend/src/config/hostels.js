// Single source of truth for the campus hostels and the gender each belongs to.
// Gender is IMPLIED by the hostel (a student picks a hostel, not a gender), so
// this list is what registration validates against and derives gender from.
// Wardens are scoped to one of these hostels (managedHostel); managedGender is
// derived from the hostel's gender for the existing auto-approval rules.
// Keep this in sync with the frontend copy at safeexit/src/app/lib/hostels.js.
const HOSTELS = [
  { name: 'Kautilya', gender: 'Male' },
  { name: 'Aryabhatta', gender: 'Male' },
  { name: 'Nagarjuna', gender: 'Male' },
  { name: 'Kadambini', gender: 'Female' },
  { name: 'Sarojini', gender: 'Female' },
];

// Case-insensitive, trimmed lookup so a value stored from the form always matches.
const findHostel = (name) => {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return HOSTELS.find((h) => h.name.toLowerCase() === key) || null;
};

const isValidHostel = (name) => findHostel(name) !== null;

// The gender a hostel implies, or null if the hostel is unknown.
const genderForHostel = (name) => findHostel(name)?.gender || null;

// Canonical stored spelling (fixes casing/whitespace from the client), or null.
const canonicalHostelName = (name) => findHostel(name)?.name || null;

const hostelNames = () => HOSTELS.map((h) => h.name);

// Hostels that belong to a given warden gender scope — used to list assignable
// hostels in admin pickers grouped by boys'/girls'.
const hostelsForGender = (gender) => HOSTELS.filter((h) => h.gender === gender);

module.exports = {
  HOSTELS,
  isValidHostel,
  genderForHostel,
  canonicalHostelName,
  hostelNames,
  hostelsForGender,
};
