"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BellOff,
  Camera,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Fingerprint,
  Home,
  IdCard,
  ImageIcon,
  Loader2,
  Lock,
  MapPin,
  MapPinOff,
  MoonStar,
  PenLine,
  QrCode,
  ScanLine,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  SunMedium,
  Sunrise,
  Sunset,
  Ticket,
  TrendingUp,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  defaultStudentProfile,
  getFirstName,
  getInitials,
  getStoredUser,
  normalizeStudentProfile,
  setStoredUser,
  syncStoredStudentProfile,
} from "@/app/lib/userProfile";
import { getTimeGreeting } from "@/app/lib/greeting";
import { QR_PURPOSE, buildIdentityQr } from "@/app/lib/qrPayload.mjs";
import StudentQrModal from "@/app/components/student/StudentQrModal";
import { apiFetch } from "@/app/lib/api";
import {
  getGeolocationPermission,
  requestGeolocationPermission,
} from "@/app/lib/locationManager";
import { useRequireAuth, logout } from "@/app/lib/auth";
import {
  autoSubscribeIfGranted,
  getNotificationPermission,
  isPushSupported,
  subscribePush,
} from "@/app/lib/pushManager";
import AuthLoading from "@/app/components/AuthGate";
import SignatureSetupModal from "@/app/components/SignatureSetupModal";
import useCountUp from "@/app/hooks/useCountUp";
import { HOSTELS, RESIDENCY, isDayScholar } from "@/app/lib/hostels";
import {
  clampCropOffset,
  cropCoverScale,
  getCropSourceRect,
} from "@/app/lib/profilePhotoCrop.mjs";
import { OUTING_RETURN_LABEL } from "@/app/lib/outingRules.mjs";
import { CAMPUS_TIMEZONE, campusDateKey } from "@/app/lib/leaveRules.mjs";

const formatClock = (value) =>
  new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

// Downscale photos before storage so re-uploads don't blow the localStorage quota.
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

// Crop viewport size; image shown at "cover" scale so pan math ignores fit-to-frame.
const CROP_FRAME = 260;

// 'Returned' + returnPunctuality 'Overdue' surfaces as a distinct "Returned late" badge.
const outingBadge = (outing) => {
  const status = String(outing?.status || "").toLowerCase();
  if (outing?.isOverdue) {
    return { label: "Overdue", className: "bg-rose-100 text-rose-700" };
  }
  if (status === "returned" && outing?.returnPunctuality === "Overdue") {
    return { label: "Returned late", className: "bg-rose-100 text-rose-700" };
  }
  switch (status) {
    case "approved":
    case "out":
      return { label: outing?.status, className: "bg-emerald-100 text-emerald-700" };
    case "returned":
      return { label: "Returned", className: "bg-slate-100 text-slate-600" };
    case "rejected":
      return { label: outing?.status, className: "bg-rose-100 text-rose-700" };
    // Stored 'Expired' = never scanned out before that day's exit window closed.
    case "expired":
      return { label: "Unused", className: "bg-slate-100 text-slate-600" };
    default:
      return { label: outing?.status || "Pending", className: "bg-amber-100 text-amber-700" };
  }
};

// Row accent color, mirroring outingBadge tones.
const outingAccent = (outing) => {
  const status = String(outing?.status || "").toLowerCase();
  if (outing?.isOverdue) return "#f43f5e";
  if (status === "returned" && outing?.returnPunctuality === "Overdue") return "#f43f5e";
  switch (status) {
    case "approved":
    case "out":
      return "#10b981";
    case "returned":
      return "#94a3b8";
    case "rejected":
      return "#f43f5e";
    case "expired":
      return "#94a3b8";
    default:
      return "#f59e0b";
  }
};

const actions = [
  {
    title: "Go Out",
    description: "No form needed — show your QR at the gate.",
    icon: Ticket,
    href: "/dashboard/student/generate-ticket",
    badge: "linear-gradient(145deg, #0f172a 0%, #4338ca 52%, #06b6d4 100%)",
    tint: "linear-gradient(160deg, rgba(67,56,202,0.13) 0%, rgba(6,182,212,0.09) 100%)",
    glow: "rgba(67,56,202,0.5)",
    border: "rgba(56,189,248,0.5)",
  },
  {
    title: "My Outings",
    description: "Your gate exits, returns, and status.",
    icon: ClipboardList,
    href: "/dashboard/student/my-outings",
    badge: "linear-gradient(145deg, #1e40af 0%, #38bdf8 100%)",
    tint: "linear-gradient(160deg, rgba(30,64,175,0.12) 0%, rgba(56,189,248,0.10) 100%)",
    glow: "rgba(37,99,235,0.5)",
    border: "rgba(56,189,248,0.5)",
  },
  {
    title: "SOS Alert",
    description: "Share your live location with security instantly.",
    icon: Siren,
    href: "/dashboard/student/sos",
    badge: "linear-gradient(145deg, #fb7185 0%, #f43f5e 48%, #e11d48 100%)",
    tint: "linear-gradient(160deg, rgba(244,63,94,0.13) 0%, rgba(225,29,72,0.08) 100%)",
    glow: "rgba(225,29,72,0.5)",
    border: "rgba(251,113,133,0.55)",
  },
  {
    title: "Leave Application",
    description: "Request multi-day leave for festivals or home visits.",
    icon: CalendarDays,
    href: "/dashboard/student/leave-application",
    badge: "linear-gradient(145deg, #6d28d9 0%, #a855f7 55%, #d946ef 100%)",
    tint: "linear-gradient(160deg, rgba(168,85,247,0.13) 0%, rgba(217,70,239,0.09) 100%)",
    glow: "rgba(147,51,234,0.5)",
    border: "rgba(192,132,252,0.55)",
  },
  {
    title: "Report Delay",
    description: "Tell your hostel you're returning late.",
    icon: Clock3,
    href: "/dashboard/student/delay-notice",
    badge: "linear-gradient(145deg, #0f766e 0%, #14b8a6 55%, #2dd4bf 100%)",
    tint: "linear-gradient(160deg, rgba(20,184,166,0.13) 0%, rgba(45,212,191,0.09) 100%)",
    glow: "rgba(13,148,136,0.5)",
    border: "rgba(45,212,191,0.55)",
  },
];

// A day scholar lives at home: the gate only logs their entry and exit, so there are no
// outings to list or report late, and no leave to apply for.
const DAY_SCHOLAR_HIDDEN = new Set([
  "/dashboard/student/my-outings",
  "/dashboard/student/leave-application",
  "/dashboard/student/delay-notice",
]);

const navItems = [
  { label: "Home", icon: Home, href: "/dashboard/student", active: true },
  { label: "Outings", icon: ClipboardList, href: "/dashboard/student/my-outings" },
  { label: "Go Out", icon: Ticket, href: "/dashboard/student/generate-ticket" },
  { label: "SOS", icon: Siren, href: "/dashboard/student/sos" },
  { label: "Leave", icon: CalendarDays, href: "/dashboard/student/leave-application" },
];

// Cursor-following button via CSS vars; reduced-motion neutralises the transform.
function MagneticButton({ strength = 0.35, className = "", children, ...props }) {
  const handleMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    el.style.setProperty("--mag-x", `${dx * strength}px`);
    el.style.setProperty("--mag-y", `${dy * strength}px`);
  };
  const reset = (e) => {
    e.currentTarget.style.setProperty("--mag-x", "0px");
    e.currentTarget.style.setProperty("--mag-y", "0px");
  };
  return (
    <button
      onPointerMove={handleMove}
      onPointerLeave={reset}
      className={`sd-magnetic ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// 3D tilt tile — pointer written to CSS vars, no per-frame re-render.
// `featured` lets the lead action span both columns at sm, where five tiles would
// otherwise leave an orphan; from lg the grid is 5-across so the span is dropped.
function ActionCard({ action, index, featured = false }) {
  const handlePointerMove = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0 → 1
    const py = (e.clientY - rect.top) / rect.height; // 0 → 1
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
    el.style.setProperty("--rx", `${(0.5 - py) * 9}deg`);
  };

  const resetTilt = (e) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  };

  const badgeStyle = {
    background: action.badge,
    boxShadow: `0 14px 26px -12px ${action.glow}`,
  };

  return (
    <Link
      href={action.href}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      className={`sd-tile sd-qa sd-luxe-rise group block h-full ${featured ? "sm:col-span-2 lg:col-span-1" : ""}`}
      style={{
        animationDelay: `${0.08 + index * 0.08}s`,
        "--tint": action.tint,
        "--glow": action.glow,
        "--tile-border": action.border,
      }}
    >
      {/* One column at every size: badge top-left, arrow top-right, copy pinned to the
          bottom by mt-auto. Phones get a compact two-up card carrying the same title
          and description as the wide tiles, just scaled down by the .sd-qa phone block
          in globals.css. Only the hover rule is dropped there. */}
      <div className="sd-tile__inner flex h-full flex-col items-start p-3.5 sm:min-h-[13rem] sm:p-5">
        <span className="sd-tile__glare" aria-hidden="true" />

        <span className="sd-act-arrow sd-lift-sm absolute right-3 top-3 sm:right-5 sm:top-5">
          <ArrowUpRight className="h-4 w-4" />
        </span>

        <span className="sd-act sd-lift-lg shrink-0 shadow-lg" style={badgeStyle}>
          <action.icon className="h-6 w-6" />
        </span>

        {/* The sm: reserves keep the five wide tiles level. Phones get their own
            (tighter) description reserve from `.sd-qa .sd-act-desc`, so every card in
            the two-up grid lands on the same height whether its copy runs 2 or 3 lines. */}
        <div className="sd-lift-md mt-auto w-full min-w-0 pt-4 sm:pt-6">
          <span className="sd-act-rule mb-2 hidden sm:mb-3 sm:block" aria-hidden="true" />
          <span className="sd-card-title line-clamp-2 leading-snug sm:min-h-[2.75rem]">
            {action.title}
          </span>
          <span className="sd-body sd-act-desc mt-1 line-clamp-3 sm:mt-1.5 sm:min-h-[5.25rem]">
            {action.description}
          </span>
        </div>
      </div>
    </Link>
  );
}

// A leave's return is a date, not a time (the leave QR works all day on the leave date).
const formatLeaveDay = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: CAMPUS_TIMEZONE })
    : "—";

// Count-up stat; non-numeric values ("—", "05:30 PM") render as-is.
function StatCard({ stat }) {
  const match = String(stat.value).match(/^(\d+)(\D*)$/);
  const numeric = Boolean(match);
  const target = numeric ? Number(match[1]) : 0;
  const suffix = numeric ? match[2] : "";
  const [ref, value] = useCountUp(target);
  const display = numeric ? `${Math.round(value)}${suffix}` : stat.value;
  const Icon = stat.icon;

  return (
    <div ref={ref} className="sd-stat px-3.5 py-3 sm:px-4 sm:py-4" style={{ "--stat-glow": stat.glow }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md sm:h-9 sm:w-9"
            style={{ background: stat.chip, boxShadow: `0 10px 20px -10px ${stat.glow}` }}
          >
            <Icon className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
          </span>
          <p className="sd-micro text-[0.8rem]">{stat.label}</p>
        </div>
        <p
          className="text-xl font-bold italic tracking-tight text-transparent bg-clip-text sm:text-2xl"
          style={{ backgroundImage: stat.fill, fontFamily: "var(--font-display), 'Space Grotesk', sans-serif" }}
        >
          {display}
        </p>
      </div>
      <div className="sd-bar mt-2.5 sm:mt-3.5">
        <div
          className="sd-bar__fill"
          style={{ width: stat.width, background: stat.fill, boxShadow: `0 0 12px ${stat.glow}` }}
        />
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const [profile, setProfile] = useState(defaultStudentProfile);
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  // Which of the two permanent QRs the modal opens on; the modal can switch between them.
  const [qrPurpose, setQrPurpose] = useState(QR_PURPOSE.OUTING);
  const openQr = (purpose = QR_PURPOSE.OUTING) => {
    setQrPurpose(purpose);
    setShowQrModal(true);
  };
  const [outings, setOutings] = useState([]);
  // The newest few leave applications: enough to know whether the student is away on one
  // now, or has one approved for today.
  const [leaves, setLeaves] = useState([]);
  const [outingsLoading, setOutingsLoading] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Browser push is separate from login and needs one explicit
  // permission gesture before overdue alerts can reach this device.
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoDraft, setPhotoDraft] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);

  // Hostel backfill for accounts created before hostel was mandatory. Without it the
  // caretaker's residence-scoped views can't see this student at all — including the
  // Out Now roster while they're off campus.
  const [hostelSynced, setHostelSynced] = useState(false);
  const [hostelDraft, setHostelDraft] = useState("");
  const [savingHostel, setSavingHostel] = useState(false);
  const [hostelError, setHostelError] = useState("");

  // Caretaker / warden contact info for the student's hostel — shown on the passport card.
  const [hostelContact, setHostelContact] = useState(null); // { caretaker, wardens }

  // Profile details editing: opens every 1 July (or when an admin reopens it for everyone),
  // and saving once locks it again. `profileUnlocked` is derived by the backend.
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editForm, setEditForm] = useState({
    department: "",
    year: "",
    roomNumber: "",
    phoneNumber: "",
    guardianPhoneNumber: "",
    hostelName: "",
    residency: RESIDENCY.HOSTEL,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [profileSaveSuccess, setProfileSaveSuccess] = useState("");

  // Location permission banner — primed on first dashboard visit so the SOS
  // page never has to surface the browser's location prompt mid-emergency.
  // null until the permission state is read; then 'granted'|'denied'|'prompt'|'unsupported'.
  const [locPermission, setLocPermission] = useState(null);
  const [locBannerDismissed, setLocBannerDismissed] = useState(false);
  const [locEnabling, setLocEnabling] = useState(false);

  // Crop step before an image becomes `photoDraft`; pan/zoom in frame-space pixels.
  const [cropSrc, setCropSrc] = useState(null);
  const [cropNatural, setCropNatural] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const cropDragRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Wait for useRequireAuth: after the mobile OS wipes sessionStorage, the cookie
  // restore writes the profile only once it resolves, so reading on mount would
  // render the placeholder profile.
  useEffect(() => {
    if (!authorized) return;
    const storedProfile = getStoredUser();
    const normalized = normalizeStudentProfile(storedProfile);
    if (normalized.name === defaultStudentProfile.name) return; // the server sync below fills it
    // Hydrate the browser-backed profile before the server sync lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile((prev) => ({ ...normalized, signature: prev.signature }));
    // No republish of the cached photo: the server copy is locked once set, and the
    // gate only ever shows what the server holds.
  }, [authorized]);

  useEffect(() => {
    if (!isPushSupported()) {
      // Browser capability is read once on mount; this is intentionally local UI state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPushPermission("unsupported");
      return;
    }
    const permission = getNotificationPermission();
    setPushPermission(permission);
    if (permission === "granted") autoSubscribeIfGranted();
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    setPushPermission(result.success ? "granted" : getNotificationPermission());
  };

  // Approved notices link here so the student lands directly on the permanent QR they
  // must present at the main gate: ?showQr=leave for the leave QR, ?showQr=1 the outing QR.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const which = params.get("showQr");
    if (which !== "1" && which !== "leave") return;
    window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => {
      setQrPurpose(which === "leave" ? QR_PURPOSE.LEAVE : QR_PURPOSE.OUTING);
      setShowQrModal(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Read the current location-permission state on first visit so we can decide
  // whether to show the priming banner. Reading is silent — it never prompts.
  useEffect(() => {
    let cancelled = false;
    getGeolocationPermission().then((state) => {
      if (!cancelled) setLocPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fires the native location prompt from the button's user gesture.
  const handleEnableLocation = async () => {
    setLocEnabling(true);
    const result = await requestGeolocationPermission();
    setLocEnabling(false);
    setLocPermission(result);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The server profile is the source of truth for every field (the tab cache can be
  // stale or missing; the scanner resolves the QR by sid first). Waits for auth so the
  // request carries this tab's Bearer token.
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch("/auth/profile");
        if (cancelled || me?.role !== "Student") return;
        const synced = syncStoredStudentProfile(me);
        // Signature bytes stay in page state only; the store keeps just the flag.
        setProfile({
          ...synced,
          signature: me.signature || null,
          profileUnlocked: Boolean(me.profileUnlocked),
          guardianPhoneNumber: me.guardianPhoneNumber || "",
          department: me.department || "",
          year: me.year || "",
          roomNumber: me.roomNumber || "",
          closeContacts: me.closeContacts || [],
        });
        setHostelSynced(true);
      } catch {
        /* not authenticated — keep local profile */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  // Fetch caretaker + warden contact for the student's hostel.
  // Runs after the profile sync so profile.hostelName is available to the card renderer.
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/auth/hostel-contact");
        if (!cancelled) setHostelContact(data);
      } catch {
        /* best-effort: show nothing if this fails */
      }
    })();
    return () => { cancelled = true; };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    // background=true skips the loading state so polls update silently.
    const loadOutings = async (background = false) => {
      if (!background) setOutingsLoading(true);
      try {
        // A failed leave read keeps the last known leaves rather than claiming "on campus".
        const [data, leaveRows] = await Promise.all([
          apiFetch("/outing/myrequests"),
          apiFetch("/leave/myrequests?limit=5").catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(leaveRows)) setLeaves(leaveRows);
        const mapped = (data || []).map((o) => ({
          id: o._id,
          // Gate-created outings carry no destination; only old requests do.
          place: o.destination || "Outing",
          purpose: o.purpose,
          status: o.status || "Pending",
          isOverdue: Boolean(o.isOverdue),
          returnPunctuality: o.returnPunctuality || null,
          outTime: o.outTime,
          inTime: o.inTime,
          actualOutTime: o.actualOutTime || null,
          // Departure is the gate scan; before it, the pass's day and exit-by deadline.
          date: new Date(o.actualOutTime || o.createdAt || o.outTime).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
          time: o.actualOutTime ? formatClock(o.actualOutTime) : `by ${formatClock(o.outTime)}`,
        }));
        setOutings(mapped);
      } catch {
        if (!cancelled && !background) setOutings([]);
      } finally {
        if (!cancelled) setOutingsLoading(false);
      }
    };

    loadOutings();

    // Poll + focus refetch so gate scans reflect without a reload.
    const interval = setInterval(() => {
      loadOutings(true);
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadOutings(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authorized]);

  const greetingName = useMemo(() => {
    const firstName = getFirstName(profile.name);
    return firstName || profile.name;
  }, [profile.name]);

  const timeGreeting = useMemo(() => getTimeGreeting(now), [now]);

  // Time-of-day hero visual (sunrise → day → dusk → night).
  const timeVisual = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12)
      return { Icon: Sunrise, orb: "from-amber-400 via-orange-400 to-rose-400", halo: "rgba(251,146,60,0.5)" };
    if (hour < 17)
      return { Icon: SunMedium, orb: "from-sky-400 via-cyan-400 to-blue-400", halo: "rgba(56,189,248,0.5)" };
    if (hour < 21)
      return { Icon: Sunset, orb: "from-orange-400 via-pink-500 to-violet-500", halo: "rgba(236,72,153,0.5)" };
    return { Icon: MoonStar, orb: "from-indigo-500 via-violet-500 to-slate-700", halo: "rgba(99,102,241,0.5)" };
  }, [now]);

  // `myrequests` is newest-first, so the first Approved/Out request wins.
  const latestApproved = useMemo(
    () => outings.find((o) => ["Approved", "Out"].includes(o.status)) || null,
    [outings]
  );

  const overdueOuting = useMemo(
    () => outings.find((outing) => outing.status === "Out" && outing.isOverdue) || null,
    [outings]
  );

  // A leave the gate took 'Out' means the student is away on it, whatever the outings say.
  const onLeave = useMemo(() => leaves.find((l) => l.status === "Out") || null, [leaves]);
  const dayScholar = isDayScholar(profile);
  const visibleActions = dayScholar
    ? actions
        .filter((a) => !DAY_SCHOLAR_HIDDEN.has(a.href))
        .map((a) =>
          a.href === "/dashboard/student/generate-ticket"
            ? { ...a, title: "Gate QR", description: "Show it at the gate when you arrive and when you leave." }
            : a,
        )
    : actions;
  const visibleNavItems = dayScholar
    ? navItems.filter((n) => !DAY_SCHOLAR_HIDDEN.has(n.href))
    : navItems;
  // Approved for today and not used yet: the student must show the Leave QR to go home on it.
  const leaveToday = useMemo(() => {
    const today = campusDateKey(new Date());
    return leaves.find((l) => l.status === "Approved" && campusDateKey(l.leaveDate) === today) || null;
  }, [leaves]);

  const qrRollNo = useMemo(() => {
    const roll = profile.rollNo && profile.rollNo !== defaultStudentProfile.rollNo ? profile.rollNo : "";
    if (roll) return roll;
    // Fallback: a non-email id is the roll number; never fabricate or use "—".
    const id = profile.id;
    if (!id || id === defaultStudentProfile.id || String(id).includes("@")) return "";
    return id;
  }, [profile]);

  // Identity-only QR — no outing status, so a replayed screenshot can't smuggle a stale "Approved".
  // The stub shows the outing QR; the leave QR lives in the modal (StudentQrModal).
  const qrValue = useMemo(
    () => buildIdentityQr({ id: qrRollNo, sid: profile.sid, name: profile.name }),
    [qrRollNo, profile.sid, profile.name]
  );

  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    [now]
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now]
  );

  const stats = useMemo(() => {
    const returnedCount = outings.filter((o) => o.status === "Returned").length;
    const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "0%");
    return [
      {
        key: "total",
        label: "Total outings",
        value: String(outings.length),
        width: outings.length ? "100%" : "8%",
        icon: ClipboardList,
        fill: "linear-gradient(90deg, #0891b2, #06b6d4, #38bdf8)",
        chip: "linear-gradient(135deg, #0e7490, #06b6d4)",
        glow: "rgba(6,182,212,0.45)",
      },
      {
        key: "returned",
        label: "Completed",
        value: String(returnedCount),
        width: pct(returnedCount, outings.length || 1),
        icon: CheckCircle2,
        fill: "linear-gradient(90deg, #059669, #10b981, #34d399)",
        chip: "linear-gradient(135deg, #047857, #10b981)",
        glow: "rgba(16,185,129,0.45)",
      },
      {
        key: "return",
        label: "Next return by",
        value: onLeave ? formatLeaveDay(onLeave.returnDate) : latestApproved ? formatClock(latestApproved.inTime) : "—",
        width: onLeave || latestApproved ? "80%" : "8%",
        icon: Clock3,
        fill: "linear-gradient(90deg, #4338ca, #6366f1, #a855f7)",
        chip: "linear-gradient(135deg, #4338ca, #7c3aed)",
        glow: "rgba(99,102,241,0.45)",
      },
    ];
  }, [outings, latestApproved, onLeave]);

  const timeline = useMemo(() => {
    if (onLeave) {
      return [
        {
          title: "Left on leave",
          meta: onLeave.destination ? `To ${onLeave.destination}` : "Logged at the main gate",
          tone: "bg-purple-100 text-purple-700",
        },
        {
          title: "Expected back",
          meta: formatLeaveDay(onLeave.returnDate),
          tone: "bg-amber-100 text-amber-700",
        },
      ];
    }
    if (!latestApproved) return [];
    return [
      latestApproved.status === "Out"
        ? {
            title: "Went out",
            meta: `Left at ${formatClock(latestApproved.actualOutTime || latestApproved.outTime)}`,
            tone: "bg-emerald-100 text-emerald-700",
          }
        : {
            title: "Outing approved",
            meta: `${latestApproved.place} · exit by ${formatClock(latestApproved.outTime)}`,
            tone: "bg-emerald-100 text-emerald-700",
          },
      {
        title: "Return due",
        meta: `By ${formatClock(latestApproved.inTime)}`,
        tone: "bg-amber-100 text-amber-700",
      },
    ];
  }, [latestApproved, onLeave]);

  const handleLogout = () => logout(router, { role: "student" });

  // Click-outside dismissal for the modals. Both the press and the release must land on
  // the overlay itself, so a crop drag that starts inside the panel and ends over the
  // backdrop isn't mistaken for an outside click.
  const backdropPressRef = useRef(false);
  const handleBackdropPointerDown = (e) => {
    backdropPressRef.current = e.target === e.currentTarget;
  };
  const backdropCloseHandler = (close) => (e) => {
    if (e.target !== e.currentTarget || !backdropPressRef.current) return;
    backdropPressRef.current = false;
    close();
  };

  const openPhotoModal = () => {
    setPhotoDraft(null);
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
      const source = getCropSourceRect(cropNatural, cropZoom, cropOffset, CROP_FRAME);
      const OUTPUT = 480;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      canvas
        .getContext("2d")
        .drawImage(img, source.x, source.y, source.size, source.size, 0, 0, OUTPUT, OUTPUT);
      setPhotoDraft(canvas.toDataURL("image/jpeg", 0.9));
      setCropSrc(null);
      setCropNatural(null);
    };
    img.src = cropSrc;
  };

  // Only for an account with no photo yet: once saved it locks, and changing it is an
  // admin reset. Awaited (not fire-and-forget) so the student sees a refusal or failure
  // instead of a picture that never reached the gate.
  const handleSavePhoto = async () => {
    if (!photoDraft || profile.photo) return;
    setSavingPhoto(true);
    setPhotoError("");
    try {
      const nextPhoto = (await compressImage(photoDraft, 800, 0.7)) || photoDraft;
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ photo: nextPhoto }),
      });
      const synced = syncStoredStudentProfile(updated);
      setProfile((prev) => ({ ...prev, photo: synced.photo }));

      // Sync the on-device onboarding blob so quick-login keeps the latest photo.
      try {
        const existing = JSON.parse(localStorage.getItem("safeexit_user_profile") || "null") || {};
        localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...existing, photo: synced.photo }));
      } catch {
        /* best-effort — device storage may be full or unavailable */
      }

      setShowPhotoModal(false);
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError(err?.message || "Couldn't save your photo. Please try again.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleSaveHostel = async () => {
    if (!hostelDraft) {
      setHostelError("Please select your hostel.");
      return;
    }
    setSavingHostel(true);
    setHostelError("");
    try {
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ hostelName: hostelDraft }),
      });
      // PATCH returns the full profile payload, so the "Block, Room" label updates too.
      const synced = syncStoredStudentProfile(updated);
      setProfile((prev) => ({ ...synced, signature: prev.signature }));
    } catch (err) {
      setHostelError(err?.message || "Couldn't save your hostel. Please try again.");
    } finally {
      setSavingHostel(false);
    }
  };

  const openEditProfileModal = () => {
    setEditForm({
      department: profile.department || "",
      // Deliberately blank: saving locks the profile until next 1 July, so the student
      // must actively pick this year's value rather than resave last year's by accident.
      year: "",
      roomNumber: profile.roomNumber || profile.room || "",
      phoneNumber: profile.mobile || profile.phoneNumber || "",
      guardianPhoneNumber: profile.guardianPhoneNumber || "",
      hostelName: profile.hostelName || "",
      residency: profile.residency || RESIDENCY.HOSTEL,
    });
    setProfileSaveError("");
    setProfileSaveSuccess("");
    setShowEditProfileModal(true);
  };

  const closeEditProfileModal = () => {
    if (savingProfile) return;
    setShowEditProfileModal(false);
    setProfileSaveError("");
    setProfileSaveSuccess("");
  };

  const handleSaveProfile = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    setProfileSaveError("");
    setProfileSaveSuccess("");

    if (!editForm.year) {
      setProfileSaveError("Please select your current academic year");
      setSavingProfile(false);
      return;
    }
    const cleanPhone = String(editForm.phoneNumber || "").replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
      setProfileSaveError("Please enter a valid student mobile number (10-15 digits)");
      setSavingProfile(false);
      return;
    }
    // Required, as at registration: the backend rejects an empty guardian number.
    const cleanGuardian = String(editForm.guardianPhoneNumber || "").replace(/\D/g, "");
    if (!cleanGuardian || cleanGuardian.length < 10 || cleanGuardian.length > 15) {
      setProfileSaveError("Please enter a valid guardian mobile number (10-15 digits)");
      setSavingProfile(false);
      return;
    }
    if (cleanGuardian && cleanPhone === cleanGuardian) {
      setProfileSaveError("Student phone and guardian phone numbers cannot be identical");
      setSavingProfile(false);
      return;
    }
    const toDayScholar = editForm.residency === RESIDENCY.DAY_SCHOLAR;
    if (!toDayScholar && !editForm.hostelName) {
      setProfileSaveError("Please select your hostel");
      setSavingProfile(false);
      return;
    }

    try {
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          department: editForm.department ? editForm.department.trim() : "",
          year: editForm.year ? editForm.year.trim() : "",
          phoneNumber: cleanPhone,
          guardianPhoneNumber: cleanGuardian,
          residency: editForm.residency,
          // A day scholar has no hostel or room; the server refuses one.
          ...(toDayScholar
            ? {}
            : {
                roomNumber: editForm.roomNumber ? editForm.roomNumber.trim() : "",
                hostelName: editForm.hostelName.trim(),
              }),
        }),
      });

      const synced = syncStoredStudentProfile(updated);
      setProfile((prev) => ({
        ...prev,
        ...synced,
        profileUnlocked: Boolean(updated.profileUnlocked),
        guardianPhoneNumber: updated.guardianPhoneNumber || "",
        department: updated.department || "",
        year: updated.year || "",
        roomNumber: updated.roomNumber || "",
        closeContacts: updated.closeContacts || prev.closeContacts || [],
      }));

      setProfileSaveSuccess("Profile updated! It is now locked until the next update window on 1 July.");
      setTimeout(() => {
        setShowEditProfileModal(false);
        setProfileSaveSuccess("");
      }, 1500);
    } catch (err) {
      setProfileSaveError(err.message || "Failed to update profile details");
    } finally {
      setSavingProfile(false);
    }
  };

  // Gate render on the session check; hook redirects to /login/student otherwise.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-24 md:pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <header className="sd-luxe-panel sd-glow-border sd-enter flex flex-wrap items-center justify-between gap-3 rounded-4xl px-4 py-3.5 shadow-xl sm:gap-4 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14">
                <Shield className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div>
                <p className="sd-eyebrow flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Personal Hub
                </p>
                <h1 className="sd-title sd-reveal sd-stagger-1">
                  <span className="sd-gradient-text">Student Dashboard</span>
                </h1>
                <p className="sd-subtitle">NITP-SafeExit Passport</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSignatureModal(true)}
                title={profile.signature ? "Your signature (locked)" : "Add your signature"}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 shadow-sm transition hover:bg-indigo-50 sm:h-[3.25rem]"
              >
                {profile.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.signature} alt="Signature" className="h-6 w-auto" />
                ) : (
                  <PenLine className="h-5 w-5 text-indigo-500" />
                )}
              </button>
              {/* Whole chip opens the photo modal — the 24px badge alone was too small to hit
                  reliably on a phone. Upload when there is no photo, view-only once locked. */}
              <button
                type="button"
                onClick={openPhotoModal}
                title={profile.photo ? "Your profile photo (locked)" : "Add your profile photo"}
                className="sd-luxe-card sd-profile-chip sd-luxe-tilt group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left cursor-pointer sm:min-w-[200px] sm:px-4 sm:py-3"
              >
                <span className="relative block shrink-0">
                  <span className="sd-profile-avatar overflow-hidden">
                    {mounted && profile.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.photo} alt={profile.name} className="h-full w-full object-cover" />
                    ) : (
                      mounted ? getInitials(profile.name) : "?"
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-indigo-600 shadow-md ring-2 ring-white transition-transform group-hover:scale-110"
                  >
                    {profile.photo ? <Lock className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900 text-base">{profile.name}</span>
                  <span className="block text-sm text-slate-500">{profile.subtitle}</span>
                </span>
                <span className="sr-only">{profile.photo ? "View profile photo" : "Add profile photo"}</span>
              </button>
              <button
                type="button"
                onClick={openEditProfileModal}
                title={profile.profileUnlocked ? "Your profile is unlocked! Click to edit details" : "View your profile details"}
                className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition cursor-pointer ${
                  profile.profileUnlocked
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-2 ring-emerald-400/50 animate-pulse"
                    : "border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {profile.profileUnlocked ? <Unlock className="h-5 w-5" /> : <IdCard className="h-5 w-5" />}
                <span className="sr-only">{profile.profileUnlocked ? "Edit Profile" : "View Profile"}</span>
              </button>
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

          {/* Unlocked Profile Edit Notification Banner */}
          {mounted && profile.profileUnlocked && (
            <section className="sd-luxe-panel sd-luxe-rise mt-4 rounded-4xl p-4 sm:p-5 shadow-xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-white sm:mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
                    <Unlock className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-900">
                        Annual Profile Update
                      </span>
                      <span className="text-xs font-semibold text-emerald-700">New academic year</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">Please update your details for this year</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Confirm your academic year, hostel, room, and contact numbers. You can save once; after that your profile locks until next 1 July.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openEditProfileModal}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm px-5 py-2.5 shadow-md shadow-emerald-200 transition cursor-pointer"
                >
                  <PenLine className="h-4 w-4" />
                  Edit My Details
                </button>
              </div>
            </section>
          )}

          {/* Not dismissable: accounts made before the photo was mandatory have none, and the
              gate guard has nothing to match this student's face against until they add one.
              Waits for the server sync so a device-cached photo cannot hide it. */}
          {mounted && hostelSynced && !profile.photo && (
            <section className="sd-luxe-panel sd-luxe-rise mt-4 rounded-4xl p-4 shadow-xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 via-amber-50 to-white sm:mt-6 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-200">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900">Upload your profile photo</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Your account has no photo, so the gate guard cannot verify your identity. Add a clear,
                      recent photo of your face. It locks once saved.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openPhotoModal}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-sm px-5 py-2.5 shadow-md shadow-rose-200 transition cursor-pointer"
                >
                  <Camera className="h-4 w-4" />
                  Upload Photo
                </button>
              </div>
            </section>
          )}

          {/* Not dismissable: until a hostel is on record the caretaker's roster and Out Now
              board can't see this student, so skipping it would silently break gate oversight. */}
          {mounted && hostelSynced && !profile.hostelName && !dayScholar && (
            <section className="sd-luxe-panel sd-luxe-rise mt-4 rounded-4xl p-4 shadow-xl border border-amber-200 sm:mt-6 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <Home className="h-5.5 w-5.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="sd-card-title text-slate-900 text-base">Confirm your hostel</p>
                    <p className="sd-micro mt-0.5">
                      Your hostel isn&apos;t on record, so your caretaker can&apos;t see you on their
                      roster or track you when you&apos;re off campus.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={hostelDraft}
                    onChange={(e) => {
                      setHostelDraft(e.target.value);
                      setHostelError("");
                    }}
                    disabled={savingHostel}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:border-amber-500 focus:bg-white transition-colors disabled:opacity-50"
                  >
                    <option value="">Select Hostel</option>
                    {HOSTELS.filter((h) => !profile.gender || h.gender === profile.gender).map((h) => (
                      <option key={h.name} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveHostel}
                    disabled={savingHostel || !hostelDraft}
                    className="sf-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingHostel ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save
                  </button>
                </div>
              </div>
              {hostelError && <p className="text-xs text-rose-500 mt-3">{hostelError}</p>}
            </section>
          )}

          <section
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
            }}
            style={{ animationDelay: "0.12s" }}
            className="sd-luxe-panel sd-glow-border sd-spot-host sd-enter mt-4 rounded-4xl p-4 shadow-xl sm:mt-6 sm:p-7"
          >
            <span className="sd-spotlight" aria-hidden="true" />
            <div className="grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex items-center gap-3 sm:flex-wrap sm:gap-5">
                <div
                  className={`sd-luxe-float sd-orb-halo flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br sm:h-20 sm:w-20 sm:rounded-3xl ${timeVisual.orb} text-white ring-4 ring-white/70 shadow-xl sm:ring-8`}
                  style={{ "--halo": timeVisual.halo }}
                >
                  <timeVisual.Icon className="h-6 w-6 sm:h-10 sm:w-10" />
                </div>
                <div className="min-w-0 flex-1 sm:flex-none">
                  <p className="sd-kicker hidden sm:inline-flex">Daily Pulse</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 sm:mt-2">
                    {timeGreeting},{" "}
                    <span className="sd-name-live">{greetingName}</span>.
                  </h2>
                  <p className="sd-body mt-2 hidden max-w-md sm:block">
                    {dayScholar
                      ? "You're registered as a day scholar. Show your Gate QR at the main gate when you arrive and when you leave — it is only logged, with no return time."
                      : onLeave
                      ? `You're on leave${onLeave.destination ? ` (${onLeave.destination})` : ""}, expected back by ${formatLeaveDay(onLeave.returnDate)}. Show either of your QRs at the main gate when you return.`
                      : latestApproved
                      ? latestApproved.isOverdue
                        ? `Your expected return time of ${formatClock(latestApproved.inTime)} has passed. Please report your delay and return safely.`
                        : latestApproved.status === "Out"
                          ? `You're outside campus until ${formatClock(latestApproved.inTime)}. Show this same permanent QR at the main gate to log your entry when you return.`
                        : `Your pass is approved. Show your permanent QR at the main gate to log your exit; return by ${formatClock(latestApproved.inTime)}.`
                      : leaveToday
                        ? `Your leave is approved for today. When you leave for home, show your Leave QR at the main gate — the Outing QR only logs an outing.`
                        : `No outing in progress. To go out, just show your QR at the main gate — no request needed. Be back by ${OUTING_RETURN_LABEL}.`}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                        overdueOuting
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : onLeave
                            ? "border-purple-200 bg-purple-50 text-purple-700"
                          : latestApproved
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full animate-pulse ${
                          overdueOuting ? "bg-rose-500" : onLeave ? "bg-purple-500" : latestApproved ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      {dayScholar ? "Day scholar" : overdueOuting ? "Return overdue" : onLeave ? "On leave" : latestApproved ? (latestApproved.status === "Out" ? "Out now" : "Pass active") : leaveToday ? "On campus · leave today" : "On campus"}
                    </span>
                    {!dayScholar && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-600">
                      <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                      {outings.length} total {outings.length === 1 ? "outing" : "outings"}
                    </span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2 sm:gap-3 sm:text-sm lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500 sm:h-5 sm:w-5" />
                  <span className="truncate">{mounted ? formattedDate : "Loading..."}</span>
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                  <Clock3 className="h-4 w-4 shrink-0 text-sky-500 sm:h-5 sm:w-5" />
                  <span className="tabular-nums truncate">{mounted ? formattedTime : "Loading..."}</span>
                  <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 sm:inline-flex">
                    <span className="sd-tag-dot" />
                    Live
                  </span>
                </span>
              </div>
            </div>

            {/* Prominent High-Convenience Gate Pass Action Strip */}
            <div className="mt-4 pt-3.5 sm:mt-5 sm:pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gradient-to-r from-sky-50 via-indigo-50/50 to-white p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-sky-100 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md shadow-sky-500/25">
                  <ScanLine className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
                  </span>
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                      Campus Gate Pass
                    </p>
                    <span className="inline-block rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-800 uppercase tracking-wider">
                      One-Tap
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                    {dayScholar
                      ? "Show it at the gate when you arrive and when you leave"
                      : "Outing QR for outings · Leave QR when going home on leave"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => openQr(QR_PURPOSE.OUTING)}
                title="Tap to display your outing QR code"
                className="group relative inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-600 via-sky-500 to-cyan-500 px-5 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-sky-500/30 hover:shadow-xl hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ring-2 ring-white overflow-hidden"
              >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <QrCode className="h-4 w-4 text-white animate-pulse shrink-0" />
                <span className="relative z-10">{dayScholar ? "Gate QR" : "Outing QR"}</span>
                <ArrowUpRight className="h-4 w-4 relative z-10 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
              {!dayScholar && <button
                type="button"
                onClick={() => openQr(QR_PURPOSE.LEAVE)}
                title="Tap to display your leave QR code"
                className="group relative inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 px-5 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-fuchsia-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ring-2 ring-white overflow-hidden"
              >
                <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <Home className="h-4 w-4 text-white shrink-0" />
                <span className="relative z-10">Leave QR</span>
              </button>}
              </div>
            </div>
          </section>

          {overdueOuting && (
            <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-rose-200 bg-rose-50/90 px-5 py-4 text-rose-900 shadow-sm backdrop-blur-sm sd-enter sm:flex-row sm:items-center">
              <Bell className="h-5 w-5 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Your outing is overdue</p>
                <p className="text-sm text-rose-700">
                  Your expected return time has passed. If you are delayed, inform the hostel immediately.
                </p>
              </div>
              <Link
                href="/dashboard/student/delay-notice"
                className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-center text-sm font-bold text-white shadow-md transition hover:bg-rose-700 active:scale-95"
              >
                Report delay
              </Link>
            </div>
          )}

          {pushPermission === "default" && !pushBannerDismissed && (
            <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/90 px-5 py-4 text-indigo-900 shadow-sm backdrop-blur-sm sd-enter sm:flex-row sm:items-center">
              <Bell className="h-5 w-5 shrink-0 text-indigo-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable outing alerts</p>
                <p className="text-sm text-indigo-700">
                  Allow browser notifications so SafeExit can alert you if your expected return time passes.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={pushEnabling}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
                >
                  {pushEnabling ? "Enabling…" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => setPushBannerDismissed(true)}
                  className="rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100"
                  title="Later"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {pushPermission === "denied" && !pushBannerDismissed && (
            <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-amber-900 shadow-sm backdrop-blur-sm sd-enter sm:flex-row sm:items-center">
              <BellOff className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Outing alerts are blocked</p>
                <p className="text-sm text-amber-700">
                  Allow notifications for this site in your browser settings to receive overdue return alerts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPushBannerDismissed(true)}
                className="self-end rounded-xl p-2 text-amber-400 transition hover:bg-amber-100 sm:self-auto"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Location permission priming — so the SOS flow isn't interrupted by
              the browser's location prompt during an emergency. */}
          {locPermission === "prompt" && !locBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: "0.15s" }}>
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-500 animate-bounce" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable location for SOS</p>
                <p className="text-sm text-rose-700">Allow location access now so that in an emergency your exact spot reaches the caretaker instantly</p>
              </div>
              <button
                onClick={handleEnableLocation}
                disabled={locEnabling}
                className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 active:scale-95 disabled:opacity-60"
              >
                {locEnabling ? "Enabling…" : "Enable"}
              </button>
              <button
                onClick={() => setLocBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100"
                title="Later"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {locPermission === "insecure" && !locBannerDismissed && (
            <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-amber-800 shadow-sm backdrop-blur-sm sd-enter sm:flex-row sm:items-center" style={{ animationDelay: "0.15s" }}>
              <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 sm:mt-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Location requires HTTPS</p>
                <p className="text-sm text-amber-700">
                  SOS alerts cannot attach your live GPS location over an insecure connection (HTTP). Please access this portal over HTTPS to enable location sharing.
                </p>
              </div>
              {typeof window !== "undefined" && window.location.protocol === "http:" && (
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.protocol = "https:";
                    window.location.href = url.toString();
                  }}
                  className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 active:scale-95"
                >
                  Switch to HTTPS
                </button>
              )}
              <button
                type="button"
                onClick={() => setLocBannerDismissed(true)}
                className="shrink-0 self-end rounded-xl p-2 text-amber-400 transition hover:bg-amber-100 sm:self-auto"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {locPermission === "denied" && !locBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-amber-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: "0.15s" }}>
              <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Location is blocked</p>
                <p className="text-sm text-amber-700">SOS alerts will be sent without your location. To share it in an emergency, allow location for this site in your browser settings.</p>
              </div>
              <button
                type="button"
                onClick={() => setLocBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-amber-400 transition hover:bg-amber-100"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <section className="sd-luxe-panel sd-enter mt-4 rounded-4xl p-4 shadow-xl sm:mt-6 sm:p-7" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-kicker">Quick Actions</p>
                  <h2 className="sd-title sd-title-sm mt-1 sm:mt-2">Everything at a glance</h2>
                </div>
              <span className="sd-tag">
                <span className="sd-tag-dot" />
                Ready
              </span>
            </div>
            {/* Phones: two-up compact launchers — 5 tiles fill 2/2/1, the last sitting
                alone in the left column. From sm the lead tile spans both columns so
                there's no orphan; from lg it's 5-across. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
              {visibleActions.map((action, index) => (
                <ActionCard key={action.title} action={action} index={index} featured={index === 0} />
              ))}
            </div>
          </section>

          <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-passport sd-enter flex flex-col lg:flex-row" style={{ animationDelay: "0.28s" }}>
              <div className="sd-passport-grid" aria-hidden="true" />
              <div className="sd-passport-sheen" aria-hidden="true" />

              {/* Boarding-pass body: identity + travel-style data fields */}
              <div className="relative z-[1] flex-1 p-4 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                      <Fingerprint className="h-6 w-6 text-cyan-300" />
                    </span>
                    <div>
                      <p className="sd-passport-eyebrow">NITP-SafeExit · Permanent Student QR</p>
                      <p className="mt-1 text-[0.72rem] font-semibold tracking-wide text-slate-400">
                        Campus gate authorization
                      </p>
                    </div>
                  </div>
                  <span className={`sd-passport-chip ${onLeave || latestApproved ? "" : "sd-passport-chip--idle"}`}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {onLeave ? "On Leave" : latestApproved ? "Pass Active" : "Standby"}
                  </span>
                </div>

                <h3 className="sd-passport-name mt-4 sm:mt-7">{profile.name}</h3>
                <p className="mt-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {profile.subtitle}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:mt-7 sm:gap-y-4">
                  <div>
                    <p className="sd-passport-label">Roll No</p>
                    <p className="sd-passport-value">{profile.rollNo}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="sd-passport-label">Room / Hostel</p>
                    <p className="sd-passport-value truncate">{profile.hostel}</p>
                  </div>
                  <div>
                    <p className="sd-passport-label">Next return by</p>
                    <p className="sd-passport-value">
                      {onLeave ? formatLeaveDay(onLeave.returnDate) : latestApproved ? formatClock(latestApproved.inTime) : "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="sd-passport-label">Mobile</p>
                    <p className="sd-passport-value truncate">{profile.mobile || "—"}</p>
                  </div>
                </div>

                {/* Caretaker contact strip — only when phone is on record */}
                {hostelContact?.caretaker?.phoneNumber && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 sm:mt-4">
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-slate-400 shrink-0">Caretaker</span>
                    <span className="mx-1.5 h-3 w-px bg-white/20 shrink-0" aria-hidden="true" />
                    <span className="truncate text-[0.72rem] font-semibold text-slate-300">
                      {hostelContact.caretaker.name}
                    </span>
                    <a
                      href={`tel:${hostelContact.caretaker.phoneNumber}`}
                      className="ml-auto shrink-0 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[0.7rem] font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                      📞 {hostelContact.caretaker.phoneNumber}
                    </a>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3 sm:mt-8">
                  <MagneticButton
                    type="button"
                    onClick={() => openQr(QR_PURPOSE.OUTING)}
                    className="sd-btn-glow inline-flex w-fit items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-lg shadow-cyan-500/25 cursor-pointer"
                  >
                    <QrCode className="h-5 w-5" />
                    {dayScholar ? "Gate QR" : "Outing QR"}
                  </MagneticButton>
                  {!dayScholar && <MagneticButton
                    type="button"
                    onClick={() => openQr(QR_PURPOSE.LEAVE)}
                    className="sd-btn-glow inline-flex w-fit items-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-lg shadow-purple-500/25 cursor-pointer"
                  >
                    <Home className="h-5 w-5" />
                    Leave QR
                  </MagneticButton>}
                </div>
              </div>

              {/* Torn perforation between body and QR stub */}
              <div className="sd-seam-h lg:hidden" aria-hidden="true" />
              <div className="hidden lg:block sd-seam-v" aria-hidden="true" />

              {/* Detachable stub carrying the scannable QR */}
              <div className="relative z-[1] flex flex-col items-center justify-center gap-3 p-4 sm:gap-4 sm:p-8 lg:w-[250px]">
                <p className="sd-passport-eyebrow flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5 text-cyan-300" />
                  {dayScholar ? "Gate QR · scan at gate" : "Outing QR · scan at gate"}
                </p>
                <button
                  type="button"
                  onClick={() => openQr(QR_PURPOSE.OUTING)}
                  title="Enlarge QR pass"
                  className="sd-stub-qr sd-luxe-tilt cursor-pointer"
                  style={{ colorScheme: "only light", backgroundColor: "#ffffff" }}
                >
                  <QRCode value={qrValue} size={148} bgColor="#FFFFFF" fgColor="#000000" className="h-[148px] w-[148px]" style={{ colorScheme: "only light" }} />
                </button>
                <div className="sd-barcode w-full max-w-[190px]" aria-hidden="true" />
                <p className="font-mono text-[0.62rem] tracking-[0.35em] text-slate-400">
                  {qrRollNo || "NITP-SAFEEXIT"}
                </p>
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-5 rounded-4xl p-4 shadow-xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-kicker">Recent</p>
                  <h2 className="sd-title sd-title-sm mt-1 sm:mt-2">Your Outings</h2>
                </div>
                <Link
                  href="/dashboard/student/my-outings"
                  className="group inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  View all
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
              <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
                {outingsLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="sd-row animate-pulse" style={{ opacity: 1 - i * 0.22 }}>
                        <div className="space-y-2">
                          <div className="h-3.5 w-32 rounded-full bg-slate-200" />
                          <div className="h-2.5 w-24 rounded-full bg-slate-100" />
                        </div>
                        <div className="h-6 w-16 rounded-full bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : outings.length === 0 ? (
                  <div className="sd-empty py-4 sm:py-8">
                    <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center sm:mb-5 sm:h-16 sm:w-16">
                      <span className="sd-ring" aria-hidden="true" />
                      <span className="sd-ring sd-ring--2" aria-hidden="true" />
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 sm:h-12 sm:w-12">
                        <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                    </div>
                    <p className="sd-card-title text-slate-700 text-[0.95rem]">No outings yet</p>
                    <p className="sd-micro mt-1 max-w-xs mx-auto">Show your QR at the main gate to go out.</p>
                  </div>
                ) : (
                  outings.slice(0, 3).map((outing, i) => {
                    const badge = outingBadge(outing);
                    return (
                      <div
                        key={outing.id}
                        className="sd-row sd-luxe-rise"
                        style={{ animationDelay: `${0.15 + i * 0.06}s` }}
                      >
                        <span
                          className="sd-row__accent"
                          style={{ "--accent": outingAccent(outing) }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="sd-card-title text-slate-900 text-[0.95rem] truncate">{outing.place}</p>
                          <p className="sd-micro mt-0.5 flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                            {outing.date} · {outing.time}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-4 shadow-xl sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-kicker">Overview</p>
                  <h2 className="sd-title sd-title-sm mt-1 sm:mt-2">Activity Stats</h2>
                </div>
                <span className="sd-tag">
                  <Activity className="h-3.5 w-3.5 text-indigo-500" />
                  Live
                </span>
              </div>
              <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
                {stats.map((stat) => (
                  <StatCard key={stat.label} stat={stat} />
                ))}
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-4 shadow-xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-kicker">Timeline</p>
                  <h2 className="sd-title sd-title-sm mt-1 sm:mt-2">Today’s Movement</h2>
                </div>
                <span className="sd-tag">
                  <span className="sd-tag-dot" />
                  Auto sync
                </span>
              </div>
              <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
                {timeline.length === 0 ? (
                  <div className="sd-empty py-5 sm:py-10">
                    <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center sm:mb-5 sm:h-16 sm:w-16">
                      <span className="sd-ring" aria-hidden="true" />
                      <span className="sd-ring sd-ring--2" aria-hidden="true" />
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/30 sm:h-12 sm:w-12">
                        <Clock3 className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                    </div>
                    <p className="sd-card-title text-slate-700 text-[0.95rem]">Nothing in motion</p>
                    <p className="sd-micro mt-1 max-w-xs mx-auto">
                      Your movement updates appear here once the gate logs your exit.
                    </p>
                  </div>
                ) : (
                  timeline.map((event, i) => (
                    <div
                      key={event.title}
                      className="sd-row sd-timeline-item sd-luxe-rise"
                      style={{ animationDelay: `${0.1 + i * 0.07}s` }}
                    >
                      <div>
                        <p className="sd-card-title text-slate-900 text-[0.95rem]">{event.title}</p>
                        <p className="sd-micro mt-0.5">{event.meta}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${event.tone}`}>Active</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Bottom bar: floating on phones, inline panel on desktop.
              Column count tracks navItems.length so no track is left empty. */}
          <nav className="sd-luxe-panel sd-luxe-rise fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-0.5 rounded-3xl p-1.5 backdrop-blur md:static md:inset-x-auto md:mt-6 md:gap-1 md:rounded-4xl md:p-3">
            {visibleNavItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`sd-navx ${item.active ? "sd-navx--active" : ""}`}
              >
                <span className="sd-navx__icon">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="sd-navx__label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <StudentQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        profile={profile}
        initialPurpose={qrPurpose}
      />

      {showPhotoModal && (
        <div
          onPointerDown={handleBackdropPointerDown}
          onClick={backdropCloseHandler(closePhotoModal)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800"
        >
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
                {cropSrc ? "Adjust Your Photo" : profile.photo ? "Your Profile Photo" : "Add Profile Photo"}
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xs mx-auto">
                {cropSrc
                  ? "Drag to reposition, use the slider to zoom, then confirm."
                  : profile.photo
                    ? "Security guards use this photo to verify your identity at the gate."
                    : "Security guards use this photo to verify your identity at the gate. Choose a clear, recent face photo."}
              </p>

              {profile.photo ? (
                <>
                  <div className="mt-6 w-36 h-36 rounded-full overflow-hidden ring-4 ring-indigo-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={profile.photo} alt={profile.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="mt-5 flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                    <Lock className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Your photo is locked.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePhotoModal}
                    className="mt-6 w-full py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </>
              ) : cropSrc ? (
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

                  <p className="mt-4 text-[11px] font-semibold text-amber-700 leading-snug">
                    Once saved, your photo is locked.
                  </p>

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
                      disabled={savingPhoto || !photoDraft}
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

      {showEditProfileModal && (
        <div
          onPointerDown={handleBackdropPointerDown}
          onClick={backdropCloseHandler(closeEditProfileModal)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800"
        >
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    profile.profileUnlocked ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600"
                  }`}
                >
                  {profile.profileUnlocked ? <Unlock className="w-5 h-5" /> : <IdCard className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="font-sora text-lg font-bold text-slate-900 leading-snug">
                    {profile.profileUnlocked ? "Edit Student Details" : "Student Profile"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {profile.profileUnlocked
                      ? "Annual update open — you can save once"
                      : "Official profile details registered on campus"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditProfileModal}
                disabled={savingProfile}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Institutional Identity (Always Read-Only) */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Institutional Identity</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    <Lock size={10} /> Verified / Tamper-Proof
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Student Name</span>
                    <span className="font-bold text-slate-800 text-sm truncate block">{profile.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Roll Number / ID</span>
                    <span className="font-mono font-bold text-slate-800 text-sm truncate block">{profile.rollNo}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[11px]">Institute Email</span>
                    <span className="font-mono text-slate-700 truncate block">{profile.email}</span>
                  </div>
                </div>
              </div>

              {profileSaveSuccess && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  {profileSaveSuccess}
                </div>
              )}

              {profileSaveError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800">
                  {profileSaveError}
                </div>
              )}

              {profile.profileUnlocked ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Academic Year <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={editForm.year}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, year: e.target.value }))}
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Select current year</option>
                        <option value="1st">1st Year</option>
                        <option value="2nd">2nd Year</option>
                        <option value="3rd">3rd Year</option>
                        <option value="4th">4th Year</option>
                        <option value="5th">5th Year</option>
                        <option value="M.Tech">M.Tech</option>
                        <option value="MCA">MCA</option>
                        <option value="PhD">PhD</option>
                      </select>
                      {profile.year && (
                        <p className="mt-1 text-[11px] text-slate-500">Previously: {profile.year}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Department / Branch
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CSE, ECE, ME"
                        value={editForm.department}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Where do you live? <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={editForm.residency}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            residency: e.target.value,
                            // Choosing a hostel again starts from a clean pick.
                            ...(e.target.value === RESIDENCY.DAY_SCHOLAR ? { hostelName: "", roomNumber: "" } : {}),
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value={RESIDENCY.HOSTEL}>In a campus hostel</option>
                        <option value={RESIDENCY.DAY_SCHOLAR}>Day scholar (I live at home)</option>
                      </select>
                      {editForm.residency !== (profile.residency || RESIDENCY.HOSTEL) && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {editForm.residency === RESIDENCY.DAY_SCHOLAR
                            ? "As a day scholar the gate only logs your entry and exit: no outings, no return time and no leave applications."
                            : "Pick your hostel and room. Outings and leave work as for every hostel student."}
                        </p>
                      )}
                    </div>

                    {editForm.residency !== RESIDENCY.DAY_SCHOLAR && <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Hostel Block
                      </label>
                      <select
                        value={editForm.hostelName}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, hostelName: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Select Hostel</option>
                        {HOSTELS.filter((h) => !profile.gender || h.gender === profile.gender).map((h) => (
                          <option key={h.name} value={h.name}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Room Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 214"
                        value={editForm.roomNumber}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, roomNumber: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    </>}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Student Mobile <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile"
                        value={editForm.phoneNumber}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Parent / Guardian Mobile <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile"
                        value={editForm.guardianPhoneNumber}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, guardianPhoneNumber: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-[11px] text-amber-800 leading-relaxed">
                    <strong>Notice:</strong> Submitting this form will automatically lock your profile again. Make sure your year, room, and contact details are accurate.
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeEditProfileModal}
                      disabled={savingProfile}
                      className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex-[2] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                    >
                      {savingProfile ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Saving & Locking...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Save & Lock Profile
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-slate-400 block text-[11px]">Academic Year</span>
                      <span className="font-bold text-slate-800 text-sm">{profile.year || profile.subtitle || "—"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-slate-400 block text-[11px]">Department / Branch</span>
                      <span className="font-bold text-slate-800 text-sm">{profile.department || "—"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-slate-400 block text-[11px]">Hostel & Room</span>
                      <span className="font-bold text-slate-800 text-sm">{profile.hostel || "—"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-slate-400 block text-[11px]">Student Mobile</span>
                      <span className="font-bold text-slate-800 text-sm">{profile.mobile || "—"}</span>
                    </div>
                    <div className="col-span-1 sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <span className="text-slate-400 block text-[11px]">Parent / Guardian Mobile</span>
                      <span className="font-bold text-slate-800 text-sm">{profile.guardianPhoneNumber || "Not on file"}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs text-indigo-900 leading-relaxed flex items-start gap-3">
                    <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Profile Details are Locked</strong>
                      To protect outing, gate access, and emergency verification records, student details can only be edited when unlocked by College Administration or Warden.
                      If you were promoted to the next academic year or moved to a different room, request an admin unlock.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeEditProfileModal}
                    className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SignatureSetupModal
        open={showSignatureModal}
        currentSignature={profile?.signature || null}
        title={profile?.signature ? "Your signature" : "Add your signature"}
        description="Draw it or upload a photo — it is attached automatically to your outing and leave requests."
        onClose={() => setShowSignatureModal(false)}
        onSaved={(signature) => {
          setProfile((prev) => ({ ...prev, signature }));
          setStoredUser({ ...getStoredUser(), hasSignature: true });
          setShowSignatureModal(false);
        }}
      />
    </main>
  );
}
