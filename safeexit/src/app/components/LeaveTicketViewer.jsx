"use client";

// The optional travel ticket a student attached to a leave application.
//
// Lists carry only `ticketMime` (so a row knows a ticket exists, and whether it is a PDF);
// the bytes are fetched from GET /leave/:id/ticket when someone opens it. A PDF is shown
// through a blob: URL, which also backs the "Open in new tab" link — that link is a real
// click, so no popup blocker gets in the way.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, Ticket, X } from "lucide-react";
import { apiFetch } from "@/app/lib/api";

const dataUrlToBlobUrl = (dataUrl) => {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
};

export function LeaveTicketButton({ id, ticketMime, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!ticketMime) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100 transition-colors"
        }
      >
        <Ticket className="h-3.5 w-3.5" /> {ticketMime === "application/pdf" ? "Ticket (PDF)" : "Ticket"}
      </button>
      {open && <LeaveTicketViewer id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function LeaveTicketViewer({ id, onClose }) {
  const [state, setState] = useState({ loading: true, error: "", url: "", isPdf: false });

  useEffect(() => {
    let cancelled = false;
    let blobUrl = "";
    apiFetch(`/leave/${id}/ticket`)
      .then(({ ticket }) => {
        if (cancelled) return;
        blobUrl = dataUrlToBlobUrl(ticket);
        setState({ loading: false, error: "", url: blobUrl, isPdf: ticket.startsWith("data:application/pdf") });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message || "Could not load the ticket.", url: "", isPdf: false });
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [id]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="sd-enter relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Ticket className="h-4 w-4 text-sky-600" /> Travel ticket
          </p>
          <div className="flex items-center gap-1">
            {state.url && (
              <a
                href={state.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-64 flex-1 overflow-auto bg-slate-50">
          {state.loading ? (
            <div className="flex h-64 items-center justify-center text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : state.error ? (
            <p className="p-6 text-sm font-semibold text-rose-600">{state.error}</p>
          ) : state.isPdf ? (
            <iframe src={state.url} title="Ticket" className="h-[75dvh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.url} alt="Ticket" className="mx-auto h-auto max-w-full" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
