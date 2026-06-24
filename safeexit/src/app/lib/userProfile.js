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
  room: "",
  mobile: "",
};

export const getStoredUser = () => {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(USER_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setStoredUser = (profile) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
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

export const buildSlug = (name) => {
  if (!name) return "UNKNOWN";
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
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
  const rollNo = stored.rollNo || (isEmailId ? "STU2024CSE102" : stored.id || "STU2024CSE102");
  const email = stored.email || (isEmailId ? stored.id : `${stored.name.toLowerCase().replace(/\s+/g, ".")}@nitp.ac.in`);

  return {
    ...defaultStudentProfile,
    ...stored,
    subtitle,
    rollNo,
    email,
    roleLabel: stored.roleLabel || "Student",
    room: stored.room || getRoomFromProfile(stored),
  };
};
