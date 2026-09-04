import { genderForHostel } from "./hostels";

const USER_PROFILE_KEY = "safeexit:user";

export const defaultStudentProfile = {
  name: "Student",
  role: "student",
  roleLabel: "Student",
  subtitle: "Year, Program",
  id: "—",
  rollNo: "—",
  email: "student@nitp.ac.in",
  hostel: "—",
  hostelName: "",
  gender: "",
  room: "",
  mobile: "",
  // Flag only. This store deliberately holds signature *flags*, never signature bytes —
  // it is per-tab and would otherwise carry a base64 image that only the capture
  // screens read (they fetch it from /auth/profile instead).
  hasSignature: false,
};

// Tab-scoped (sessionStorage) so another tab's role can't overwrite this one.
export const getStoredUser = () => {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setStoredUser = (profile) => {
  if (typeof window === "undefined") return;

  sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
};

// Flip the cached flag after a signature is saved, so the request forms stop
// pre-opening the setup modal without needing a full profile refetch.
export const markSignatureSaved = () => {
  const stored = getStoredUser();
  if (stored) setStoredUser({ ...stored, hasSignature: true });
};

export const getInitials = (name) => {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

export const getFirstName = (name) => {
  if (!name) return "";
  return name.split(" ").filter(Boolean)[0] || "";
};

export const getRoomFromProfile = (profile) => {
  if (profile?.room) return profile.room;
  const hostel = profile?.hostel || "";
  const match = hostel.match(/Room\s*([A-Za-z0-9-]+)/i);
  return match ? match[1] : "—";
};

export const formatDisplayMobile = (profile) => {
  if (!profile?.mobile) return "Not on file";
  const digits = String(profile.mobile).replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return profile.mobile;
};

export const normalizeStudentProfile = (stored) => {
  if (!stored?.name) {
    return { ...defaultStudentProfile };
  }

  const subtitle =
    stored.role === "student" && stored.subtitle === "2nd Year, CSE"
      ? "Year, Program"
      : stored.subtitle || defaultStudentProfile.subtitle;

  const isEmailId = stored.id && String(stored.id).includes("@");
  // Never fabricate a roll number — the QR encodes it and the gate scanner looks it up in the DB
  const rollNo = stored.rollNo || (isEmailId ? "" : stored.id) || defaultStudentProfile.rollNo;
  const email = stored.email || (isEmailId ? stored.id : `${stored.name.toLowerCase().replace(/\s+/g, ".")}@nitp.ac.in`);

  const hostelName = stored.hostelName || "";
  const gender = stored.gender || (hostelName ? genderForHostel(hostelName) : "") || defaultStudentProfile.gender;

  return {
    ...defaultStudentProfile,
    ...stored,
    subtitle,
    rollNo,
    email,
    gender,
    hostelName,
    roleLabel: stored.roleLabel || "Student",
    room: stored.room || getRoomFromProfile(stored),
  };
};
