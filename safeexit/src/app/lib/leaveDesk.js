"use client";

// One leave desk for every staff dashboard.
//
// A girl's application goes to her caretaker, her hostel's wardens and the chief warden at
// once, and whichever of them acts first decides it. A boy's leave is approved on submit;
// the same three may revoke it until he is Out, and admins see it too. So the caretaker,
// warden, chief warden and admin dashboards all look at the same rows — this hook loads
// them for the signed-in role, and components/staff/StaffLeaveDesk renders them.
//
// The hook lives at page level (not inside the desk) so the dashboards' badges and home
// tiles can read the pending count while the desk itself is not on screen.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { subscribeToStaffEvents } from "./staffEvents";

export const DECIDER_ROLES = ["Caretaker", "Warden", "ChiefWarden"];

// 'Forwarded' only exists on rows filed under the old caretaker-forwards-to-warden flow.
export const UNDECIDED_STATUSES = ["Pending", "Forwarded"];

const initials = (name = "") =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

export const mapLeave = (l) => ({
  id: l._id,
  name: l.student?.name || "Unknown Student",
  roll: l.student?.studentId || "",
  room: [l.student?.hostelName, l.student?.roomNumber].filter(Boolean).join(", ") || "—",
  hostelName: l.student?.hostelName || "",
  roomNumber: l.student?.roomNumber || "",
  department: l.student?.department || "",
  year: l.student?.year || "",
  destination: l.destination || "",
  reason: l.reason || "",
  parentPhone: l.parentPhone || "",
  leaveDate: l.leaveDate,
  returnDate: l.returnDate,
  expectedDepartureTime: l.expectedDepartureTime || "",
  isEmergency: Boolean(l.isEmergency),
  // Present only when a ticket was attached; the bytes come from GET /leave/:id/ticket.
  ticketMime: l.ticketMime || "",
  submittedAt: l.createdAt,
  routedTo: l.targetCaretaker?.name || "",
  hasStudentSignature: Boolean(l.hasStudentSignature),
  hasCaretakerSignature: Boolean(l.hasCaretakerSignature),
  hasWardenSignature: Boolean(l.hasWardenSignature),
  initials: initials(l.student?.name),
  status: l.status || "",
  // The frozen verdict. `status` moves on (Out/Returned/Cancelled/Expired) but this doesn't,
  // so a cancelled-after-approval pass still files under Approved.
  decision: l.decision || (["Approved", "Rejected"].includes(l.status) ? l.status : ""),
  // Set when the pass never played out as decided — "Cancelled" or "Expired".
  lapsed: l.lapsed || (["Cancelled", "Expired"].includes(l.status) ? l.status : ""),
  decidedByName: l.approvedBy?.name || "",
  decidedByRole: l.decidedByRole || l.approvedBy?.role || "",
  remarks: l.remarks || "",
  decidedAt: l.decidedAt || l.updatedAt,
  revokedAt: l.revokedAt || null,
  autoApproved: l.decidedByRole === "System" || Boolean(l.revokedAt),
});

// "14:05" -> "2:05 PM". The stored value is campus time already.
export const formatDepartureTime = (value) => {
  const m = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

export function useLeaveDesk(role) {
  const canDecide = DECIDER_ROLES.includes(role);

  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [boys, setBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingBoys, setLoadingBoys] = useState(true);
  const [error, setError] = useState("");

  const loadPending = useCallback(async () => {
    if (!canDecide) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch("/leave/pending");
      setPending(data.map(mapLeave));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load leave applications.");
    } finally {
      setLoading(false);
    }
  }, [canDecide]);

  // Deciders read the girls' decided record; an admin decides nothing and reads the
  // campus-wide list instead.
  const loadHistory = useCallback(async () => {
    if (!role) return;
    try {
      const data = await apiFetch(canDecide ? "/leave/history" : "/leave/all");
      setHistory(data.map(mapLeave));
    } catch {
      // Best-effort; the history tab just shows its empty state.
    } finally {
      setLoadingHistory(false);
    }
  }, [role, canDecide]);

  const loadBoys = useCallback(async () => {
    if (!role) return;
    try {
      const data = await apiFetch("/leave/auto-approved");
      setBoys(data.map(mapLeave));
    } catch {
      // Best-effort, as above.
    } finally {
      setLoadingBoys(false);
    }
  }, [role]);

  const reload = useCallback(() => {
    loadPending();
    loadHistory();
    loadBoys();
  }, [loadPending, loadHistory, loadBoys]);

  useEffect(() => {
    if (!role) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API, a client-only external source.
    reload();
    // Poll as a safety net in case the SSE connection is silently dropped.
    const interval = setInterval(reload, 30000);
    const unsubscribe = subscribeToStaffEvents({ "leave:changed": reload });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [role, reload]);

  // Each action drops the row from its list at once and reloads after; on failure the
  // reload puts it back. Errors are rethrown so the dialog that asked can show them.
  const approve = useCallback(async (id) => {
    await apiFetch(`/leave/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Approved" }),
    }).finally(reload);
    setPending((rows) => rows.filter((r) => r.id !== id));
  }, [reload]);

  // One tap, no reason asked: the caretaker has usually just spoken to the parent.
  const reject = useCallback(async (id) => {
    await apiFetch(`/leave/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Rejected" }),
    }).finally(reload);
    setPending((rows) => rows.filter((r) => r.id !== id));
  }, [reload]);

  const revoke = useCallback(async (id, remarks) => {
    await apiFetch(`/leave/${id}/revoke`, {
      method: "PATCH",
      body: JSON.stringify({ remarks }),
    }).finally(reload);
  }, [reload]);

  return {
    role,
    canDecide,
    pending,
    history,
    boys,
    loading,
    loadingHistory,
    loadingBoys,
    error,
    setError,
    reload,
    approve,
    reject,
    revoke,
  };
}
