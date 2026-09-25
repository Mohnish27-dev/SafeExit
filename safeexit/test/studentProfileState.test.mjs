import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStudentSubtitle,
  isIncompleteStudentProfile,
  STUDENT_PLACEHOLDERS,
  stripStudentPlaceholders,
  studentProfileFromServer,
} from "../src/app/lib/studentProfileState.mjs";

const serverPayload = {
  _id: "5b1c0e3e-0000-4000-8000-000000000001",
  name: "Aarav Kumar",
  email: "aarav.cs24@nitp.ac.in",
  role: "Student",
  studentId: "2406058",
  roomNumber: "214",
  department: "CSE",
  year: "2nd",
  phoneNumber: "9876543210",
  gender: "Male",
  hostelName: "Kautilya",
  hasSignature: true,
};

test("a restored session builds the same profile shape the login writes", () => {
  assert.deepEqual(studentProfileFromServer(serverPayload), {
    name: "Aarav Kumar",
    role: "student",
    roleLabel: "Student",
    subtitle: "2nd Year, CSE",
    id: "2406058",
    rollNo: "2406058",
    sid: "5b1c0e3e-0000-4000-8000-000000000001",
    email: "aarav.cs24@nitp.ac.in",
    room: "214",
    mobile: "9876543210",
    gender: "Male",
    hostelName: "Kautilya",
    hostel: "Block Kautilya, Room 214",
    year: "2nd",
    department: "CSE",
    hasSignature: true,
  });
});

test("profileUnlocked and guardianPhoneNumber are included when present", () => {
  const profile = studentProfileFromServer({
    ...serverPayload,
    profileUnlocked: true,
    guardianPhoneNumber: "9876543211",
  });
  assert.equal(profile.profileUnlocked, true);
  assert.equal(profile.guardianPhoneNumber, "9876543211");
});

test("empty server fields are omitted so a merge never blanks cached values", () => {
  const profile = studentProfileFromServer({ ...serverPayload, phoneNumber: "", year: null, department: undefined });
  assert.equal("mobile" in profile, false);
  assert.equal("subtitle" in profile, false);
});

test("the subtitle degrades gracefully when year or department is missing", () => {
  assert.equal(buildStudentSubtitle("3rd", ""), "3rd Year");
  assert.equal(buildStudentSubtitle("", "ECE"), "ECE");
  assert.equal(buildStudentSubtitle("M.Tech", "CSE"), "M.Tech, CSE");
  assert.equal(buildStudentSubtitle("MCA", "CSE"), "MCA, CSE");
  assert.equal(buildStudentSubtitle("PhD", "ECE"), "PhD, ECE");
  assert.equal(buildStudentSubtitle(undefined, undefined), "");
});

test("placeholders and signature bytes are stripped before storage", () => {
  const poisoned = {
    ...STUDENT_PLACEHOLDERS,
    role: "student",
    rollNo: "2406058",
    signature: "data:image/png;base64,AAAA",
    hasSignature: true,
  };
  assert.deepEqual(stripStudentPlaceholders(poisoned), {
    role: "student",
    rollNo: "2406058",
    hasSignature: true,
  });
});

test("a cached profile carrying the placeholder name counts as incomplete", () => {
  assert.equal(isIncompleteStudentProfile({ name: "Student", rollNo: "2406058" }), true);
  assert.equal(isIncompleteStudentProfile({ name: "Aarav Kumar", rollNo: "—" }), true);
  assert.equal(isIncompleteStudentProfile(null), true);
  assert.equal(isIncompleteStudentProfile({ name: "Aarav Kumar", rollNo: "2406058" }), false);
});
