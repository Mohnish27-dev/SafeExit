import { genderForHostel } from "./hostels";
import {
  STUDENT_PLACEHOLDERS,
  stripStudentPlaceholders,
  studentProfileFromServer,
} from "./studentProfileState.mjs";

const USER_PROFILE_KEY = "safeexit:user";

// Fired on every store write, so pages that read the profile on mount pick up a
// session restored after they rendered.
export const USER_UPDATED_EVENT = "safeexit:user-updated";

export const defaultStudentProfile = {
  ...STUDENT_PLACEHOLDERS,
  role: "student",
  roleLabel: "Student",
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

  // A student profile never persists display placeholders or signature bytes.
  const toStore = profile?.role === "student" ? stripStudentPlaceholders(profile) : profile;
  sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(toStore));
  window.dispatchEvent(new Event(USER_UPDATED_EVENT));
};

// Server profile wins over the tab cache; device-only fields (the photo) fall back
// to what the tab already holds. Returns the normalized profile it stored.
export const syncStoredStudentProfile = (me) => {
  const cached = getStoredUser();
  // Only reuse the tab cache when it belongs to this same student.
  const sameStudent =
    cached?.role === "student" && (!cached.rollNo || !me?.studentId || cached.rollNo === me.studentId);
  const stored = sameStudent ? cached : {};
  const merged = normalizeStudentProfile({
    ...stripStudentPlaceholders(stored),
    ...studentProfileFromServer(me),
    photo: me?.photo || stored.photo || null,
  });
  setStoredUser(merged);
  return merged;
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

export const normalizeStudentProfile = (raw) => {
  // A placeholder "Student" name (written by an older build) is not a login.
  const stored = stripStudentPlaceholders(raw);
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
