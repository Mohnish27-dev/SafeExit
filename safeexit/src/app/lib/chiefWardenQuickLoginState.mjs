export const resolveRememberedChiefWarden = ({ hasQuickPin, profileRaw, quickLabel }) => {
  if (!hasQuickPin) return null;

  let stored = null;
  try {
    stored = JSON.parse(profileRaw || "null");
  } catch {
    stored = null;
  }

  const staffId = stored?.staffId || quickLabel;
  if (!staffId) return null;
  return { staffId, fullName: stored?.fullName || "Chief Warden" };
};
