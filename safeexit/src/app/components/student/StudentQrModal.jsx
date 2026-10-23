"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Camera, Download, Home, ShieldCheck, Ticket, X } from "lucide-react";
import { defaultStudentProfile } from "@/app/lib/userProfile";
import { QR_PURPOSE, buildIdentityQr } from "@/app/lib/qrPayload.mjs";
import { campusDateKey } from "@/app/lib/leaveRules.mjs";
import { apiFetch } from "@/app/lib/api";

// The student's two permanent QRs. They identify the same student and differ only in what
// the exit is for (lib/qrPayload.mjs): the outing QR always makes an outing, the leave QR
// leaves on a leave approved for that day and is refused at the gate otherwise. Each is
// themed apart, on screen and in the saved image, so a screenshot says which one it is.
const QR_KINDS = {
  [QR_PURPOSE.OUTING]: {
    tab: "Outing QR",
    Icon: Ticket,
    title: "Your Permanent Outing QR",
    blurb: "Show this QR at the main gate when you go out on an outing and when you come back.",
    accent: "#4f46e5",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-100",
    badgeIcon: "text-indigo-500",
    frame: "from-indigo-50/50 to-sky-50/50",
    scanLine: "bg-indigo-500/80 shadow-[0_0_8px_rgba(79,70,229,0.8)]",
    roll: "text-indigo-600",
    download: "border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700",
    tabActive: "bg-indigo-600 text-white shadow",
    footer: "OUTING QR • Outings, entry & exit",
    file: "Outing",
  },
  [QR_PURPOSE.LEAVE]: {
    tab: "Leave QR",
    Icon: Home,
    title: "Your Permanent Leave QR",
    blurb: "Show this QR at the main gate only when you leave for home on an approved leave. It works on your leave date, at any time that day.",
    accent: "#9333ea",
    badge: "bg-purple-50 text-purple-700 border-purple-100",
    badgeIcon: "text-purple-500",
    frame: "from-purple-50/60 to-fuchsia-50/50",
    scanLine: "bg-purple-500/80 shadow-[0_0_8px_rgba(147,51,234,0.8)]",
    roll: "text-purple-600",
    download: "border-purple-200 bg-purple-50/80 hover:bg-purple-100 text-purple-700",
    tabActive: "bg-purple-600 text-white shadow",
    footer: "LEAVE QR • Only on your approved leave date",
    file: "Leave",
  },
};

const formatLeaveDay = (value) =>
  new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// What the leave QR will do at the gate right now, from the student's newest live leave.
// Mirrors resolveExitLeave in backend/src/controllers/scanController.js; the gate decides.
const describeLeave = (leaves) => {
  const live = (Array.isArray(leaves) ? leaves : []).find((l) =>
    ["Approved", "Pending", "Forwarded", "Out"].includes(l.status)
  );
  // Rows come newest first. A boy whose leave staff revoked should hear that, not "no leave".
  const newest = Array.isArray(leaves) ? leaves[0] : null;
  if (!live && newest?.revokedAt) {
    return {
      tone: "slate",
      text: `Your leave for ${formatLeaveDay(newest.leaveDate)} was revoked${newest.remarks ? `: ${newest.remarks}` : ""}. This QR will not work for it.`,
    };
  }
  if (!live) {
    return { tone: "slate", text: "You have no approved leave. Apply for a leave first; this QR only works on the date of an approved leave." };
  }
  const day = formatLeaveDay(live.leaveDate);
  if (live.status === "Out") {
    return { tone: "purple", text: "You are on leave. Show either QR at the gate when you return." };
  }
  if (live.status !== "Approved") {
    return { tone: "amber", text: `Your leave for ${day} is waiting for approval. This QR will work once it is approved.` };
  }
  // A boy's leave is auto-approved with no reviewer, so it reads as received, not approved.
  const state = live.decidedByRole === "System" ? "received" : "approved";
  const leaveDay = campusDateKey(live.leaveDate);
  const today = campusDateKey(new Date());
  if (leaveDay === today) {
    return { tone: "emerald", text: `Your leave is ${state} for today (${day}). Show this QR when you leave for home.` };
  }
  if (leaveDay > today) {
    return { tone: "purple", text: `Your leave is ${state} for ${day}. This QR will work at the gate on that day.` };
  }
  return { tone: "slate", text: `Your leave for ${day} has expired. Apply again for a new date.` };
};

const STATUS_TONES = {
  slate: "bg-slate-50 border-slate-200 text-slate-700",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  purple: "bg-purple-50 border-purple-200 text-purple-800",
};

// The body mounts afresh on every open, so it always lands on the QR the caller asked for
// rather than whichever tab was left open last time.
export default function StudentQrModal({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <StudentQrModalBody {...props} />;
}

function StudentQrModalBody({
  onClose,
  profile = defaultStudentProfile,
  initialPurpose = QR_PURPOSE.OUTING,
}) {
  const [purpose, setPurpose] = useState(initialPurpose);
  const [leaveStatus, setLeaveStatus] = useState(null);
  const qrBoxRef = useRef(null);
  const backdropPressRef = useRef(false);
  const kind = QR_KINDS[purpose] || QR_KINDS[QR_PURPOSE.OUTING];

  useEffect(() => {
    if (purpose !== QR_PURPOSE.LEAVE) return;
    let cancelled = false;
    apiFetch("/leave/myrequests?limit=5")
      .then((rows) => {
        if (!cancelled) setLeaveStatus(describeLeave(rows));
      })
      .catch(() => {
        // The QR itself does not depend on this; only the status line is lost.
        if (!cancelled) setLeaveStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [purpose]);

  const qrRollNo = useMemo(() => {
    const roll = profile.rollNo;
    if (roll && roll !== defaultStudentProfile.rollNo) return roll;
    const id = profile.id;
    if (!id || id === defaultStudentProfile.id || String(id).includes("@")) return "";
    return id;
  }, [profile]);

  // Identity-only, so a replayed screenshot can't smuggle a stale "Approved": the gate
  // looks the leave up every time.
  const qrValue = useMemo(
    () => buildIdentityQr({ id: qrRollNo, sid: profile.sid, name: profile.name }, purpose),
    [qrRollNo, profile.sid, profile.name, purpose]
  );

  const downloadQrPass = () => {
    try {
      const svg = qrBoxRef.current?.querySelector("svg");
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const scale = 2;
      const qrSize = 300;
      const width = qrSize + 80;
      const height = qrSize + 200;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // A thick coloured band with the QR's name, so the two saved images are told apart
      // at a glance in the gallery and at the gate.
      ctx.fillStyle = kind.accent;
      ctx.fillRect(0, 0, width, 34);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(kind.tab.toUpperCase(), width / 2, 23);

      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 40, 50, qrSize, qrSize);

        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = "#0f172a";
        ctx.textAlign = "center";
        ctx.fillText(profile.name || "Student Pass", width / 2, qrSize + 82);

        ctx.font = "bold 14px monospace";
        ctx.fillStyle = kind.accent;
        ctx.fillText(`Roll: ${profile.rollNo || ""}`, width / 2, qrSize + 107);

        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(`${profile.hostel || "NIT Patna"}`, width / 2, qrSize + 129);

        ctx.font = "italic 11px sans-serif";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(kind.footer, width / 2, qrSize + 157);

        const a = document.createElement("a");
        a.download = `SafeExit-${kind.file}-QR-${profile.rollNo || "pass"}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error("Error downloading QR pass:", err);
    }
  };

  // Both the press and the release must land on the overlay itself, so a drag that starts
  // inside the panel and ends over the backdrop isn't mistaken for an outside click.
  return (
    <div
      onPointerDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPressRef.current && e.target === e.currentTarget) onClose();
        backdropPressRef.current = false;
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800"
    >
      <div className="relative my-auto w-full max-w-sm overflow-hidden bg-white rounded-3xl p-6 text-center shadow-2xl border border-slate-100 animate-scale-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mt-2 flex flex-col items-center">
          <div role="tablist" aria-label="Which QR" className="mb-4 grid w-full max-w-[16rem] grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
            {[QR_PURPOSE.OUTING, QR_PURPOSE.LEAVE].map((p) => {
              const { tab, Icon, tabActive } = QR_KINDS[p];
              const active = p === purpose;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPurpose(p)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    active ? tabActive : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab}
                </button>
              );
            })}
          </div>

          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border mb-3 ${kind.badge}`}>
            <ShieldCheck size={12} className={kind.badgeIcon} />
            Active Student Pass
          </span>

          <h2 className="font-sora text-xl font-bold text-slate-800 leading-snug">{kind.title}</h2>
          <p className="text-xs text-slate-500 mt-1 leading-normal max-w-xs mx-auto">{kind.blurb}</p>

          <div className={`relative mt-5 p-5 rounded-3xl bg-gradient-to-br border border-slate-100 shadow-inner flex justify-center items-center ${kind.frame}`}>
            <div ref={qrBoxRef} className="p-4 bg-white rounded-2xl shadow-md border border-slate-100/60 relative overflow-hidden">
              <QRCode value={qrValue} size={190} />
              <div className={`absolute left-0 right-0 h-0.5 animate-scan ${kind.scanLine}`} style={{ top: "50%" }} />
            </div>
          </div>

          {purpose === QR_PURPOSE.LEAVE && leaveStatus && (
            <p className={`mt-4 w-full rounded-2xl border px-3.5 py-2.5 text-left text-xs font-semibold leading-relaxed ${STATUS_TONES[leaveStatus.tone]}`}>
              {leaveStatus.text}
            </p>
          )}

          <div className="mt-4 w-full text-left bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Name</span>
              <span className="text-sm font-bold text-slate-800">{profile.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Roll No</span>
              <span className={`text-sm font-bold font-mono ${kind.roll}`}>{profile.rollNo}</span>
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
                <p className="text-xs font-bold text-amber-950">Save both QRs to your Gallery</p>
                <span className="inline-block rounded-full bg-amber-200/80 px-1.5 py-0.2 text-[9px] font-black text-amber-900 uppercase">
                  Tip
                </span>
              </div>
              <p className="text-[11px] text-amber-900/90 leading-relaxed mt-0.5">
                Save the Outing QR and the Leave QR as two photos. At the gate, show the Outing QR for an outing and the Leave QR only when you are going home on leave.
              </p>
            </div>
          </div>

          <div className="mt-4 w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={downloadQrPass}
              title="Download pass image directly to your device"
              className={`w-full flex items-center justify-center gap-2 rounded-2xl border active:scale-98 py-2.5 text-xs font-bold transition cursor-pointer shadow-xs ${kind.download}`}
            >
              <Download className="h-4 w-4" />
              <span>Download {kind.tab} to Photos</span>
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
