const USER_PROFILE_KEY = "safeexit:user";

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
