// Credits data for the /team page and the "Built by" line in the login footer.
//
// THIS IS THE ONLY FILE YOU EDIT to change who is credited. The page renders
// whatever is here — add or remove members freely, the grid reflows on its own.
//
// Every field except `name` is optional: a blank string or null is simply not
// rendered, so a half-filled entry still looks intentional rather than broken.

export const TEAM = {
  // Shown as the big heading on /team and in the login footer line.
  name: "Team SafeExit",
  // One line under the team name. Keep it short — it wraps badly past ~90 chars.
  tagline: "Two students of NIT Patna, building a safer way off campus.",
  institute: "National Institute of Technology Patna",
  campus: "Bihta Campus",
  // Academic session the project was built in, e.g. "2025-26".
  session: "2026-27",
  // Optional. Leave "" to hide the button.
  repoUrl: "https://github.com/Mohnish27-dev/SafeExit",
  contactEmail: "safeexit927@gmail.com",
};

// A member needs only `name`. Fill the rest in as you get it.
//   role          — one-line headline of what they owned on the project
//   contributions — up to ~3 short bullets; these are what a recruiter reads
//   photo         — put the file in public/images/team/ and reference it as
//                   "/images/team/<file>.jpg". Leave null to show initials.
//                   Filenames are case-sensitive on the Linux deploy box even
//                   though Windows lets a wrong case slide locally.
//   photoPosition — CSS object-position, only needed when a non-square photo
//                   crops badly in the square avatar (e.g. "center 8%").
export const TEAM_MEMBERS = [
  {
    id: "gungun-wadhwani",
    name: "Gungun Wadhwani",
    // TODO: role + contributions — the fields a recruiter actually reads.
    role: "",
    contributions: [],
    rollNo: "2406084",
    branch: "",
    yearOfStudy: "",
    photo: "/images/team/Gungun.png",
    linkedin: "https://www.linkedin.com/in/gungun-wadhwani-0aa273325/",
    github: "https://github.com/GungunW-0903",
    email: "wadhwagungun09@gmail.com",
  },
  {
    id: "mohnish-pamnani",
    name: "Mohnish Pamnani",
    // TODO: role + contributions — the fields a recruiter actually reads.
    role: "",
    contributions: [],
    rollNo: "2406058",
    branch: "",
    yearOfStudy: "",
    photo: "/images/team/MOHNISH.png",
    // Portrait source (376x642) in a square avatar: a centred crop would cut the
    // top of the head off, so bias the crop upward toward the face.
    photoPosition: "center 8%",
    linkedin: "https://www.linkedin.com/in/mohnish-pamnani-595a81284/",
    github: "https://github.com/Mohnish27-dev",
    email: "mohnishpamnani27@gmail.com",
  },
];

// Faculty guide / mentor / HOD. Empty array hides the whole section.
// `email`, `webpage` and `specializations` are all optional and drop out cleanly.
//
// Deliberately NOT carried over from the faculty profile: the personal mobile
// number (republishing it campus-wide is the professor's call, not ours) and the
// publication / research-student counts (his metrics, not this project's).
export const TEAM_MENTORS = [
  {
    name: "Dr. Balaji Naik",
    title: "Assistant Professor",
    // Inferred from the balaji.cs@nitp.ac.in address — confirm before deploying.
    department: "Dept. of Computer Science & Engineering",
    email: "balaji.cs@nitp.ac.in",
    webpage: "",
    specializations: ["Cloud Computing", "Edge Computing", "Nature Inspired Algorithms"],
  },
];

// Free-form thanks — hostel office, security staff, testers. Empty array hides it.
export const TEAM_ACKNOWLEDGEMENTS = [
  // "Hostel caretakers and security staff who trialled the gate flow.",
];

// A member is worth rendering a link row for only if at least one link exists.
export const memberHasLinks = (member) =>
  Boolean(member.linkedin || member.github || member.email);
