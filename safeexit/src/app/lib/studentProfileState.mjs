// Pure student-profile shaping, kept dependency-free so node --test can import it.

// Display placeholders shown before a real profile is known. They must never be
// persisted: a stored "Student" name looks like a login, so the dashboard would keep
// rendering it until the session is cleared.
export const STUDENT_PLACEHOLDERS = {
  name: "Student",
  subtitle: "Year, Program",
  id: "—",
  rollNo: "—",
  email: "student@nitp.ac.in",
  hostel: "—",
};

// Same format the registration/Quick Login path writes ("2nd Year, CSE" or "M.Tech, CSE").
export const buildStudentSubtitle = (year, department) => {
  if (!year && !department) return "";
  let yearStr = "";
  if (year) {
    const trimmed = String(year).trim();
    if (
      trimmed.toLowerCase().endsWith("year") ||
      ["m.tech", "mca", "phd", "mtech"].includes(trimmed.toLowerCase())
    ) {
      yearStr = trimmed;
    } else {
      yearStr = `${trimmed} Year`;
    }
  }
  const parts = [yearStr, department || ""].filter(Boolean);
  return parts.join(", ");
};

// Drops placeholder values (and signature bytes, which the per-tab store never holds).
export const stripStudentPlaceholders = (profile) => {
  if (!profile || typeof profile !== "object") return profile;
  const clean = { ...profile };
  for (const [key, placeholder] of Object.entries(STUDENT_PLACEHOLDERS)) {
    if (clean[key] === placeholder) delete clean[key];
  }
  delete clean.signature;
  return clean;
};

// A stored student profile the dashboard can't render truthfully without the server.
export const isIncompleteStudentProfile = (stored) => {
  const clean = stripStudentPlaceholders(stored);
  return !clean?.name || !clean?.rollNo;
};

// Maps an /auth/profile or /auth/refresh payload onto the stored-profile shape.
// Empty server values are omitted so a merge never blanks a field the tab already has.
export const studentProfileFromServer = (me) => {
  const hostelName = me?.hostelName || "";
  const room = me?.roomNumber || "";
  const profile = {
    name: me?.name,
    role: "student",
    roleLabel: "Student",
    subtitle: buildStudentSubtitle(me?.year, me?.department),
    id: me?.studentId || me?.email,
    rollNo: me?.studentId,
    sid: me?._id,
    email: me?.email,
    room,
    mobile: me?.phoneNumber,
    gender: me?.gender,
    hostelName,
    hostel: hostelName ? `Block ${hostelName}${room ? `, Room ${room}` : ""}` : room ? `Room ${room}` : "",
    year: me?.year,
    department: me?.department,
    guardianPhoneNumber: me?.guardianPhoneNumber,
  };
  const result = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  if (me && "hasSignature" in me) result.hasSignature = Boolean(me.hasSignature);
  if (me && "profileUnlocked" in me) result.profileUnlocked = Boolean(me.profileUnlocked);
  return result;
};
