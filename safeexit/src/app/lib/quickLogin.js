// Device-local "Quick Login" for students — an IRCTC-style 4-digit PIN plus an
// optional biometric passkey.
//
// The backend only issues a session for a real email+password login or a WebAuthn
// assertion; there is no PIN endpoint. So the PIN can't be a server secret — it's
// a *device* convenience. To turn a 4-digit PIN back into a real backend session
// we keep the student's password on the device, but NEVER in plaintext: it is
// encrypted with a key derived from the PIN (PBKDF2 → AES-GCM). Entering the right
// PIN decrypts the password, which we then hand to /auth/login for a genuine token.
// A wrong PIN fails the AES-GCM auth tag, so it can't leak the password.
//
// Tradeoff (intentional, matches consumer "quick login" apps): a 4-digit PIN has
// only 10,000 combinations, so anyone with raw access to this device's
// localStorage could brute-force it offline. PBKDF2 with a high iteration count
// slows that down, but the PIN is a convenience factor for a trusted personal
// device — the password + passkey remain the real security boundary.

// Each role keeps its Quick Login under its OWN localStorage keys so the student,
// guard and warden logins never clobber each other on the same browser. The
// student keys below are also the default instance exported for the student page.
const STUDENT_KEYS = {
  pinKey: "safeexit_quick_pin",           // encrypted secret blob
  labelKey: "safeexit_quick_label",       // display name for the PIN screen
  profileKey: "safeexit_user_profile",
  webauthnKey: "safeexit_webauthn_registered",
};

const PBKDF2_ITERATIONS = 250000;

// --- small base64 <-> ArrayBuffer helpers (localStorage only holds strings) ---
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

// Derive an AES-GCM key from the PIN + a per-device random salt.
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
  // Is a PIN configured on THIS device?
  const hasQuickPin = () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(pinKey);
  };

  // Is a passkey enrolled on THIS device (the optional biometric factor)?
  const hasBiometric = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(webauthnKey) === "true";
  };

  const getQuickLabel = () => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(labelKey) || "";
  };

  // Enrol a PIN: encrypt `secret` under a key derived from `pin` and persist the
  // blob. `label` (e.g. roll number / staff ID) is shown on the PIN screen.
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

  // Verify a PIN by attempting to decrypt the stored blob. Returns the recovered
  // secret on success, or null if the PIN is wrong / no blob exists.
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
      // Wrong PIN → GCM auth tag mismatch → decrypt throws.
      return null;
    }
  };

  // Forget the quick-login factors (PIN + optional passkey marker). When
  // `forgetProfile` is true we also drop the stored profile.
  const clearQuickLogin = ({ forgetProfile = false } = {}) => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(pinKey);
    localStorage.removeItem(labelKey);
    localStorage.removeItem(webauthnKey);
    if (forgetProfile) localStorage.removeItem(profileKey);
  };

  return { hasQuickPin, hasBiometric, getQuickLabel, setQuickPin, verifyQuickPin, clearQuickLogin };
};

// Student-bound instance — keeps the existing named exports the student page uses.
const student = makeQuickLogin(STUDENT_KEYS);
export const hasQuickPin = student.hasQuickPin;
export const hasBiometric = student.hasBiometric;
export const getQuickLabel = student.getQuickLabel;
export const setQuickPin = student.setQuickPin;
export const verifyQuickPin = student.verifyQuickPin;
export const clearQuickLogin = student.clearQuickLogin;
