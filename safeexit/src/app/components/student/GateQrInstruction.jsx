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
            ? "Open your Student Dashboard, tap “Show QR Code,” and show your permanent student QR to security. Your exit is logged only after it is scanned at the main gate."
            : "Wait for approval. Once approved, open your Student Dashboard, tap “Show QR Code,” and show your permanent student QR to security at the main gate to log your exit."}
        </p>
        {ready && showAction && (
          <Link
            href="/dashboard/student?showQr=1"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors"
          >
            <QrCode size={13} />
            Open Permanent QR
          </Link>
        )}
      </div>
    </div>
  );
}
