import Link from "next/link";
import { AlertCircle, QrCode } from "lucide-react";

export default function GateQrInstruction({ ready = false, showAction = false, className = "" }) {
  return (
    <div className={`sf-notice ${ready ? "" : "sf-notice--warn"} text-left ${className}`.trim()}>
      {ready ? (
        <QrCode size={15} className="text-indigo-600 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-700">Main-gate instruction:</strong>{" "}
          {ready
            ? "On your leave date (any time that day), open your Student Dashboard, tap “Leave QR,” and show it to security at the main gate. Your Outing QR and college ID card log an outing, not a leave."
            : "Wait for approval. Once approved, on your leave date open your Student Dashboard, tap “Leave QR,” and show it to security at the main gate to leave on your leave."}
        </p>
        {ready && showAction && (
          <Link
            href="/dashboard/student?showQr=leave"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors"
          >
            <QrCode size={13} />
            Open Leave QR
          </Link>
        )}
      </div>
    </div>
  );
}
