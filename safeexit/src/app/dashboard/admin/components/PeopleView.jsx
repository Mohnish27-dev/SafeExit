"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  ShieldCheck,
  UserCog,
  UserCheck,
  Crown,
  Search,
  Loader2,
  Mail,
  Phone,
  DoorOpen,
  CircleDot,
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import { HOSTELS, HOSTEL_GENDER_LABEL } from "@/app/lib/hostels";

const TABS = [
  { key: "Student", label: "Students", icon: GraduationCap },
  { key: "Guard", label: "Guards", icon: ShieldCheck },
  { key: "Caretaker", label: "Caretakers", icon: UserCog },
  { key: "Warden", label: "Wardens", icon: UserCheck },
  { key: "ChiefWarden", label: "Chief Warden", icon: Crown },
];


const HOSTEL_ROLES = ["Caretaker", "Warden"];

const ROLE_LABELS = {
  Student: "Student",
  Guard: "Guard",
  Caretaker: "Caretaker",
  Warden: "Warden",
  ChiefWarden: "Chief Warden",
};

const ROLE_PLURALS = {
  Student: "students",
  Guard: "guards",
  Caretaker: "caretakers",
  Warden: "wardens",
  ChiefWarden: "Chief Wardens",
};

const CAMPUS_TONE = {
  Inside: "bg-emerald-100 text-emerald-700",
  Outside: "bg-amber-100 text-amber-700",
  Overdue: "bg-rose-100 text-rose-700",
};

const formatWhen = (iso) =>
  iso ? new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// A caretaker oversees one specific hostel (managedHostel).
// One caretaker account per hostel; taken hostels drop out of the Add/Assign pickers.
const HOSTEL_OPTIONS = HOSTELS.map((h) => ({ value: h.name, label: h.name, gender: h.gender }));

export default function PeopleView() {
  const [role, setRole] = useState("Student");
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/users?role=${role}`);
      setPeople(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.studentId || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q)
    );
  }, [people, search]);

  // Only staff are provisioned here; students self-register.
  const isStaffTab = role === "Guard" || role === "Caretaker" || role === "Warden" || role === "ChiefWarden";
  const isHostelRole = HOSTEL_ROLES.includes(role);


  const takenHostels = useMemo(() => {
    if (!isHostelRole) return new Set();
    return new Set(people.map((p) => p.managedHostel).filter(Boolean));
  }, [isHostelRole, people]);
  const allHostelsTaken = isHostelRole && takenHostels.size >= HOSTEL_OPTIONS.length;

  const chiefWardenExists = role === "ChiefWarden" && people.length > 0;
  const addDisabled = allHostelsTaken || chiefWardenExists;

  // --- Add staff modal ---
  const emptyAddForm = { name: "", staffId: "", pin: "", phoneNumber: "", managedHostel: "" };
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // --- Reset PIN modal ---
  const [resetTarget, setResetTarget] = useState(null); // the staff member, or null
  const [resetPin, setResetPin] = useState("");

  // --- Assign hostel modal (caretaker gender scope) ---
  const [scopeTarget, setScopeTarget] = useState(null); // the caretaker, or null
  const [scopeValue, setScopeValue] = useState("");

  const openAdd = () => {
    setAddForm(emptyAddForm);
    setActionMsg("");
    setShowAdd(true);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    setBusy(true);
    setActionMsg("");
    try {
      await apiFetch("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name,
          staffId: addForm.staffId,
          role, // the currently selected tab: "Guard", "Caretaker", "Warden", or "ChiefWarden"
          pin: addForm.pin,
          phoneNumber: addForm.phoneNumber,

          ...(isHostelRole ? { managedHostel: addForm.managedHostel } : {}),
        }),
      });
      setShowAdd(false);
      await load();
    } catch (err) {
      setActionMsg(err.message || "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  const submitResetPin = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    setActionMsg("");
    try {
      await apiFetch(`/admin/staff/${resetTarget._id}/pin`, {
        method: "PATCH",
        body: JSON.stringify({ pin: resetPin }),
      });
      setResetTarget(null);
      setResetPin("");
      await load();
    } catch (err) {
      setActionMsg(err.message || "Could not reset the PIN.");
    } finally {
      setBusy(false);
    }
  };

  const submitScope = async (e) => {
    e.preventDefault();
    if (!scopeTarget) return;
    setBusy(true);
    setActionMsg("");
    try {
      await apiFetch(`/admin/staff/${scopeTarget._id}/scope`, {
        method: "PATCH",
        body: JSON.stringify({ managedHostel: scopeValue }),
      });
      setScopeTarget(null);
      setScopeValue("");
      await load();
    } catch (err) {
      setActionMsg(err.message || "Could not update the scope.");
    } finally {
      setBusy(false);
    }
  };

  const removePerson = async (person) => {
    if (!window.confirm(`Remove ${person.name}? This permanently deletes their ${ROLE_LABELS[role].toLowerCase()} account.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/admin/staff/${person._id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message || "Could not remove the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">People &amp; Status</h2>
            <p className="text-sm text-slate-600">{visible.length} {ROLE_PLURALS[role]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / id / email"
              className="w-56 rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          {isStaffTab && (
            <button
              onClick={openAdd}
              disabled={addDisabled}
              title={allHostelsTaken ? `Every hostel already has a ${role.toLowerCase()} account.` : chiefWardenExists ? "Only one Chief Warden account is allowed." : undefined}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> Add {ROLE_LABELS[role]}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setRole(t.key); setSearch(""); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
              role === t.key ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading {ROLE_PLURALS[role]}…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">No {ROLE_PLURALS[role]} found</p>
          <p className="text-sm text-slate-400">They will appear here once registered.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <article key={p._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                  {getInitials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">{p.studentId || p.email}</p>
                </div>
                {role === "Student" && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CAMPUS_TONE[p.campusStatus] || CAMPUS_TONE.Inside}`}>
                    {p.campusStatus || "Inside"}
                  </span>
                )}
                {role === "Guard" && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${p.onDuty ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    <CircleDot className="h-3 w-3" /> {p.onDuty ? "On Duty" : "Off Duty"}
                  </span>
                )}
                {role === "Caretaker" && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${p.managedHostel ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.managedHostel || "No hostel"}
                  </span>
                )}
                {role === "Warden" && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${p.managedHostel ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.managedHostel || "No hostel"}
                  </span>
                )}
                {role === "ChiefWarden" && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                    All hostels
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                {(p.department || p.year) && (
                  <p className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-slate-400" />
                    {[p.department, p.year].filter(Boolean).join(" · ")}
                  </p>
                )}
                {(p.hostelName || p.roomNumber) && (
                  <p className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-slate-400" />
                    {[p.hostelName, p.roomNumber && `Room ${p.roomNumber}`].filter(Boolean).join(" · ")}
                  </p>
                )}
                {p.email && (
                  <p className="flex items-center gap-2 truncate">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{p.email}</span>
                  </p>
                )}
                {p.phoneNumber && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" /> {p.phoneNumber}
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                {role === "Student"
                  ? `Last seen ${formatWhen(p.lastSeenAt)}`
                  : `Last active ${formatWhen(p.lastActiveAt)}`}
                {p.webAuthnRegistered && <span className="ml-2 text-emerald-500">· Passkey ✓</span>}
              </div>

              {isHostelRole && (
                <button
                  onClick={() => { setScopeTarget(p); setScopeValue(p.managedHostel || ""); setActionMsg(""); }}
                  disabled={busy}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-50"
                >
                  <UserCog className="h-3.5 w-3.5" /> {p.managedHostel ? "Change hostel" : "Assign hostel"}
                </button>
              )}

              {isStaffTab && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { setResetTarget(p); setResetPin(""); setActionMsg(""); }}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Reset PIN
                  </button>
                  <button
                    onClick={() => removePerson(p)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Add staff modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserPlus className="h-5 w-5 text-indigo-600" /> Add {ROLE_LABELS[role]}
              </h3>
              <button onClick={() => setShowAdd(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Create a {ROLE_LABELS[role].toLowerCase()} account. They sign in on the {ROLE_LABELS[role].toLowerCase()} page with the ID and PIN you set here.
            </p>

            {actionMsg && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{actionMsg}</p>
            )}

            <form onSubmit={submitAdd} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Full Name</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">{ROLE_LABELS[role]} ID</label>
                <input
                  value={addForm.staffId}
                  onChange={(e) => setAddForm((f) => ({ ...f, staffId: e.target.value }))}
                  placeholder={role === "Guard" ? "E.g. GRD001" : role === "ChiefWarden" ? "E.g. CWDN001" : role === "Warden" ? "E.g. WDN001" : "E.g. CTK001"}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  required
                />
              </div>
              {isHostelRole && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Hostel</label>
                  <select
                    value={addForm.managedHostel}
                    onChange={(e) => setAddForm((f) => ({ ...f, managedHostel: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    required
                  >
                    <option value="" disabled>Select hostel…</option>
                    {/* Only hostels without an account of THIS role yet; grouped by boys'/girls'. */}
                    {["Male", "Female"].map((g) => {
                      const opts = HOSTEL_OPTIONS.filter((h) => h.gender === g && !takenHostels.has(h.value));
                      if (opts.length === 0) return null;
                      return (
                        <optgroup key={g} label={HOSTEL_GENDER_LABEL[g]}>
                          {opts.map((h) => (
                            <option key={h.value} value={h.value}>{h.label}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {role === "Warden"
                      ? "Each hostel has one warden login. The warden ranks above the caretaker: they decide the requests the caretaker forwards up, and their decision is final."
                      : "Each hostel has one caretaker login. This account will only see and manage students of the selected hostel."}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Initial PIN</label>
                  <input
                    value={addForm.pin}
                    onChange={(e) => setAddForm((f) => ({ ...f, pin: e.target.value }))}
                    placeholder="Min 4 chars"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Phone (optional)</label>
                  <input
                    value={addForm.phoneNumber}
                    onChange={(e) => setAddForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="10-digit"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Creating…" : `Create ${ROLE_LABELS[role]}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset PIN modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <KeyRound className="h-5 w-5 text-indigo-600" /> Reset PIN
              </h3>
              <button onClick={() => setResetTarget(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Set a new PIN for <span className="font-semibold text-slate-700">{resetTarget.name}</span>. Any existing passkeys are revoked, so they&apos;ll set one up again on next login.
            </p>

            {actionMsg && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{actionMsg}</p>
            )}

            <form onSubmit={submitResetPin} className="mt-4 space-y-3">
              <input
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value)}
                placeholder="New PIN (min 4 chars)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                required
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Resetting…" : "Reset PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign scope modal (caretaker/warden hostel) */}
      {scopeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserCog className="h-5 w-5 text-indigo-600" /> Assign Hostel
              </h3>
              <button onClick={() => setScopeTarget(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Choose which hostel <span className="font-semibold text-slate-700">{scopeTarget.name}</span> oversees.{" "}
              {scopeTarget.role === "Warden"
                ? "They will decide the requests that hostel's caretaker forwards up to them."
                : "They will only see and manage students of that hostel."}
            </p>

            {actionMsg && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{actionMsg}</p>
            )}

            <form onSubmit={submitScope} className="mt-4 space-y-3">
              <select
                value={scopeValue}
                onChange={(e) => setScopeValue(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                required
              >
                <option value="" disabled>Select hostel…</option>
                {["Male", "Female"].map((g) => {
                  const opts = HOSTEL_OPTIONS.filter(
                    (h) => h.gender === g && (!takenHostels.has(h.value) || h.value === scopeTarget.managedHostel)
                  );
                  if (opts.length === 0) return null;
                  return (
                    <optgroup key={g} label={HOSTEL_GENDER_LABEL[g]}>
                      {opts.map((h) => (
                        <option key={h.value} value={h.value}>{h.label}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setScopeTarget(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save hostel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
