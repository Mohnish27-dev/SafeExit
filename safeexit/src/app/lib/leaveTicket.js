// The optional travel ticket on a leave application: a photo/screenshot or a PDF e-ticket.
//
// The backend caps it at 700 KB decoded (backend/src/utils/leaveSchema.js MAX_TICKET_BYTES),
// so the base64'd application stays under nginx's default 1 MB request limit. A PDF is
// sent as-is, so it must already fit. A photo is downscaled and re-encoded as JPEG until it
// does — a phone camera shot is several MB, and the text on a ticket survives this fine.

export const MAX_TICKET_BYTES = 700 * 1024;
const MAX_DIMENSION = 1800;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (dataUrl) =>
  new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

// Bytes a base64 data URL decodes to.
const decodedSize = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

// Resolves to { dataUrl, name, isPdf } or { error } with a message for the student.
export const prepareTicketFile = async (file) => {
  if (!file) return { error: "No file selected." };

  if (file.type === "application/pdf") {
    if (file.size > MAX_TICKET_BYTES) {
      return { error: "That PDF is over 700 KB. Upload a smaller PDF, or a screenshot of the ticket instead." };
    }
    return { dataUrl: await readAsDataUrl(file), name: file.name, isPdf: true };
  }

  if (!IMAGE_TYPES.includes(file.type)) {
    return { error: "Upload the ticket as a photo (JPEG, PNG or WebP) or a PDF." };
  }

  const img = await loadImage(await readAsDataUrl(file));
  if (!img || !img.width || !img.height) return { error: "We couldn't read that image. Try another photo." };

  const baseScale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = baseScale * Math.pow(0.8, attempt);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    // JPEG has no alpha: paint white first so a transparent screenshot edge isn't black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.55, 0.85 - attempt * 0.06));
    if (decodedSize(dataUrl) <= MAX_TICKET_BYTES) return { dataUrl, name: file.name, isPdf: false };
  }
  return { error: "That image is too large even after shrinking it. Try a screenshot instead." };
};
