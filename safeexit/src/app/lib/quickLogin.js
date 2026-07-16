// Quick Login: password encrypted under a PIN-derived key (PBKDF2 → AES-GCM); convenience, not the security boundary.

// Per-role localStorage keys so student/guard/warden never clobber each other
const STUDENT_KEYS = {
  pinKey: "safeexit_quick_pin",           // encrypted secret blob
  labelKey: "safeexit_quick_label",       // display name for the PIN screen
  profileKey: "safeexit_user_profile",
  webauthnKey: "safeexit_webauthn_registered",
};

const PBKDF2_ITERATIONS = 250000;

// base64 <-> ArrayBuffer (localStorage only holds strings)
const bufToB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
const b64ToBuf = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const deriveKey = async (pin, salt) => {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(pin)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// Build a Quick Login helper bound to a role's localStorage keys.
export const makeQuickLogin = ({ pinKey, labelKey, profileKey, webauthnKey }) => {
  const hasQuickPin = () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(pinKey);
  };

  const hasBiometric = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(webauthnKey) === "true";
  };

  const getQuickLabel = () => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(labelKey) || "";
  };

  const setQuickPin = async (pin, secret, label = "") => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pin, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(secret)
    );
    const blob = {
      v: 1,
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      ct: bufToB64(ciphertext),
    };
    localStorage.setItem(pinKey, JSON.stringify(blob));
    if (label) localStorage.setItem(labelKey, label);
  };

  // Returns the recovered secret, or null if the PIN is wrong / no blob exists
  const verifyQuickPin = async (pin) => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(pinKey);
    if (!raw) return null;
    try {
      const { salt, iv, ct } = JSON.parse(raw);
      const key = await deriveKey(pin, b64ToBuf(salt));
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBuf(iv) },
        key,
        b64ToBuf(ct)
      );
      return new TextDecoder().decode(plain);
    } catch {
      // Wrong PIN → GCM auth tag mismatch
      return null;
    }
  };

  const clearQuickLogin = ({ forgetProfile = false } = {}) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(pinKey);
    localStorage.removeItem(labelKey);
    localStorage.removeItem(webauthnKey);
    if (forgetProfile) localStorage.removeItem(profileKey);
  };

  return { hasQuickPin, hasBiometric, getQuickLabel, setQuickPin, verifyQuickPin, clearQuickLogin };
};

// Student-bound instance — named exports used by the student page
const student = makeQuickLogin(STUDENT_KEYS);
export const hasQuickPin = student.hasQuickPin;
export const hasBiometric = student.hasBiometric;
export const getQuickLabel = student.getQuickLabel;
export const setQuickPin = student.setQuickPin;
export const verifyQuickPin = student.verifyQuickPin;
export const clearQuickLogin = student.clearQuickLogin;
