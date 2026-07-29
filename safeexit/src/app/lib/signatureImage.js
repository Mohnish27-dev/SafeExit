// Signature image handling: resize so it fits the storage cap, then encode. Whatever the
// user drew or photographed is kept as-is — no thresholding, no cropping, no background
// removal, so a capture never gets rejected for lighting or contrast. The upload UI may
// crop a photo before passing the adjusted image to this helper.
//
// Encoding depends on the source. A drawn pad stroke has a transparent background and must
// stay PNG — JPEG has no alpha channel and would composite the transparency to BLACK, giving
// a black rectangle at every render site. An uploaded photo is opaque, so it goes to JPEG,
// which keeps a camera photo an order of magnitude smaller than the PNG equivalent.
//
// Note there are two compressImage() helpers in this codebase (login/student/page.js and
// dashboard/student/page.js) that always encode JPEG. Never route a drawn signature through
// either, for the reason above.

// Fits a phone photo without shrinking the signature into illegibility.
export const SIGNATURE_MAX_DIMENSION = 1200;
// Under the backend's 400KB cap (backend/src/utils/signature.js), with margin.
export const SIGNATURE_MAX_BYTES = 320 * 1024;

const loadImage = (dataUrl) =>
  new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    // window.Image, not the Next.js Image component.
    const img = typeof window !== "undefined" && window.Image ? new window.Image() : document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

/**
 * Re-encode a captured signature for storage.
 * Pass transparent: true for canvas-drawn strokes (keeps alpha, encodes PNG).
 * Resolves to { dataUrl, width, height } or { error: "unreadable" | "tooLarge" }.
 */
export const prepareSignatureImage = async (rawDataUrl, { transparent = false } = {}) => {
  const img = await loadImage(rawDataUrl);
  if (!img || !img.width || !img.height) return { error: "unreadable" };

  // Downscale only — upscaling a small signature would just blur it.
  const baseScale = Math.min(1, SIGNATURE_MAX_DIMENSION / Math.max(img.width, img.height));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = baseScale * Math.pow(0.8, attempt);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (!transparent) {
      // JPEG cannot carry alpha; paint the sheet first so any transparent edge stays white.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let dataUrl;
    try {
      dataUrl = transparent
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", Math.max(0.5, 0.85 - attempt * 0.05));
    } catch {
      return { error: "unreadable" }; // tainted canvas
    }

    if (dataUrl.length <= SIGNATURE_MAX_BYTES) {
      return { dataUrl, width: canvas.width, height: canvas.height };
    }
  }

  return { error: "tooLarge" };
};

// User-facing copy for each failure mode.
export const SIGNATURE_ERROR_MESSAGES = {
  unreadable: "We couldn't open that image. Please pick another file.",
  tooLarge: "That image is too large to save. Please pick a smaller one.",
};

export const describeSignatureError = (code) =>
  SIGNATURE_ERROR_MESSAGES[code] || SIGNATURE_ERROR_MESSAGES.unreadable;

// The backend returns 428 + code SIGNATURE_REQUIRED when the caller has no saved
// signature yet (backend/src/utils/signature.js). 428 is unique in this API, so it is
// safe to branch on even where the error body was dropped.
export const isSignatureRequiredError = (err) =>
  err?.status === 428 || err?.code === "SIGNATURE_REQUIRED";
