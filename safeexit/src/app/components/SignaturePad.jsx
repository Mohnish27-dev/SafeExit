"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
export default function SignaturePad({
  label = "Sign here",
  hint = "Draw your signature using your finger",
  onChange,
  height = 160,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [hasDrawn, setHasDrawn] = useState(false);
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#0f172a";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    setupCanvas();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    // Re-scale if the layout width changes (e.g. rotation) before any drawing.
    const observer = new ResizeObserver(() => {
      if (!hasDrawn) setupCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [setupCanvas, hasDrawn]);

  const pointOf = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDraw = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    lastRef.current = pointOf(event);
  };

  const draw = (event) => {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const ctx = ctxRef.current;
    const point = pointOf(event);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    if (!hasDrawn) setHasDrawn(true);
  };

  const endDraw = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    // Report the signature once the stroke finishes.
    if (hasDrawn || event.type === "pointerup") {
      onChange?.(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange?.(null);
  };

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
          <PenLine size={12} className="text-indigo-500" />
          {label}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasDrawn}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Eraser size={12} />
          Clear
        </button>
      </div>
      <div
        className={`relative rounded-2xl border-2 border-dashed bg-white transition ${
          hasDrawn ? "border-indigo-300" : "border-slate-200"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="block w-full rounded-2xl"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          onPointerCancel={endDraw}
        />
        {!hasDrawn && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-350">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
