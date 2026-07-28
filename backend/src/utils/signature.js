// Validation for signature images.
//
// Signatures are captured ONCE (onboarding or profile) and stored on the user as a
// base64 PNG data URL, same storage style as User.photo. Request documents carry a
// snapshot copy stamped by the server at submit/approval time.

// A drawn pad signature base64s to ~10-20KB as a PNG. An uploaded photo is JPEG and the
// client resizes it to fit; this leaves margin above the client's ~320KB target.
const MAX_SIGNATURE_BYTES = 400 * 1024;

// PNG or JPEG. Drawn signatures are PNG because they carry a transparent background;
// photographed ones are JPEG, which keeps a camera capture far smaller than PNG would.
const isSignatureDataUrl = (value) =>
  typeof value === 'string' &&
  /^data:image\/(png|jpeg);base64,/.test(value) &&
  value.length <= MAX_SIGNATURE_BYTES;

// Machine-readable contract for "this user has no saved signature yet".
// 428 is deliberate: these endpoints already return 400 and 409 for other reasons
// (and the caretaker dashboard reads 409 as "request expired"), so neither is
// distinguishable client-side. 428 is otherwise unused in this backend.
const SIGNATURE_REQUIRED_CODE = 'SIGNATURE_REQUIRED';
const SIGNATURE_REQUIRED_STATUS = 428;

// The caller's own saved signature, or null. `protect` already loads the full user
// document onto req.user, so this costs no extra query.
const ownSignature = (user) =>
  isSignatureDataUrl(user && user.signature) ? user.signature : null;

const sendSignatureRequired = (res, message) =>
  res.status(SIGNATURE_REQUIRED_STATUS).json({ code: SIGNATURE_REQUIRED_CODE, message });

module.exports = {
  isSignatureDataUrl,
  ownSignature,
  sendSignatureRequired,
  SIGNATURE_REQUIRED_CODE,
  SIGNATURE_REQUIRED_STATUS,
  MAX_SIGNATURE_BYTES,
};
