import { makeQuickLogin } from "./quickLogin";
import { resolveRememberedChiefWarden } from "./chiefWardenQuickLoginState.mjs";

export const CHIEF_WARDEN_PROFILE_KEY = "safeexit_chief_warden_profile";
export const CHIEF_WARDEN_PIN_KEY = "safeexit_quick_pin_chief_warden";
export const CHIEF_WARDEN_WEBAUTHN_KEY = "safeexit_webauthn_registered_chief_warden";

export const chiefWardenQuickLogin = makeQuickLogin({
  pinKey: CHIEF_WARDEN_PIN_KEY,
  labelKey: "safeexit_quick_label_chief_warden",
  profileKey: CHIEF_WARDEN_PROFILE_KEY,
  webauthnKey: CHIEF_WARDEN_WEBAUTHN_KEY,
});

export const rememberChiefWardenProfile = (profile) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHIEF_WARDEN_PROFILE_KEY, JSON.stringify(profile));
};

// The encrypted PIN blob and its ID label are the durable Quick Login record.
// The profile adds the display name, but losing that one small JSON entry should
// not force an already-enrolled device through account setup again.
export const readRememberedChiefWarden = () => {
  if (typeof window === "undefined") return null;
  return resolveRememberedChiefWarden({
    hasQuickPin: chiefWardenQuickLogin.hasQuickPin(),
    profileRaw: localStorage.getItem(CHIEF_WARDEN_PROFILE_KEY),
    quickLabel: chiefWardenQuickLogin.getQuickLabel(),
  });
};
