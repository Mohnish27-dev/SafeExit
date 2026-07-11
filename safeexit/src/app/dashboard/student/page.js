"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  Bell,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Home,
  House,
  IdCard,
  ImageIcon,
  Loader2,
  MessageSquareWarning,
  QrCode,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  Ticket,
  UserRound,
  Mail,
  Phone,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  buildSlug,
  defaultStudentProfile,
  getFirstName,
  getInitials,
  getStoredUser,
  normalizeStudentProfile,
  setStoredUser,
} from "@/app/lib/userProfile";
import { getTimeGreeting } from "@/app/lib/greeting";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

// Format a stored Date/ISO string as e.g. "05:30 PM". Used by the pass/timeline
// cards below. (The QR itself no longer carries any formatted window — it's
// identity-only; the gate reads the live window from the backend at scan time.)
const formatClock = (value) =>
  new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

// Downscale + re-encode a photo before it touches storage/network — the same
// treatment the registration flow gives the very first photo, so a re-upload
// years later doesn't suddenly blow past the localStorage quota.
const compressImage = (dataUrl, maxWidth = 800, quality = 0.7) =>
  new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new window.Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const width = Math.min(img.width, maxWidth);
      const height = Math.round(width / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

// The crop tool always displays the source image at "cover" scale for the
// current zoom, centered in a square viewport of this size — so the pan-offset
// math below only ever has to account for one degree of freedom (zoom * pan),
// never the fit-to-frame scale.
const CROP_FRAME = 260;

const cropCoverScale = (natural, zoom) =>
  Math.max(CROP_FRAME / natural.width, CROP_FRAME / natural.height) * zoom;

const clampCropOffset = (offset, natural, zoom) => {
  const scale = cropCoverScale(natural, zoom);
  const maxX = Math.max(0, (natural.width * scale - CROP_FRAME) / 2);
  const maxY = Math.max(0, (natural.height * scale - CROP_FRAME) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
};

const outingStatusStyle = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "approved":
    case "out":
      return "bg-emerald-100 text-emerald-700";
    case "returned":
      return "bg-slate-100 text-slate-600";
    case "rejected":
    case "expired":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-amber-100 text-amber-700"; // Pending
  }
};

const actions = [
  {
    title: "Generate Outing Ticket",
    description: "Create a new request and get your digital pass.",
    icon: Ticket,
    iconClass: "sd-action-icon sd-action-icon--ticket",
    arrow: "text-indigo-400",
    href: "/dashboard/student/generate-ticket",
  },
  {
    title: "My Outings",
    description: "View upcoming and past outing history.",
    icon: ClipboardList,
    iconClass: "sd-action-icon sd-action-icon--outings",
    arrow: "text-sky-400",
    href: "/dashboard/student/my-outings",
  },
  {
    title: "SOS Alert",
    description: "Instant emergency alert to warden & security.",
    icon: Siren,
    iconClass: "sd-action-icon sd-action-icon--sos",
    arrow: "text-rose-500",
    href: "/dashboard/student/sos",
  },
  {
    title: "Register Complaint",
    description: "Report a maintenance, safety, or hostel issue.",
    icon: MessageSquareWarning,
    iconClass: "sd-action-icon sd-action-icon--complaint",
    arrow: "text-orange-400",
    href: "/dashboard/student/complaint",
  },
  {
    title: "Leave Application",
    description: "Apply for festival or multi-day home leave.",
    icon: CalendarDays,
    iconClass: "sd-action-icon sd-action-icon--leave",
    arrow: "text-violet-400",
    href: "/dashboard/student/leave-application",
  },
];

const navItems = [
  { label: "Home", icon: Home, href: "/dashboard/student", active: true },
  { label: "Outings", icon: ClipboardList, href: "/dashboard/student/my-outings" },
  { label: "New Pass", icon: Ticket, href: "/dashboard/student/generate-ticket" },
  { label: "SOS", icon: Siren, href: "/dashboard/student/sos" },
  { label: "Complaints", icon: MessageSquareWarning, href: "/dashboard/student/complaint" },
  { label: "Leave", icon: CalendarDays, href: "/dashboard/student/leave-application" },
];

export default function StudentDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const [profile, setProfile] = useState(defaultStudentProfile);
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [outings, setOutings] = useState([]);
  const [outingsLoading, setOutingsLoading] = useState(true);

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoDraft, setPhotoDraft] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);

  // One-time backfill prompt for accounts created before `gender` existed —
  // needed so the Leave Application's 5:30 PM girls' curfew has something to
  // check. Dismissing only hides it for this tab session; it reappears next
  // login until the student actually sets a gender.
  const [genderDismissed, setGenderDismissed] = useState(false);
  const [genderDraft, setGenderDraft] = useState("");
  const [savingGender, setSavingGender] = useState(false);
  const [genderError, setGenderError] = useState("");

  // Crop step: the raw just-picked image awaits cropping before it ever
  // becomes `photoDraft`. Pan/zoom are plain pixel offsets in frame-space.
  const [cropSrc, setCropSrc] = useState(null);
  const [cropNatural, setCropNatural] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef(null);

  useEffect(() => {
    const storedProfile = getStoredUser();
    if (storedProfile?.name) {
      const normalized = normalizeStudentProfile(storedProfile);
      if (normalized.subtitle !== storedProfile.subtitle) {
        setStoredUser(normalized);
      }
      setProfile(normalized);

      // Publish this student's photo (keyed by roll number) so the guard's QR
      // scanner can show it. Done on every dashboard visit so it stays available
      // even after the server-side store is reset. The QR encodes the same
      // roll number as `id`, which is what the scanner looks up.
      if (normalized.photo && normalized.rollNo) {
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rollNo: normalized.rollNo,
            name: normalized.name,
            photo: normalized.photo,
          }),
        }).catch((err) => console.error("Failed to publish profile photo", err));
      }
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pull the real registered studentId from the backend so the QR always carries
  // the exact roll number the gate scanner looks up (localStorage can be stale).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch("/auth/profile");
        if (cancelled || !me?.studentId) return;
        // Carry both the roll number and the immutable Mongo _id: the gate scanner
        // resolves by _id first, so a stale/whitespace roll number can't 404.
        setProfile((prev) => ({ ...prev, rollNo: me.studentId, sid: me._id }));
      } catch {
        /* Not authenticated on the server yet — keep the locally stored profile. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load this student's real outing requests. The latest approved one drives the
  // QR pass; the full list drives the Recent Outings, stats and timeline cards.
  useEffect(() => {
    let cancelled = false;

    // background=true suppresses the loading state so the poll / focus refetch
    // updates statuses silently without flickering the "Loading…" placeholders.
    const loadOutings = async (background = false) => {
      if (!background) setOutingsLoading(true);
      try {
        const data = await apiFetch("/outing/myrequests");
        if (cancelled) return;
        const mapped = (data || []).map((o) => ({
          id: o._id,
          place: o.destination,
          purpose: o.purpose,
          status: o.status || "Pending",
          outTime: o.outTime,
          inTime: o.inTime,
          date: new Date(o.outTime).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
          time: formatClock(o.outTime),
        }));
        setOutings(mapped);
      } catch {
        if (!cancelled && !background) setOutings([]);
      } finally {
        if (!cancelled) setOutingsLoading(false);
      }
    };

    loadOutings();

    // The guard's gate entry scan flips the active pass to "Returned" server-side.
    // Poll and refetch on tab focus so the dashboard reflects it without a reload.
    const interval = setInterval(() => loadOutings(true), 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadOutings(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const greetingName = useMemo(() => {
    const firstName = getFirstName(profile.name);
    return firstName || profile.name;
  }, [profile.name]);

  const timeGreeting = useMemo(() => getTimeGreeting(now), [now]);

  // The pass represents the student's currently active, warden-approved outing.
  // `myrequests` is returned newest-first, so the first Approved/Out request wins.
  const latestApproved = useMemo(
    () => outings.find((o) => ["Approved", "Out"].includes(o.status)) || null,
    [outings]
  );

  const qrRollNo = useMemo(() => {
    const roll = profile.rollNo && profile.rollNo !== defaultStudentProfile.rollNo ? profile.rollNo : "";
    if (roll) return roll;
    // Last resort: a non-email id is the roll number too; never a fabricated value
    // and never the "—" placeholder (which the scanner can't resolve → 404).
    const id = profile.id;
    if (!id || id === defaultStudentProfile.id || String(id).includes("@")) return "";
    return id;
  }, [profile]);

  // Identity-only QR: it carries WHO the student is, never any outing status.
  // Because it holds no per-trip data, its value never changes between outings —
  // the student can screenshot it once and reuse it forever. The gate resolves
  // the student's *current* approved pass live at scan time (see /scan/preview
  // and POST /scan on the backend), so a replayed screenshot can't smuggle a
  // stale "Approved" status past the guard — there is nothing to replay.
  const qrValue = useMemo(() => {
    const data = {
      id: qrRollNo,
      // Immutable Mongo _id; the gate scanner resolves by this first when present.
      sid: profile.sid || undefined,
      name: profile.name,
    };
    return JSON.stringify(data);
  }, [qrRollNo, profile.sid, profile.name]);

  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    [now]
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now]
  );

  const stats = useMemo(() => {
    const approvedCount = outings.filter((o) =>
      ["Approved", "Out", "Returned"].includes(o.status)
    ).length;
    const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "0%");
    return [
      {
        label: "Total outings",
        value: String(outings.length),
        width: outings.length ? "100%" : "6%",
        tone: "from-cyan-500 via-sky-400/30 to-transparent",
      },
      {
        label: "Approved",
        value: String(approvedCount),
        width: pct(approvedCount, outings.length || 1),
        tone: "from-emerald-500 via-emerald-400/30 to-transparent",
      },
      {
        label: "Next return by",
        value: latestApproved ? formatClock(latestApproved.inTime) : "—",
        width: latestApproved ? "80%" : "6%",
        tone: "from-indigo-500 via-violet-400/30 to-transparent",
      },
    ];
  }, [outings, latestApproved]);

  const timeline = useMemo(() => {
    if (!latestApproved) return [];
    return [
      {
        title: "Outing approved",
        meta: `${latestApproved.place} · ${formatClock(latestApproved.outTime)}`,
        tone: "bg-emerald-100 text-emerald-700",
      },
      {
        title: "Return due",
        meta: `By ${formatClock(latestApproved.inTime)}`,
        tone: "bg-amber-100 text-amber-700",
      },
    ];
  }, [latestApproved]);

  const handleLogout = () => logout(router, { role: "student" });

  const openPhotoModal = () => {
    setPhotoDraft(profile.photo || null);
    setPhotoError("");
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    if (savingPhoto) return;
    setShowPhotoModal(false);
    setPhotoDraft(null);
    setPhotoError("");
    setCropSrc(null);
    setCropNatural(null);
  };

  const handlePhotoFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        setCropNatural({ width: img.width, height: img.height });
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
        setCropSrc(reader.result);
      };
      img.onerror = () => setPhotoError("Couldn't read that image. Please try a different photo.");
      img.src = reader.result;
    };
    reader.onerror = () => setPhotoError("Couldn't read that file. Please try a different photo.");
    reader.readAsDataURL(file);
  };

  const handleCropZoomChange = (value) => {
    const zoom = Number(value);
    setCropZoom(zoom);
    setCropOffset((prev) => (cropNatural ? clampCropOffset(prev, cropNatural, zoom) : prev));
  };

  const handleCropPointerDown = (e) => {
    if (!cropNatural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDragRef.current = { startX: e.clientX, startY: e.clientY, origin: cropOffset };
  };

  const handleCropPointerMove = (e) => {
    if (!cropDragRef.current || !cropNatural) return;
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    const next = {
      x: cropDragRef.current.origin.x + dx,
      y: cropDragRef.current.origin.y + dy,
    };
    setCropOffset(clampCropOffset(next, cropNatural, cropZoom));
  };

  const handleCropPointerUp = (e) => {
    cropDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer capture may already be released */
    }
  };

  const handleCancelCrop = () => {
    setCropSrc(null);
    setCropNatural(null);
  };

  const handleConfirmCrop = () => {
    if (!cropSrc || !cropNatural) return;
    const img = new window.Image();
    img.onload = () => {
      const scale = cropCoverScale(cropNatural, cropZoom);
      const sourceSize = CROP_FRAME / scale;
      const sx = cropNatural.width / 2 - cropOffset.x / scale - sourceSize / 2;
      const sy = cropNatural.height / 2 - cropOffset.y / scale - sourceSize / 2;
      const OUTPUT = 480;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      canvas.getContext("2d").drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
      setPhotoDraft(canvas.toDataURL("image/jpeg", 0.9));
      setCropSrc(null);
      setCropNatural(null);
    };
    img.src = cropSrc;
  };

  const handleSavePhoto = async () => {
    if (!photoDraft || photoDraft === profile.photo) return;
    setSavingPhoto(true);
    setPhotoError("");
    try {
      const compressed = await compressImage(photoDraft, 800, 0.7);
      const nextPhoto = compressed || photoDraft;
      const updatedProfile = { ...profile, photo: nextPhoto };
      setProfile(updatedProfile);
      setStoredUser(updatedProfile);

      // Keep the on-device onboarding blob in sync too, so quick-login re-auth
      // and any local fallback carry the latest photo forward.
      try {
        const existing = JSON.parse(localStorage.getItem("safeexit_user_profile") || "null") || {};
        localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...existing, photo: nextPhoto }));
      } catch {
        /* best-effort — device storage may be full or unavailable */
      }

      // Republish to the same store the guard's QR scanner reads from, keyed
      // by roll number, so the new photo shows up at the gate immediately.
      if (updatedProfile.rollNo && updatedProfile.rollNo !== defaultStudentProfile.rollNo) {
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rollNo: updatedProfile.rollNo,
            name: updatedProfile.name,
            photo: nextPhoto,
          }),
        }).catch((err) => console.error("Failed to publish profile photo", err));
      }

      setShowPhotoModal(false);
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError("Couldn't process that image. Please try a different photo.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleSaveGender = async () => {
    if (!genderDraft) {
      setGenderError("Please select a gender.");
      return;
    }
    setSavingGender(true);
    setGenderError("");
    try {
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ gender: genderDraft }),
      });
      const merged = { ...getStoredUser(), gender: updated.gender };
      setStoredUser(merged);
      setProfile((prev) => ({ ...prev, gender: updated.gender }));
    } catch (err) {
      setGenderError(err?.message || "Couldn't save your gender. Please try again.");
    } finally {
      setSavingGender(false);
    }
  };

  // Don't render the protected dashboard until the session check passes; the
  // hook redirects to /login/student when there's no valid student session.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen student-dashboard-luxe text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-luxe-orb sd-luxe-orb-one" />
        <div className="sd-luxe-orb sd-luxe-orb-two" />
        <div className="sd-luxe-orb sd-luxe-orb-three" />
        <div className="sd-luxe-wave" />
        <div className="sd-luxe-streaks" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-luxe-rise flex flex-wrap items-center justify-between gap-4 rounded-4xl px-5 py-4 sm:px-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <p className="sd-eyebrow flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Personal Hub
                </p>
                <h1 className="sd-title sd-reveal sd-stagger-1">
                  <span className="sd-gradient-text">Student Dashboard</span>
                </h1>
                <p className="sd-subtitle">SafeExit Passport</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px]">
                <div className="relative shrink-0 group">
                  <div className="sd-profile-avatar overflow-hidden">
                    {mounted && profile.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.photo} alt={profile.name} className="h-full w-full object-cover" />
                    ) : (
                      mounted ? getInitials(profile.name) : "?"
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openPhotoModal}
                    title="Change profile photo"
                    className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-indigo-600 shadow-md ring-2 ring-white transition-transform group-hover:scale-110 cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span className="sr-only">Change profile photo</span>
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900  gap-2 text-base">{profile.name}</p>
                  <p className="text-sm text-slate-500">{profile.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Log out</span>
              </button>
            </div>
          </header>

          {mounted && !profile.gender && !genderDismissed && (
            <section className="sd-luxe-panel sd-luxe-rise mt-6 rounded-4xl p-5 sm:p-6 shadow-xl border border-indigo-100">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <UserRound className="h-5.5 w-5.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="sd-card-title text-slate-900 text-base">Complete your profile</p>
                    <p className="sd-micro mt-0.5">
                      Add your gender so Leave Applications can apply the right rules for you.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={genderDraft}
                    onChange={(e) => {
                      setGenderDraft(e.target.value);
                      setGenderError("");
                    }}
                    disabled={savingGender}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors disabled:opacity-50"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveGender}
                    disabled={savingGender || !genderDraft}
                    className="sf-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingGender ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenderDismissed(true)}
                    disabled={savingGender}
                    title="Dismiss"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {genderError && <p className="text-xs text-rose-500 mt-3">{genderError}</p>}
            </section>
          )}

          <section className="sd-luxe-panel sd-luxe-rise sd-stagger-2 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="sd-luxe-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg">
                  <Clock3 className="h-10 w-10 text-indigo-600" />
                </div>
                <div>
                  <p className="sd-eyebrow">Daily Pulse</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2">
                    {timeGreeting},{" "}
                    <span className="sd-gradient-text">{greetingName}</span>.
                  </h2>
                  <p className="sd-body mt-2 max-w-md">
                    Your SafeExit pass is active. Tap a quick action below to manage outings or send an alert.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <CalendarDays className="h-5 w-5 text-indigo-500" />
                  {mounted ? formattedDate : "Loading..."}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <Clock3 className="h-5 w-5 text-sky-500" />
                  {mounted ? formattedTime : "Loading..."}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">Live</span>
                </span>
              </div>
            </div>
          </section>

          <section className="sd-luxe-panel sd-luxe-rise sd-stagger-3 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sd-eyebrow">Quick Actions</p>
                <h2 className="sd-title sd-title-sm">Everything at a glance</h2>
              </div>
              <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-bold animate-pulse">Updated</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {actions.map((action, index) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="sd-luxe-card sd-action-card sd-luxe-shimmer sd-luxe-rise group flex min-h-[17rem] flex-col items-center justify-between rounded-4xl p-6 text-center"
                  style={{ animationDelay: `${0.08 + index * 0.08}s` }}
                >
                  <span className={action.iconClass}>
                    <action.icon className="h-11 w-11 transition-transform duration-300 group-hover:scale-110" />
                  </span>
                  <span>
                    <span className="sd-card-title block text-lg">{action.title}</span>
                    <span className="sd-body mt-3 block text-[0.95rem] leading-relaxed">
                      {action.description}
                    </span>
                  </span>
                  <ChevronRight
                    className={`h-9 w-9 transition-all duration-300 group-hover:translate-x-2 ${action.arrow}`}
                  />
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-6 sm:p-7 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">Your SafeExit Pass</h2>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Valid
                </span>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
                <div 
                  onClick={() => setShowQrModal(true)}
                  className="sd-luxe-card sd-qr-glow sd-luxe-tilt flex items-center justify-center rounded-3xl p-5 bg-white cursor-pointer group/qr"
                >
                  <QRCode value={qrValue} className="h-full w-full max-w-[220px] transition-transform duration-300 group-hover/qr:scale-102" />
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="sd-title sd-title-md">
                    <span className="sd-gradient-text">{profile.name}</span>
                  </h3>
                  <div className="sd-body mt-4 space-y-3 text-[0.95rem]">
                    <p className="flex items-center gap-3 font-semibold text-slate-700">
                      <IdCard className="h-5 w-5 text-indigo-500 shrink-0" /> 
                      <span>Roll No: <strong className="text-slate-900">{profile.rollNo}</strong></span>
                    </p>
                    <p className="flex items-center gap-3 font-semibold text-slate-700">
                      <Mail className="h-5 w-5 text-sky-500 shrink-0" /> 
                      <span>Email: <strong className="text-slate-900">{profile.email || (profile.id && profile.id.includes("@") ? profile.id : "student@nitp.ac.in")}</strong></span>
                    </p>
                    <p className="flex items-center gap-3 font-semibold text-slate-700">
                      <Phone className="h-5 w-5 text-emerald-500 shrink-0" /> 
                      <span>Mobile: <strong className="text-slate-900">{profile.mobile || "+91 98765 43210"}</strong></span>
                    </p>
                    <p className="flex items-center gap-3 font-semibold text-slate-700">
                      <House className="h-5 w-5 text-slate-400 shrink-0" /> 
                      <span>Room / Hostel: <strong className="text-slate-900">{profile.hostel}</strong></span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="sd-btn-glow mt-6 inline-flex w-fit items-center gap-3 rounded-2xl bg-linear-to-r from-slate-900 via-indigo-700 to-cyan-500 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg cursor-pointer"
                  >
                    <QrCode className="h-6 w-6" />
                    Show QR Code
                  </button>
                </div>
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-5 rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">Recent Outings</h2>
                <Link
                  href="/dashboard/student/my-outings"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  View All →
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {outingsLoading ? (
                  <p className="sd-micro rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center">
                    Loading your outings…
                  </p>
                ) : outings.length === 0 ? (
                  <p className="sd-micro rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center">
                    No outings yet. Generate an outing ticket to get started.
                  </p>
                ) : (
                  outings.slice(0, 3).map((outing, i) => (
                    <div
                      key={outing.id}
                      className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
                      style={{ animationDelay: `${0.15 + i * 0.06}s` }}
                    >
                      <div>
                        <p className="sd-card-title text-slate-900 text-base">{outing.place}</p>
                        <p className="sd-micro mt-0.5">
                          {outing.date} at {outing.time}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${outingStatusStyle(outing.status)}`}>
                        {outing.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-eyebrow">Weekly Pulse</p>
                  <h2 className="sd-title sd-title-sm">Activity Stats</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Live</span>
              </div>
              <div className="mt-5 space-y-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <p className="sd-micro text-[0.8rem]">{stat.label}</p>
                      <p className="text-xl font-bold text-slate-900 font-sora italic">{stat.value}</p>
                    </div>
                    <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`sd-luxe-progress h-full rounded-full bg-linear-to-r ${stat.tone} transition-all duration-1000`}
                        style={{ width: stat.width }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">Timeline</p>
                  <h2 className="sd-title sd-title-sm">Today’s Movement</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Auto sync</span>
              </div>
              <div className="mt-5 space-y-4">
                {timeline.length === 0 ? (
                  <p className="sd-micro rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center">
                    No active outing. Your movement updates appear here once a pass is approved.
                  </p>
                ) : (
                  timeline.map((event, i) => (
                    <div
                      key={event.title}
                      className="sd-luxe-card sd-timeline-item sd-luxe-rise sd-luxe-tilt flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
                      style={{ animationDelay: `${0.1 + i * 0.07}s` }}
                    >
                      <div>
                        <p className="sd-card-title text-slate-900">{event.title}</p>
                        <p className="sd-micro">{event.meta}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${event.tone}`}>Active</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-6 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`sd-nav-link ${item.active ? "sd-nav-link--active" : ""}`}
              >
                <item.icon className="h-6 w-6" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800">
          <div className="relative w-full max-w-sm overflow-hidden bg-white rounded-3xl p-6 text-center shadow-2xl border border-slate-100 animate-scale-in">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-655 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="mt-2 flex flex-col items-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-750 border border-indigo-100 mb-4 animate-pulse">
                <ShieldCheck size={12} className="text-indigo-500" />
                Active Student Pass
              </span>

              <h2 className="font-sora text-xl font-bold text-slate-800 leading-snug">SafeExit Digital QR</h2>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xs mx-auto">
                Scan this QR code at the campus main gates to authorize entry or exit.
              </p>

              <div className="relative mt-6 p-6 rounded-3xl bg-linear-to-br from-indigo-50/50 to-sky-50/50 border border-slate-100 shadow-inner flex justify-center items-center">
                <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-100/60 relative overflow-hidden">
                  <QRCode value={qrValue} size={200} />
                  <div className="absolute left-0 right-0 h-0.5 bg-indigo-500/80 shadow-[0_0_8px_rgba(79,70,229,0.8)] animate-scan" style={{ top: '50%' }} />
                </div>
              </div>

              <div className="mt-6 w-full text-left bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
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

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="mt-6 w-full sf-btn-primary cursor-pointer"
              >
                Close Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800">
          <div className="relative w-full max-w-sm overflow-hidden bg-white rounded-3xl p-6 text-center shadow-2xl border border-slate-100 animate-scale-in">
            <button
              type="button"
              onClick={closePhotoModal}
              disabled={savingPhoto}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-655 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
            >
              <X size={20} />
            </button>

            <div className="mt-2 flex flex-col items-center">
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3">
                <Camera className="w-7 h-7" />
              </div>
              <h2 className="font-sora text-xl font-bold text-slate-800 leading-snug">
                {cropSrc ? "Adjust Your Photo" : "Update Profile Photo"}
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xs mx-auto">
                {cropSrc
                  ? "Drag to reposition, use the slider to zoom, then confirm."
                  : "Security guards use this photo to verify your identity at the gate. Choose a clear, recent face photo."}
              </p>

              {cropSrc ? (
                <>
                  <div
                    className="mt-6 relative rounded-full overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing touch-none select-none ring-4 ring-indigo-100"
                    style={{ width: CROP_FRAME, height: CROP_FRAME }}
                    onPointerDown={handleCropPointerDown}
                    onPointerMove={handleCropPointerMove}
                    onPointerUp={handleCropPointerUp}
                    onPointerCancel={handleCropPointerUp}
                  >
                    {cropNatural && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cropSrc}
                        alt="Crop preview"
                        draggable={false}
                        className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
                        style={{
                          width: cropNatural.width * cropCoverScale(cropNatural, cropZoom),
                          height: cropNatural.height * cropCoverScale(cropNatural, cropZoom),
                          transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                        }}
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/30" />
                  </div>

                  <div className="w-full flex items-center gap-2 mt-4 px-1">
                    <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.01"
                      value={cropZoom}
                      onChange={(e) => handleCropZoomChange(e.target.value)}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>

                  {photoError && <p className="text-xs text-rose-500 mt-3">{photoError}</p>}

                  <div className="w-full flex gap-3 pt-6">
                    <button
                      type="button"
                      onClick={handleCancelCrop}
                      className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Choose Different
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCrop}
                      className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Use Photo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="mt-6 w-36 h-36 rounded-full border-4 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-400 transition-colors"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoDraft ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoDraft} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <ImageIcon className="w-9 h-9 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                        <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">Tap to upload</span>
                      </>
                    )}
                  </div>

                  {photoDraft && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      Choose a different photo
                    </button>
                  )}

                  {photoError && <p className="text-xs text-rose-500 mt-3">{photoError}</p>}

                  <div className="w-full flex gap-3 pt-6">
                    <button
                      type="button"
                      onClick={closePhotoModal}
                      disabled={savingPhoto}
                      className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePhoto}
                      disabled={savingPhoto || !photoDraft || photoDraft === profile.photo}
                      className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {savingPhoto ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Save Photo
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              <input
                type="file"
                ref={photoInputRef}
                onChange={handlePhotoFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
