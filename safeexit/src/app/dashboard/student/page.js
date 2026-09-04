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
  ImageIcon,
  Loader2,
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
} from "@/app/lib/userProfile";
import { getTimeGreeting } from "@/app/lib/greeting";
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
import { HOSTELS } from "@/app/lib/hostels";
import {
  clampCropOffset,
  cropCoverScale,
  getCropSourceRect,
} from "@/app/lib/profilePhotoCrop.mjs";

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
    case "expired":
      return { label: outing?.status, className: "bg-rose-100 text-rose-700" };
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
    case "expired":
      return "#f43f5e"; 
    default:
      return "#f59e0b";
  }
};

const actions = [
  {
    title: "Make An Outing",
    description: "Request a café, meal, or market outing.",
    icon: Ticket,
    href: "/dashboard/student/generate-ticket",
    badge: "linear-gradient(145deg, #0f172a 0%, #4338ca 52%, #06b6d4 100%)",
    tint: "linear-gradient(160deg, rgba(67,56,202,0.13) 0%, rgba(6,182,212,0.09) 100%)",
    glow: "rgba(67,56,202,0.5)",
    border: "rgba(56,189,248,0.5)",
  },
  {
    title: "My Outings",
    description: "Track approvals, returns, and gate status.",
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

const navItems = [
  { label: "Home", icon: Home, href: "/dashboard/student", active: true },
  { label: "Outings", icon: ClipboardList, href: "/dashboard/student/my-outings" },
  { label: "New Pass", icon: Ticket, href: "/dashboard/student/generate-ticket" },
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
  const [outings, setOutings] = useState([]);
  const [outingsLoading, setOutingsLoading] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Browser push is separate from passkey/WebAuthn login and needs one explicit
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
    const storedProfile = getStoredUser();
    if (storedProfile?.name) {
      const normalized = normalizeStudentProfile(storedProfile);
      if (normalized.subtitle !== storedProfile.subtitle) {
        setStoredUser(normalized);
      }
      // Hydrate the browser-backed profile once the client mounts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(normalized);

      // Republish photo to the authenticated backend so the gate scanner can show it.
      if (normalized.photo) {
        apiFetch("/auth/profile", {
          method: "PATCH",
          body: JSON.stringify({ photo: normalized.photo }),
        }).catch((err) => console.error("Failed to publish profile photo", err));
      }
    }
    setMounted(true);
  }, []);

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

  // Approved outing/leave notices link here so the student lands directly on
  // the permanent identity QR they must present at the main gate.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("showQr") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    const openQr = window.setTimeout(() => setShowQrModal(true), 0);
    return () => window.clearTimeout(openQr);
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

  // Sync rollNo + Mongo _id from the backend (localStorage can be stale; scanner resolves by _id first).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch("/auth/profile");
        if (cancelled || !me) return;
        // Restore both server-backed media fields after every login path; sessionStorage
        // carries only the signature flag and may not contain the photo.
        setProfile((prev) => {
          const next = {
            ...prev,
            ...(me.studentId ? { rollNo: me.studentId, sid: me._id } : null),
            gender: me.gender || prev.gender || "",
            hostelName: me.hostelName || prev.hostelName || "",
            photo: me.photo || prev.photo || null,
            signature: me.signature || null,
          };
          const stored = getStoredUser();
          if (stored) {
            setStoredUser({
              ...stored,
              ...next,
              hostel: next.hostelName
                ? `Block ${next.hostelName}${stored.room ? `, Room ${stored.room}` : ""}`
                : stored.hostel,
            });
          }
          return next;
        });
      } catch {
        /* not authenticated — keep local profile */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // background=true skips the loading state so polls update silently.
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
          isOverdue: Boolean(o.isOverdue),
          returnPunctuality: o.returnPunctuality || null,
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
  }, []);

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

  const qrRollNo = useMemo(() => {
    const roll = profile.rollNo && profile.rollNo !== defaultStudentProfile.rollNo ? profile.rollNo : "";
    if (roll) return roll;
    // Fallback: a non-email id is the roll number; never fabricate or use "—".
    const id = profile.id;
    if (!id || id === defaultStudentProfile.id || String(id).includes("@")) return "";
    return id;
  }, [profile]);

  // Identity-only QR — no outing status, so a replayed screenshot can't smuggle a stale "Approved".
  const qrValue = useMemo(() => {
    const data = {
      id: qrRollNo,
      sid: profile.sid || undefined, // Mongo _id; scanner resolves by this first
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
        key: "approved",
        label: "Approved",
        value: String(approvedCount),
        width: pct(approvedCount, outings.length || 1),
        icon: CheckCircle2,
        fill: "linear-gradient(90deg, #059669, #10b981, #34d399)",
        chip: "linear-gradient(135deg, #047857, #10b981)",
        glow: "rgba(16,185,129,0.45)",
      },
      {
        key: "return",
        label: "Next return by",
        value: latestApproved ? formatClock(latestApproved.inTime) : "—",
        width: latestApproved ? "80%" : "8%",
        icon: Clock3,
        fill: "linear-gradient(90deg, #4338ca, #6366f1, #a855f7)",
        chip: "linear-gradient(135deg, #4338ca, #7c3aed)",
        glow: "rgba(99,102,241,0.45)",
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

      // Sync the on-device onboarding blob so quick-login keeps the latest photo.
      try {
        const existing = JSON.parse(localStorage.getItem("safeexit_user_profile") || "null") || {};
        localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...existing, photo: nextPhoto }));
      } catch {
        /* best-effort — device storage may be full or unavailable */
      }

      // Republish to the authenticated backend so the new photo shows at the gate immediately.
      apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ photo: nextPhoto }),
      }).catch((err) => console.error("Failed to publish profile photo", err));

      setShowPhotoModal(false);
      setPhotoDraft(null);
    } catch (err) {
      setPhotoError("Couldn't process that image. Please try a different photo.");
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
      const merged = {
        ...getStoredUser(),
        hostelName: updated.hostelName,
        gender: updated.gender,
      };
      setStoredUser(merged);
      setProfile((prev) => ({
        ...prev,
        hostelName: updated.hostelName,
        gender: updated.gender,
      }));
    } catch (err) {
      setHostelError(err?.message || "Couldn't save your hostel. Please try again.");
    } finally {
      setSavingHostel(false);
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
                title="Your Signature"
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 shadow-sm transition hover:bg-indigo-50 sm:h-[3.25rem]"
              >
                {profile.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.signature} alt="Signature" className="h-6 w-auto" />
                ) : (
                  <PenLine className="h-5 w-5 text-indigo-500" />
                )}
              </button>
              {/* Whole chip is the photo-change target — the 24px camera badge alone was
                  too small to hit reliably on a phone. */}
              <button
                type="button"
                onClick={openPhotoModal}
                title="Change profile photo"
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
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900 text-base">{profile.name}</span>
                  <span className="block text-sm text-slate-500">{profile.subtitle}</span>
                </span>
                <span className="sr-only">Change profile photo</span>
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

          {/* Not dismissable: until a hostel is on record the caretaker's roster and Out Now
              board can't see this student, so skipping it would silently break gate oversight. */}
          {mounted && hostelSynced && !profile.hostelName && (
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
                    {latestApproved
                      ? latestApproved.isOverdue
                        ? `Your expected return time of ${formatClock(latestApproved.inTime)} has passed. Please report your delay and return safely.`
                        : latestApproved.status === "Out"
                          ? `You're outside campus until ${formatClock(latestApproved.inTime)}. Show this same permanent QR at the main gate to log your entry when you return.`
                        : `Your pass is approved. Show your permanent QR at the main gate to log your exit; return by ${formatClock(latestApproved.inTime)}.`
                      : "No active pass right now. Generate an outing ticket or send an alert from the quick actions below."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                        overdueOuting
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : latestApproved
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full animate-pulse ${
                          overdueOuting ? "bg-rose-500" : latestApproved ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      {overdueOuting ? "Return overdue" : latestApproved ? "Pass active" : "On campus"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-600">
                      <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                      {outings.length} total {outings.length === 1 ? "outing" : "outings"}
                    </span>
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

          {locPermission === "denied" && !locBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-amber-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: "0.15s" }}>
              <MapPinOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Location is blocked</p>
                <p className="text-sm text-amber-700">SOS alerts will be sent without your location. To share it in an emergency, allow location for this site in your browser settings.</p>
              </div>
              <button
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
              {actions.map((action, index) => (
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
                  <span className={`sd-passport-chip ${latestApproved ? "" : "sd-passport-chip--idle"}`}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {latestApproved ? "Pass Active" : "Standby"}
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
                      {latestApproved ? formatClock(latestApproved.inTime) : "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="sd-passport-label">Mobile</p>
                    <p className="sd-passport-value truncate">{profile.mobile || "—"}</p>
                  </div>
                </div>

                <MagneticButton
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="sd-btn-glow mt-5 inline-flex w-fit items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-lg shadow-cyan-500/25 cursor-pointer sm:mt-8"
                >
                  <QrCode className="h-5 w-5" />
                  Show Permanent QR
                </MagneticButton>
              </div>

              {/* Torn perforation between body and QR stub */}
              <div className="sd-seam-h lg:hidden" aria-hidden="true" />
              <div className="hidden lg:block sd-seam-v" aria-hidden="true" />

              {/* Detachable stub carrying the scannable QR */}
              <div className="relative z-[1] flex flex-col items-center justify-center gap-3 p-4 sm:gap-4 sm:p-8 lg:w-[250px]">
                <p className="sd-passport-eyebrow flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5 text-cyan-300" />
                  Scan permanent QR at gate
                </p>
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  title="Enlarge QR pass"
                  className="sd-stub-qr sd-luxe-tilt cursor-pointer"
                >
                  <QRCode value={qrValue} size={148} className="h-[148px] w-[148px]" />
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
                    <p className="sd-micro mt-1 max-w-xs mx-auto">Generate an outing ticket to get started.</p>
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
                      Your movement updates appear here once a pass is approved.
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
            {navItems.map((item) => (
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

      {showQrModal && (
        <div
          onPointerDown={handleBackdropPointerDown}
          onClick={backdropCloseHandler(() => setShowQrModal(false))}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-800"
        >
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

              <h2 className="font-sora text-xl font-bold text-slate-800 leading-snug">Your Permanent Student QR</h2>
              <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xs mx-auto">
                Show this QR to security at the campus main gate. Your entry or exit is logged only after it is scanned.
                The QR on your college ID card works at the gate too.
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
      
      <SignatureSetupModal
        open={showSignatureModal}
        currentSignature={profile?.signature || null}
        title={profile?.signature ? "Update your signature" : "Add your signature"}
        description="Draw it or upload a photo — it is attached automatically to everything you approve."
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
