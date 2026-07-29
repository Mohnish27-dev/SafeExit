"use client";

import { useRef, useState } from "react";
import { Check, PenLine, Upload, ZoomIn, ZoomOut } from "lucide-react";
import SignaturePad from "./SignaturePad";
import { prepareSignatureImage, describeSignatureError } from "@/app/lib/signatureImage";
import {
  clampImageCropOffset,
  getImageCoverScale,
  getImageCropSourceRect,
} from "@/app/lib/imageCrop.mjs";

const SIGNATURE_CROP_FRAME = { width: 500, height: 200 };
const SIGNATURE_CROP_OUTPUT = { width: 1000, height: 400 };
const MAX_SIGNATURE_UPLOAD_SIZE = 12 * 1024 * 1024;

// Capture a signature once, by drawing it or uploading a photo of it.
//
// Drawn signatures are resized only; uploaded photos first pass through the wide adjustment frame. An
// upload is never judged on lighting or contrast — the earlier version scored those and
// rejected legitimate photos, which left students unable to file an outing at all.
//
// SignaturePad is intentionally wrapped rather than extended. It is uncontrolled and
// cannot be seeded with an existing signature, so "your current signature" is shown as a
// plain <img> beside a fresh pad — the same shape the photo picker already uses. Clearing
// the pad between tab switches is a `key` remount.
export default function SignatureCapture({
  currentSignature = null,
  onSave,
  saving = false,
  error = "",
  saveLabel = "Save signature",
  disabled = false,
}) {
  const [tab, setTab] = useState("draw");
  // Raw pad output, cleaned only at save time: SignaturePad fires onChange on every
  // pointerup, and cleaning per stroke would run a full-canvas pass per stroke.
  const [rawDraw, setRawDraw] = useState(null);
  const [draft, setDraft] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [padKey, setPadKey] = useState(0);
  const [cropSource, setCropSource] = useState(null);
  const [cropNatural, setCropNatural] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef(null);
  const cropDragRef = useRef(null);
  const fileReadIdRef = useRef(0);

  const busy = saving || processing || disabled;
  const preview = draft || currentSignature;
  const shownError = localError || error;
  const cropScale = cropNatural
    ? getImageCoverScale(cropNatural, SIGNATURE_CROP_FRAME, cropZoom)
    : 1;

  const clearCrop = () => {
    fileReadIdRef.current += 1;
    cropDragRef.current = null;
    setCropSource(null);
    setCropNatural(null);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setProcessing(false);
  };

  const switchTab = (next) => {
    if (next === tab) return;
    clearCrop();
    setTab(next);
    setDraft(null);
    setRawDraw(null);
    setLocalError("");
    setPadKey((k) => k + 1);
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failed attempt.
    event.target.value = "";
    if (!file) return;

    const readId = ++fileReadIdRef.current;
    setLocalError("");
    setDraft(null);
    if (file.type && !file.type.startsWith("image/")) {
      setLocalError("Please choose a valid image file.");
      return;
    }
    if (file.size > MAX_SIGNATURE_UPLOAD_SIZE) {
      setLocalError("That image is too large. Please choose one under 12 MB.");
      return;
    }

    setProcessing(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (readId !== fileReadIdRef.current || typeof reader.result !== "string") {
        if (readId === fileReadIdRef.current) {
          setLocalError(describeSignatureError("unreadable"));
          setProcessing(false);
        }
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        if (readId !== fileReadIdRef.current) return;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          setLocalError(describeSignatureError("unreadable"));
          setProcessing(false);
          return;
        }
        setCropNatural({ width, height });
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
        setCropSource(reader.result);
        setProcessing(false);
      };
      image.onerror = () => {
        if (readId !== fileReadIdRef.current) return;
        setLocalError(describeSignatureError("unreadable"));
        setProcessing(false);
      };
      image.src = reader.result;
    };
    reader.onerror = () => {
      if (readId !== fileReadIdRef.current) return;
      setLocalError(describeSignatureError("unreadable"));
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCropZoomChange = (value) => {
    const zoom = Number(value);
    setCropZoom(zoom);
    setCropOffset((current) =>
      cropNatural
        ? clampImageCropOffset(current, cropNatural, SIGNATURE_CROP_FRAME, zoom)
        : current
    );
  };

  const handleCropPointerDown = (event) => {
    if (!cropNatural || busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: cropOffset,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    };
  };

  const handleCropPointerMove = (event) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !cropNatural || busy) return;
    const next = {
      x:
        drag.origin.x +
        ((event.clientX - drag.startX) * SIGNATURE_CROP_FRAME.width) /
          drag.renderedWidth,
      y:
        drag.origin.y +
        ((event.clientY - drag.startY) * SIGNATURE_CROP_FRAME.height) /
          drag.renderedHeight,
    };
    setCropOffset(
      clampImageCropOffset(next, cropNatural, SIGNATURE_CROP_FRAME, cropZoom)
    );
  };

  const handleCropPointerUp = (event) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCropKeyDown = (event) => {
    if (!cropNatural || busy) return;
    const movement = {
      ArrowLeft: { x: -10, y: 0 },
      ArrowRight: { x: 10, y: 0 },
      ArrowUp: { x: 0, y: -10 },
      ArrowDown: { x: 0, y: 10 },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    setCropOffset((current) =>
      clampImageCropOffset(
        { x: current.x + movement.x, y: current.y + movement.y },
        cropNatural,
        SIGNATURE_CROP_FRAME,
        cropZoom
      )
    );
  };

  const confirmCrop = () => {
    if (!cropSource || !cropNatural || busy) return;
    setProcessing(true);
    setLocalError("");

    const sourceUrl = cropSource;
    const natural = cropNatural;
    const zoom = cropZoom;
    const offset = cropOffset;
    const image = new window.Image();
    image.onload = async () => {
      try {
        const source = getImageCropSourceRect(
          natural,
          SIGNATURE_CROP_FRAME,
          zoom,
          offset
        );
        const canvas = document.createElement("canvas");
        canvas.width = SIGNATURE_CROP_OUTPUT.width;
        canvas.height = SIGNATURE_CROP_OUTPUT.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
          image,
          source.x,
          source.y,
          source.width,
          source.height,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const result = await prepareSignatureImage(
          canvas.toDataURL("image/jpeg", 0.9)
        );
        if (result.error) {
          setLocalError(describeSignatureError(result.error));
          setProcessing(false);
          return;
        }
        setDraft(result.dataUrl);
        clearCrop();
      } catch {
        setLocalError(describeSignatureError("unreadable"));
        setProcessing(false);
      }
    };
    image.onerror = () => {
      setLocalError(describeSignatureError("unreadable"));
      setProcessing(false);
    };
    image.src = sourceUrl;
  };

  const handleSave = async () => {
    setLocalError("");
    let finalSignature = draft;

    if (tab === "draw" && rawDraw) {
      setProcessing(true);
      // transparent: the pad's background is empty, so this must stay a PNG with alpha.
      const result = await prepareSignatureImage(rawDraw, { transparent: true });
      setProcessing(false);
      if (result.error) {
        setLocalError(describeSignatureError(result.error));
        return;
      }
      finalSignature = result.dataUrl;
      setDraft(result.dataUrl);
    }

    if (!finalSignature) {
      setLocalError("Please draw or upload your signature first.");
      return;
    }
    await onSave?.(finalSignature);
  };

  const tabClass = (name) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
      tab === name
        ? "bg-indigo-600 text-white shadow-sm"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`;

  return (
    <div className="w-full">
      <div className="flex gap-2 rounded-2xl bg-slate-50 p-1">
        <button type="button" onClick={() => switchTab("draw")} disabled={busy} className={tabClass("draw")}>
          <PenLine size={13} /> Draw
        </button>
        <button type="button" onClick={() => switchTab("upload")} disabled={busy} className={tabClass("upload")}>
          <Upload size={13} /> Upload photo
        </button>
      </div>

      <div className="mt-3">
        {tab === "draw" ? (
          <SignaturePad
            key={padKey}
            label="Sign here"
            hint="Draw your signature using your finger"
            onChange={setRawDraw}
            disabled={busy}
          />
        ) : (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFile}
              accept="image/*"
              className="hidden"
            />
            {cropSource && cropNatural ? (
              <div>
                <div
                  role="img"
                  aria-label="Signature crop area. Drag the image or use the arrow keys to reposition it."
                  tabIndex={busy ? -1 : 0}
                  className={`relative w-full touch-none select-none overflow-hidden rounded-2xl border-2 border-indigo-200 bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
                    busy
                      ? "cursor-wait opacity-70"
                      : "cursor-grab active:cursor-grabbing"
                  }`}
                  style={{ aspectRatio: `${SIGNATURE_CROP_FRAME.width} / ${SIGNATURE_CROP_FRAME.height}` }}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  onLostPointerCapture={() => {
                    cropDragRef.current = null;
                  }}
                  onKeyDown={handleCropKeyDown}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropSource}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none"
                    style={{
                      width: `${(cropNatural.width * cropScale * 100) / SIGNATURE_CROP_FRAME.width}%`,
                      height: `${(cropNatural.height * cropScale * 100) / SIGNATURE_CROP_FRAME.height}%`,
                      left: `${50 + (cropOffset.x * 100) / SIGNATURE_CROP_FRAME.width}%`,
                      top: `${50 + (cropOffset.y * 100) / SIGNATURE_CROP_FRAME.height}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60" />
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/50" />
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/50" />
                </div>

                <p className="mt-2 text-center text-xs text-slate-500">
                  Drag to position the signature inside the frame.
                </p>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>Zoom</span>
                    <span>{Math.round(cropZoom * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ZoomOut aria-hidden="true" size={15} className="shrink-0 text-slate-400" />
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="0.01"
                      value={cropZoom}
                      onChange={(event) => handleCropZoomChange(event.target.value)}
                      disabled={busy}
                      aria-label="Signature photo zoom"
                      className="w-full cursor-pointer accent-indigo-600 disabled:cursor-wait"
                    />
                    <ZoomIn aria-hidden="true" size={15} className="shrink-0 text-slate-400" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="mt-3 w-full cursor-pointer text-xs font-bold text-indigo-600 transition hover:text-indigo-700 disabled:cursor-wait disabled:opacity-50"
                >
                  Choose a different photo
                </button>

                <div className="mt-3 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      clearCrop();
                      setLocalError("");
                    }}
                    disabled={busy}
                    className="flex-1 cursor-pointer rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmCrop}
                    disabled={busy}
                    className="inline-flex flex-[2] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Check size={14} />
                    {processing ? "Processing…" : "Use adjusted photo"}
                  </button>
                </div>
              </div>
            ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-wait disabled:opacity-60"
            >
              <Upload size={20} className="text-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">
                {processing ? "Processing…" : "Choose a photo of your signature"}
              </span>
              <span className="text-xs text-slate-400">
                Upload, zoom, and position it before saving
              </span>
            </button>
            )}
          </div>
        )}
      </div>

      {preview && !cropSource && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {draft ? "New signature" : "Current signature"}
          </p>
          {/* Explicit white background: a drawn signature is a transparent PNG and must
              read correctly here. */}
          <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Signature preview"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      )}

      {shownError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{shownError}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={busy || Boolean(cropSource) || (!rawDraw && !draft)}
        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check size={16} />
        {saving ? "Saving…" : processing ? "Processing…" : saveLabel}
      </button>
    </div>
  );
}
