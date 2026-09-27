import { apiFetch } from "./api";

// Device markers for wardens and the Chief Warden, who sign in with Google and so have no
// Quick Login PIN. The role picker (/login) reads them to send a returning device straight
// to the right login page, and the login page uses the stored email as Google's
// login_hint. The email is not a secret; nothing here grants access.
export const GOOGLE_LOGIN_KEYS = {
	warden: "safeexit_google_login_warden",
	"chief-warden": "safeexit_google_login_chief_warden",
};

// The ID + PIN era stored an encrypted copy of the admin-issued PIN on the device. That
// PIN no longer opens anything, but it should not linger either.
const LEGACY_KEYS = {
	warden: [
		"safeexit_quick_pin_warden",
		"safeexit_quick_label_warden",
		"safeexit_warden_profile",
		"safeexit_webauthn_registered_warden",
	],
	"chief-warden": [
		"safeexit_quick_pin_chief_warden",
		"safeexit_quick_label_chief_warden",
		"safeexit_chief_warden_profile",
		"safeexit_webauthn_registered_chief_warden",
	],
};

export const clearLegacyQuickLogin = (role) => {
	if (typeof window === "undefined") return;
	for (const key of LEGACY_KEYS[role] || []) localStorage.removeItem(key);
};

export const getRememberedEmail = (role) => {
	if (typeof window === "undefined") return "";
	return localStorage.getItem(GOOGLE_LOGIN_KEYS[role]) || "";
};

export const rememberEmail = (role, email) => {
	if (typeof window === "undefined" || !email) return;
	localStorage.setItem(GOOGLE_LOGIN_KEYS[role], email);
};

export const forgetEmail = (role) => {
	if (typeof window === "undefined") return;
	localStorage.removeItem(GOOGLE_LOGIN_KEYS[role]);
};

// Exchange Google's credential for a SafeExit session. `role` is the backend role name.
export const signInWithGoogle = (credential, role) =>
	apiFetch("/auth/google", {
		method: "POST",
		body: JSON.stringify({ credential, role }),
	});
