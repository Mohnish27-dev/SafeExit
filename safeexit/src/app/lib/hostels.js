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

export const HOSTEL_TRANSLATIONS = {
  hi: {
    Kadambini: "कादंबिनी",
    Aryabhatta: "आर्यभट्ट",
    Kautilya: "कौटिल्य",
    Nagarjuna: "नागार्जुन",
    Sarojini: "सरोजिनी",
    "Boys' Hostel": "बॉयज़ हॉस्टल",
    "Girls' Hostel": "गर्ल्स हॉस्टल",
  },
  en: {
    Kadambini: "Kadambini",
    Aryabhatta: "Aryabhatta",
    Kautilya: "Kautilya",
    Nagarjuna: "Nagarjuna",
    Sarojini: "Sarojini",
    "Boys' Hostel": "Boys' Hostel",
    "Girls' Hostel": "Girls' Hostel",
  },
};

/**
 * Returns the localized name of a hostel (e.g. Kadambini -> कादंबिनी in Hindi).
 */
export function getTranslatedHostelName(name, locale = "en") {
  if (!name) return "";
  const str = String(name).trim();
  if (locale === "hi") {
    for (const [enKey, hiVal] of Object.entries(HOSTEL_TRANSLATIONS.hi)) {
      if (enKey.toLowerCase() === str.toLowerCase()) {
        return hiVal;
      }
    }
  }
  return str;
}

/**
 * Translates staff display names like "Kadambini Caretaker" -> "कादंबिनी केयरटेकर"
 */
export function formatStaffDisplayName(name, locale = "en") {
  if (!name) return "";
  if (locale === "hi") {
    let result = String(name);
    for (const [enKey, hiVal] of Object.entries(HOSTEL_TRANSLATIONS.hi)) {
      const reg = new RegExp(`\\b${enKey}\\b`, "gi");
      result = result.replace(reg, hiVal);
    }
    result = result.replace(/\bCaretaker\b/gi, "केयरटेकर");
    result = result.replace(/\bChief\b/gi, "चीफ");
    result = result.replace(/\bWarden\b/gi, "वार्डन");
    result = result.replace(/\bGuard\b/gi, "गार्ड");
    return result;
  }
  return name;
}

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
