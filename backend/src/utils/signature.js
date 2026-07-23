// Validation for drawn signature images sent from the client.
// Signatures are stored as base64 image data URLs (same storage style as User.photo).

// A 160px-tall PNG signature is typically well under this; the cap guards against
// oversized or garbage payloads being persisted on the request document.
const MAX_SIGNATURE_BYTES = 200 * 1024; // ~200KB of base64 characters

// True only for a PNG/JPEG data URL within the size cap.
const isSignatureDataUrl = (value) =>
  typeof value === 'string' &&
  /^data:image\/(png|jpeg);base64,/.test(value) &&
  value.length <= MAX_SIGNATURE_BYTES;

module.exports = { isSignatureDataUrl, MAX_SIGNATURE_BYTES };
