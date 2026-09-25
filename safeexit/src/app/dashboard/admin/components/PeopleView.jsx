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
  Pencil,
  Lock,
  Unlock,
  Filter,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { apiFetch, apiFetchWithHeaders } from "@/app/lib/api";
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

// Values must match what registration and the student self-edit form store
// ("1st".."4th", "M.Tech", ...); the backend matches year exactly (case-insensitive),
// so a "3rd Year" filter or promotion would find none of the "3rd" rows.
const ACADEMIC_YEARS = [
  { value: "1st", label: "1st Year" },
  { value: "2nd", label: "2nd Year" },
  { value: "3rd", label: "3rd Year" },
  { value: "4th", label: "4th Year" },
  { value: "5th", label: "5th Year" },
  { value: "M.Tech", label: "M.Tech" },
  { value: "MCA", label: "MCA" },
  { value: "PhD", label: "PhD" },
  { value: "Graduated", label: "Graduated" },
];
const yearLabel = (value) => ACADEMIC_YEARS.find((y) => y.value === value)?.label || value;

const DEPARTMENTS = [
  "CSE",
  "ECE",
  "EE",
  "ME",
  "CE",
  "Architecture",
];

const CAMPUS_STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "Inside", label: "Inside" },
  { value: "Outside", label: "Outside / Overdue" },
];

export default function PeopleView() {
  const [role, setRole] = useState("Student");
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterHostel, setFilterHostel] = useState("ALL");
  const [filterYear, setFilterYear] = useState("ALL");
  const [filterDept, setFilterDept] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [totalCount, setTotalCount] = useState(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // --- Student direct edit modal ---
  const [editStudentTarget, setEditStudentTarget] = useState(null);
  const [editStudentForm, setEditStudentForm] = useState({
    name: "",
    studentId: "",
    department: "",
    year: "",
    roomNumber: "",
    hostelName: "",
    phoneNumber: "",
    guardianPhoneNumber: "",
    email: "",
    profileUnlocked: false,
  });
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [editStudentError, setEditStudentError] = useState("");

  // --- Batch promote modal ---
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    fromYear: "3rd",
    toYear: "4th",
    hostelName: "ALL",
    department: "ALL",
  });
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const [batchError, setBatchError] = useState("");

  // Debounce search input so backend isn't hammered on every keypress
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (role === "Student") {
        if (filterHostel && filterHostel !== "ALL") params.set("hostelName", filterHostel);
        if (filterYear && filterYear !== "ALL") params.set("year", filterYear);
        if (filterDept && filterDept !== "ALL") params.set("department", filterDept);
        if (filterStatus && filterStatus !== "ALL") params.set("campusStatus", filterStatus);
      }
      const { data, headers } = await apiFetchWithHeaders(`/admin/users?${params.toString()}`);
      setPeople(data);
      
      const total = headers.get("X-Total-Count");
      const truncated = headers.get("X-Truncated") === "true";
      setTotalCount(total ? parseInt(total, 10) : null);
      setIsTruncated(truncated);
      
      setError("");
    } catch (err) {
      setError(err.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [role, debouncedSearch, filterHostel, filterYear, filterDept, filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = people;

  const openEditStudent = (student) => {
    setEditStudentTarget(student);
    setEditStudentForm({
      name: student.name || "",
      studentId: student.studentId || "",
      department: student.department || "",
      year: student.year || "",
      roomNumber: student.roomNumber || "",
      hostelName: student.hostelName || "",
      phoneNumber: student.phoneNumber || "",
      guardianPhoneNumber: student.guardianPhoneNumber || "",
      email: student.email || "",
      profileUnlocked: Boolean(student.profileUnlocked),
    });
    setEditStudentError("");
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editStudentTarget) return;
    setEditStudentSaving(true);
    setEditStudentError("");
    try {
      await apiFetch(`/admin/students/${editStudentTarget._id}`, {
        method: "PATCH",
        body: JSON.stringify(editStudentForm),
      });
      setSuccessMsg(`Details updated for ${editStudentForm.name}.`);
      setEditStudentTarget(null);
      await load();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setEditStudentError(err.message || "Failed to update student.");
    } finally {
      setEditStudentSaving(false);
    }
  };

  const toggleStudentUnlock = async (student) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/admin/students/${student._id}/unlock`, {
        method: "PATCH",
        body: JSON.stringify({ unlocked: !student.profileUnlocked }),
      });
      setSuccessMsg(res.message || "Updated student edit status.");
      await load();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to toggle profile unlock.");
    } finally {
      setBusy(false);
    }
  };

  const handleBatchPromote = async (e) => {
    e.preventDefault();
    if (!batchForm.fromYear || !batchForm.toYear) {
      setBatchError("Please select both source and target year.");
      return;
    }
    if (batchForm.fromYear.trim().toLowerCase() === batchForm.toYear.trim().toLowerCase()) {
      setBatchError("Source and target year cannot be identical.");
      return;
    }
    if (!window.confirm(`Promote all ${yearLabel(batchForm.fromYear)} students to ${yearLabel(batchForm.toYear)}? This will update their academic year in the database.`)) {
      return;
    }
    setBatchSaving(true);
    setBatchError("");
    setBatchMsg("");
    try {
      const res = await apiFetch("/admin/students/batch-promote", {
        method: "POST",
        body: JSON.stringify(batchForm),
      });
      setBatchMsg(res.message || `Promoted ${res.count} student(s) successfully!`);
      await load();
      setTimeout(() => {
        setShowBatchModal(false);
        setBatchMsg("");
      }, 2500);
    } catch (err) {
      setBatchError(err.message || "Batch promotion failed.");
    } finally {
      setBatchSaving(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setFilterHostel("ALL");
    setFilterYear("ALL");
    setFilterDept("ALL");
    setFilterStatus("ALL");
  };

  const hasActiveFilters = search || filterHostel !== "ALL" || filterYear !== "ALL" || filterDept !== "ALL" || filterStatus !== "ALL";

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
    <section className="space-y-4 sm:space-y-5">
      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur sm:rounded-3xl sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 sm:h-12 sm:w-12 sm:rounded-2xl">
              <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">People &amp; Status</h2>
              <p className="text-xs text-slate-600 sm:text-sm">
                {isTruncated 
                  ? (search ? `Showing ${visible.length} matches in newest ${people.length} of ${totalCount}` : `Showing newest ${people.length} of ${totalCount}`)
                  : (search || hasActiveFilters ? `Showing ${visible.length} filtered results` : `Total ${totalCount ?? visible.length}`)} {ROLE_PLURALS[role]}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={role === "Student" ? "Search name / roll / email / room / phone..." : "Search name / id / email..."}
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none sm:w-64"
              />
            </div>
            {role === "Student" && (
              <button
                onClick={() => {
                  setShowBatchModal(true);
                  setBatchMsg("");
                  setBatchError("");
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:brightness-110 cursor-pointer"
              >
                <GraduationCap className="h-4 w-4" /> Batch Promote Year
              </button>
            )}
            {isStaffTab && (
              <button
                onClick={openAdd}
                disabled={addDisabled}
                title={allHostelsTaken ? `Every hostel already has a ${role.toLowerCase()} account.` : chiefWardenExists ? "Only one Chief Warden account is allowed." : undefined}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <UserPlus className="h-4 w-4" /> Add {ROLE_LABELS[role]}
              </button>
            )}
          </div>
        </div>

        {/* Extended filters row for Students */}
        {role === "Student" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 font-semibold shrink-0">
              <Filter className="h-3.5 w-3.5 text-indigo-500" /> Filters:
            </div>
            {/* Hostel filter */}
            <select
              value={filterHostel}
              onChange={(e) => setFilterHostel(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 focus:border-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Hostels</option>
              {HOSTELS.map((h) => (
                <option key={h.name} value={h.name}>{h.name}</option>
              ))}
            </select>

            {/* Year filter */}
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 focus:border-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Years</option>
              {ACADEMIC_YEARS.map((y) => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </select>

            {/* Department filter */}
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 focus:border-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Depts</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Campus Status filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 focus:border-indigo-400 focus:outline-none cursor-pointer"
            >
              {CAMPUS_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setRole(t.key); setSearch(""); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
              role === t.key ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading {ROLE_PLURALS[role]}…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">No {ROLE_PLURALS[role]} found</p>
          <p className="text-sm text-slate-400">
            {hasActiveFilters ? "Try clearing filters or search term to see more results." : "They will appear here once registered."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visible.map((p) => (
            <article key={p._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                  {getInitials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">{p.studentId || p.email}</p>
                </div>
                {role === "Student" && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CAMPUS_TONE[p.campusStatus] || CAMPUS_TONE.Inside}`}>
                      {p.campusStatus || "Inside"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      p.profileUnlocked ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"
                    }`}>
                      {p.profileUnlocked ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {p.profileUnlocked ? "Unlocked" : "Locked"}
                    </span>
                  </div>
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
                    <GraduationCap className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{[p.department, p.year].filter(Boolean).join(" · ")}</span>
                  </p>
                )}
                {(p.hostelName || p.roomNumber) && (
                  <p className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{[p.hostelName, p.roomNumber && `Room ${p.roomNumber}`].filter(Boolean).join(" · ")}</span>
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
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" /> {p.phoneNumber}
                  </p>
                )}
                {p.guardianPhoneNumber && (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone className="h-4 w-4 shrink-0 text-indigo-400" />
                    <span className="truncate">Parent: {p.guardianPhoneNumber}</span>
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                {role === "Student"
                  ? `Last seen ${formatWhen(p.lastSeenAt)}`
                  : `Last active ${formatWhen(p.lastActiveAt)}`}
                {p.webAuthnRegistered && <span className="ml-2 text-emerald-500">· Passkey ✓</span>}
              </div>

              {role === "Student" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openEditStudent(p)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => toggleStudentUnlock(p)}
                    disabled={busy}
                    title={p.profileUnlocked ? "Lock profile editing" : "Unlock profile to allow student self-edit"}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 cursor-pointer ${
                      p.profileUnlocked
                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p.profileUnlocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {p.profileUnlocked ? "Lock" : "Unlock"}
                  </button>
                </div>
              )}

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
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
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

              <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
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
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
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
      {/* Edit Student Modal */}
      {editStudentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Pencil className="h-5 w-5 text-indigo-600" /> Edit Student Details
              </h3>
              <button onClick={() => setEditStudentTarget(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Update official academic, hostel, and contact details for <span className="font-semibold text-slate-800">{editStudentTarget.name}</span>.
            </p>

            {editStudentError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{editStudentError}</p>
            )}

            <form onSubmit={handleSaveStudentEdit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Full Name</label>
                  <input
                    value={editStudentForm.name}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Roll Number (Student ID)</label>
                  <input
                    value={editStudentForm.studentId}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, studentId: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Academic Year</label>
                  <select
                    value={editStudentForm.year}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, year: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="">Select Year...</option>
                    {ACADEMIC_YEARS.map((y) => (
                      <option key={y.value} value={y.value}>{y.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Department / Branch</label>
                  <input
                    value={editStudentForm.department}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="E.g. CSE, ECE, ME"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Hostel</label>
                  <select
                    value={editStudentForm.hostelName}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, hostelName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="">Select Hostel...</option>
                    {["Male", "Female"].map((g) => (
                      <optgroup key={g} label={HOSTEL_GENDER_LABEL[g]}>
                        {HOSTEL_OPTIONS.filter((h) => h.gender === g).map((h) => (
                          <option key={h.value} value={h.value}>{h.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Room Number</label>
                  <input
                    value={editStudentForm.roomNumber}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, roomNumber: e.target.value }))}
                    placeholder="E.g. 214"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Student Mobile</label>
                  <input
                    value={editStudentForm.phoneNumber}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    placeholder="10-digit number"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Parent / Guardian Mobile</label>
                  <input
                    value={editStudentForm.guardianPhoneNumber}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, guardianPhoneNumber: e.target.value }))}
                    placeholder="10-digit emergency contact"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Email Address</label>
                <input
                  type="email"
                  value={editStudentForm.email}
                  onChange={(e) => setEditStudentForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Profile Unlocked toggle */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="block text-xs font-bold text-slate-900">Unlock Profile for Self-Edit</span>
                    <span className="block text-[11px] text-slate-500">Allow this student to update their details once from their own dashboard.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editStudentForm.profileUnlocked}
                    onChange={(e) => setEditStudentForm((f) => ({ ...f, profileUnlocked: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditStudentTarget(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editStudentSaving}
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
                >
                  {editStudentSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Promotion Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <GraduationCap className="h-5 w-5 text-emerald-600" /> Batch Academic Promotion
              </h3>
              <button onClick={() => setShowBatchModal(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Promote an entire student cohort to the next year level at the start of a semester or academic year.
            </p>

            {batchError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{batchError}</p>
            )}
            {batchMsg && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{batchMsg}</p>
            )}

            {/* Quick preset buttons */}
            <div className="mt-3">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quick Presets:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { from: "1st", to: "2nd" },
                  { from: "2nd", to: "3rd" },
                  { from: "3rd", to: "4th" },
                  { from: "4th", to: "Graduated" },
                ].map((p) => (
                  <button
                    key={p.from}
                    type="button"
                    onClick={() => setBatchForm((f) => ({ ...f, fromYear: p.from, toYear: p.to }))}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition text-left cursor-pointer ${
                      batchForm.fromYear === p.from && batchForm.toYear === p.to
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    {yearLabel(p.from)} &rarr; {yearLabel(p.to)}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleBatchPromote} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">From Year</label>
                  <select
                    value={batchForm.fromYear}
                    onChange={(e) => setBatchForm((f) => ({ ...f, fromYear: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:bg-white focus:outline-none cursor-pointer"
                    required
                  >
                    {ACADEMIC_YEARS.map((y) => (
                      <option key={y.value} value={y.value}>{y.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">To Year</label>
                  <select
                    value={batchForm.toYear}
                    onChange={(e) => setBatchForm((f) => ({ ...f, toYear: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:bg-white focus:outline-none cursor-pointer"
                    required
                  >
                    {ACADEMIC_YEARS.map((y) => (
                      <option key={y.value} value={y.value}>{y.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Scope by Hostel (Optional)</label>
                <select
                  value={batchForm.hostelName}
                  onChange={(e) => setBatchForm((f) => ({ ...f, hostelName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Hostels (Campus-wide)</option>
                  {HOSTELS.map((h) => (
                    <option key={h.name} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Scope by Department (Optional)</label>
                <select
                  value={batchForm.department}
                  onChange={(e) => setBatchForm((f) => ({ ...f, department: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={batchSaving}
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
                >
                  {batchSaving ? "Promoting…" : "Promote Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
