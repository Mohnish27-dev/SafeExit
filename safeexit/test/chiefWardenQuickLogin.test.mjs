import test from "node:test";
import assert from "node:assert/strict";
import { resolveRememberedChiefWarden } from "../src/app/lib/chiefWardenQuickLoginState.mjs";

test("a completed Chief Warden Quick Login restores the saved profile", () => {
  const profile = resolveRememberedChiefWarden({
    hasQuickPin: true,
    profileRaw: JSON.stringify({ staffId: "CWDN001", fullName: "Chief Warden One" }),
    quickLabel: "CWDN001",
  });

  assert.deepEqual(profile, { staffId: "CWDN001", fullName: "Chief Warden One" });
});

test("the encrypted Quick PIN label restores returning mode if profile JSON is missing", () => {
  const profile = resolveRememberedChiefWarden({
    hasQuickPin: true,
    profileRaw: null,
    quickLabel: "CWDN001",
  });

  assert.deepEqual(profile, { staffId: "CWDN001", fullName: "Chief Warden" });
});

test("a device without an encrypted Quick PIN remains in onboarding", () => {
  assert.equal(resolveRememberedChiefWarden({
    hasQuickPin: false,
    profileRaw: JSON.stringify({ staffId: "CWDN001" }),
    quickLabel: "CWDN001",
  }), null);
});
