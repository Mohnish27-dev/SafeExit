"use client";

import { useMemo } from "react";
import QRCode from "react-qr-code";
import { Camera, Download, ShieldCheck, X } from "lucide-react";
import { defaultStudentProfile } from "@/app/lib/userProfile";

export default function StudentQrModal({ isOpen, onClose, profile = defaultStudentProfile }) {
  const qrRollNo = useMemo(() => {
    const roll = profile.rollNo;
    if (roll && roll !== defaultStudentProfile.rollNo) return roll;
    const id = profile.id;
    if (!id || id === defaultStudentProfile.id || String(id).includes("@")) return "";
    return id;
  }, [profile]);

  const qrValue = useMemo(() => {
    const data = {
      id: qrRollNo,
      sid: profile.sid || undefined,
      name: profile.name,
    };
    return JSON.stringify(data);
  }, [qrRollNo, profile.sid, profile.name]);

  const downloadQrPass = () => {
    try {
      const svg = document.querySelector("#student-gate-qr-modal-reusable svg");
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const scale = 2;
      const qrSize = 300;
      canvas.width = (qrSize + 80) * scale;
      canvas.height = (qrSize + 170) * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, qrSize + 80, qrSize + 170);

      ctx.fillStyle = "#4f46e5";
      ctx.fillRect(0, 0, qrSize + 80, 8);

      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 40, 25, qrSize, qrSize);

        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = "#0f172a";
        ctx.textAlign = "center";
        ctx.fillText(profile.name || "Student Pass", (qrSize + 80) / 2, qrSize + 55);

        ctx.font = "bold 14px monospace";
        ctx.fillStyle = "#4f46e5";
        ctx.fillText(`Roll: ${profile.rollNo || ""}`, (qrSize + 80) / 2, qrSize + 80);

        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(`${profile.hostel || "NIT Patna"}`, (qrSize + 80) / 2, qrSize + 102);

        ctx.font = "italic 11px sans-serif";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("Permanent Gate Pass • Valid for Entry & Exit", (qrSize + 80) / 2, qrSize + 130);

        const a = document.createElement("a");
        a.download = `SafeExit-QR-${profile.rollNo || "pass"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error("Error downloading QR pass:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden bg-white rounded-3xl p-6 text-center shadow-2xl border border-slate-100 animate-scale-in"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mt-2 flex flex-col items-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-100 mb-3 animate-pulse">
            <ShieldCheck size={12} className="text-indigo-500" />
            Active Student Pass
          </span>

          <h2 className="font-sora text-xl font-bold text-slate-800 leading-snug">Your Permanent Student QR</h2>
          <p className="text-xs text-slate-500 mt-1 leading-normal max-w-xs mx-auto">
            Show this QR to security at the campus main gate for entry or exit.
          </p>

          <div className="relative mt-5 p-5 rounded-3xl bg-gradient-to-br from-indigo-50/50 to-sky-50/50 border border-slate-100 shadow-inner flex justify-center items-center">
            <div id="student-gate-qr-modal-reusable" className="p-4 bg-white rounded-2xl shadow-md border border-slate-100/60 relative overflow-hidden">
              <QRCode value={qrValue} size={190} />
              <div className="absolute left-0 right-0 h-0.5 bg-indigo-500/80 shadow-[0_0_8px_rgba(79,70,229,0.8)] animate-scan" style={{ top: "50%" }} />
            </div>
          </div>

          <div className="mt-4 w-full text-left bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Name</span>
              <span className="text-sm font-bold text-slate-800">{profile.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Roll No</span>
              <span className="text-sm font-bold text-indigo-600 font-mono">{profile.rollNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hostel</span>
              <span className="text-sm font-bold text-slate-700 truncate max-w-[180px]">{profile.hostel}</span>
            </div>
          </div>

          {/* Screenshot / Gallery Convenience Tip */}
          <div className="mt-3.5 w-full flex items-start gap-2.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 p-3 text-left shadow-xs">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm mt-0.5">
              <Camera className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-amber-950">Save to Gallery for Quick Access</p>
                <span className="inline-block rounded-full bg-amber-200/80 px-1.5 py-0.2 text-[9px] font-black text-amber-900 uppercase">
                  Tip
                </span>
              </div>
              <p className="text-[11px] text-amber-900/90 leading-relaxed mt-0.5">
                Take a screenshot of this QR pass to save it in your photo gallery. You can show the photo directly to the guard at the gate without opening the app every time!
              </p>
            </div>
          </div>

          <div className="mt-4 w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={downloadQrPass}
              title="Download pass image directly to your device"
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 active:scale-98 py-2.5 text-xs font-bold text-indigo-700 transition cursor-pointer shadow-xs"
            >
              <Download className="h-4 w-4" />
              <span>Download / Save Pass to Photos</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sf-btn-primary py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Close Pass
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
