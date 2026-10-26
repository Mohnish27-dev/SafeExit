// Single source of truth for the campus hostels on the client.
// Gender is implied by the hostel, so selecting one verifies the student as a
// boy/girl without a separate gender question. Keep this in sync with the
// backend copy at backend/src/config/hostels.js.
export const HOSTELS = [
  { name: "Kautilya", gender: "Male" },
  { name: "Aryabhatta", gender: "Male" },
  { name: "Nagarjuna", gender: "Male" },
  { name: "Kadambini", gender: "Female" },
  { name: "Sarojini", gender: "Female" },
];

export const hostelsForGender = (gender) => HOSTELS.filter((h) => h.gender === gender);

export const genderForHostel = (name) =>
  HOSTELS.find((h) => h.name === name)?.gender || "";

// Human labels for the two hostel genders, reused across caretaker/admin UI.
export const HOSTEL_GENDER_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

// Where a student lives. A day scholar lives at home: no hostel, no room, a gender of their
// own (nothing implies it), no leave, and at the gate only a logged entry/exit — never an
// outing, so never overdue. Mirrors RESIDENCY in backend/src/config/hostels.js.
export const RESIDENCY = { HOSTEL: "Hostel", DAY_SCHOLAR: "DayScholar" };

export const isDayScholar = (user) => user?.residency === RESIDENCY.DAY_SCHOLAR;
