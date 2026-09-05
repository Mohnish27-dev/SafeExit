"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  User,
  ArrowRight,
  Fingerprint,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Headphones,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import TeamCreditLink from "@/app/components/TeamCreditLink";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";
import { makeQuickLogin } from "@/app/lib/quickLogin";

// Guards have no email — the normalized Guard ID IS the backend loginId
const buildGuardLoginId = (guardId) =>
  guardId.trim().toLowerCase().replace(/\s+/g, "");

// Own localStorage namespace so it never collides with student/caretaker logins
const quick = makeQuickLogin({
  pinKey: "safeexit_quick_pin_guard",
  labelKey: "safeexit_quick_label_guard",
  profileKey: "safeexit_guard_profile",
  webauthnKey: "safeexit_guard_registered",
});

export default function SecurityLoginPage() {
  const router = useRouter();

  // App States
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Details, 2: Quick Login setup
  const [storedProfile, setStoredProfile] = useState(null);

  const [formData, setFormData] = useState({
    guardId: "",
    pin: "",
  });

  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [quickPin, setQuickPin] = useState("");
  const [confirmQuickPin, setConfirmQuickPin] = useState("");
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);
  // Admin-issued PIN captured at step 1, locked behind the Quick Login PIN
  const [pendingSecret, setPendingSecret] = useState("");
  const [sessionToken, setSessionToken] = useState(null);

  const [loginPin, setLoginPin] = useState("");
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [hasBio, setHasBio] = useState(false);
  const [quickLabel, setQuickLabel] = useState("");

  useEffect(() => {
    const profileRaw = localStorage.getItem("safeexit_guard_profile");
    if (profileRaw && quick.hasQuickPin()) {
      try {
        setStoredProfile(JSON.parse(profileRaw));
      } catch {
        setStoredProfile(null);
      }
      setHasBio(quick.hasBiometric());
      setQuickLabel(quick.getQuickLabel());
      setAppState("RETURNING_USER");
    } else {
      setAppState("ONBOARDING");
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep1 = () => {
    if (!formData.guardId.trim()) {
      setErrorMsg("Please enter your Guard ID.");
      return false;
    }
    if (formData.pin.trim().length < 4) {
      setErrorMsg("Please enter your PIN.");
      return false;
    }
    setErrorMsg("");
    return true;
  };

  // Guards are admin-provisioned, not self-registered
  const loginGuardAccount = async (loginId, pin) => {
    const res = await fetch("/api/backend/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password: pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        res.status === 401
          ? "Account not found or PIN incorrect. Ask your administrator to provision or reset your guard account."
          : data.message || "Login failed."
      );
    }
    // Defence in depth: keep non-guard accounts off the guard dashboard
    if (data.role !== "Guard") {
      throw new Error("This account is not authorized for guard access.");
    }
    return data;
  };

  const persistGuardSession = (profile) => {
    setStoredUser({
      name: profile.fullName,
      role: "security",
      roleLabel: "Security Guard",
      id: profile.guardId,
      // Staff are identified by ID, not email
    });
  };

  const enrollBiometric = async (token) => {
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const optionsRes = await fetch("/api/backend/auth/webauthn/register/options", {
      method: "POST",
      credentials: "include",
      headers: authHeaders,
    });
    if (!optionsRes.ok) throw new Error("Could not start passkey setup");
    const optionsJSON = await optionsRes.json();

    const attResp = await startRegistration({ optionsJSON });

    const verifyRes = await fetch("/api/backend/auth/webauthn/register/verify", {
      method: "POST",
      credentials: "include",
      headers: authHeaders,
      body: JSON.stringify(attResp),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.verified) {
      throw new Error(verifyData.message || "Passkey verification failed");
    }
    localStorage.setItem("safeexit_guard_registered", "true");
  };

  // STEP 1: authenticate with ID + admin PIN, then move to Quick Login setup.
  const submitStep1 = async (e) => {
    e.preventDefault();
    if (!validateStep1()) return;
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const loginId = buildGuardLoginId(formData.guardId);
      const data = await loginGuardAccount(loginId, formData.pin);
      sessionStorage.setItem("safeexit_token", data.token);

      // Persist the ID for the returning-user path — never the admin PIN in plaintext
      const profile = { guardId: formData.guardId, fullName: data.name };
      localStorage.setItem("safeexit_guard_profile", JSON.stringify(profile));
      setStoredProfile(profile);
      persistGuardSession(profile);

      setPendingSecret(formData.pin);
      setSessionToken(data.token);
      setQuickPin("");
      setConfirmQuickPin("");
      setEnableBiometric(false);
      setOnboardingStep(2);
    } catch (err) {
      setErrorMsg(err?.message || "Login failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 2: enrol a 4-digit Quick Login PIN (+ optional biometric), then go in.
  const submitQuickSetup = async () => {
    if (!/^\d{4}$/.test(quickPin)) {
      setErrorMsg("Please set a 4-digit numeric PIN.");
      return;
    }
    if (quickPin !== confirmQuickPin) {
      setErrorMsg("The PINs you entered do not match.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_guard_profile"));
      // Lock the admin PIN behind the Quick Login PIN
      await quick.setQuickPin(quickPin, pendingSecret, profile.guardId);

      if (enableBiometric && !quick.hasBiometric()) {
        await enrollBiometric(sessionToken);
      }

      persistGuardSession(profile);
      router.push("/dashboard/security");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setErrorMsg("Biometric setup was cancelled. Your PIN is saved — press Enable again to finish, or turn off biometrics.");
      } else if (err?.name === "InvalidStateError") {
        setErrorMsg("A passkey already exists on this device for this account. Turn off biometrics to continue.");
      } else {
        setErrorMsg(err?.message || "Couldn't finish Quick Login setup. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // RETURNING: decrypt the admin PIN with the 4-digit PIN, then auth
  const handlePinLogin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(loginPin)) {
      setErrorMsg("Please enter your 4-digit PIN.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const secret = await quick.verifyQuickPin(loginPin);
      if (!secret) throw new Error("Incorrect PIN. Please try again.");

      const loginId = buildGuardLoginId(storedProfile.guardId);
      const data = await loginGuardAccount(loginId, secret);
      sessionStorage.setItem("safeexit_token", data.token);

      persistGuardSession(storedProfile);
      router.push("/dashboard/security");
    } catch (err) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const loginId = buildGuardLoginId(storedProfile.guardId);

      const optionsRes = await fetch("/api/backend/auth/webauthn/login/options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId }),
      });
      if (!optionsRes.ok) {
        throw new Error("No passkey found for this account on the server.");
      }
      const optionsJSON = await optionsRes.json();

      const asseResp = await startAuthentication({ optionsJSON });

      const verifyRes = await fetch("/api/backend/auth/webauthn/login/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, response: asseResp }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(data.message || "Biometric login failed on server.");
      }
      sessionStorage.setItem("safeexit_token", data.token);

      persistGuardSession(storedProfile);
      router.push("/dashboard/security");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setErrorMsg("Login was cancelled or timed out. Please try again.");
      } else {
        setErrorMsg(err?.message || "Biometric login failed.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (appState === "LOADING") return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] to-[#e9e2ff] relative overflow-hidden animate-fade-in-up">
      {/* ── Full-page background image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/login/hostel-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-[0.18] pointer-events-none select-none"
          priority
        />
      </div>

      {/* Ambient glow shapes */}
      <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-24 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl z-0" />

      {/* Gradient overlays top & bottom */}
      <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-[#f0f0ff] to-transparent z-[1]" />
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#e8e0ff] to-transparent z-[1]" />

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-4 sm:px-8 pt-6 pb-2 flex items-center justify-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-11 w-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 group-hover:shadow-indigo-600/50 transition-shadow">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <span className="font-sans text-xl font-bold tracking-tight text-slate-900">
              NITP-Safe<span className="text-indigo-600">Exit</span>
            </span>
            <p className="text-[10px] font-medium text-slate-500 -mt-0.5 tracking-wide">
              Secure Access. Safer Campuses.
            </p>
          </div>
        </Link>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pb-6 pt-2">
        {/* Character illustration with float animation */}
        <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] mb-[-44px] z-20 animate-float">
          <div className="absolute inset-0 rounded-full bg-white/60 shadow-[0_30px_60px_-35px_rgba(59,7,100,0.6)]" />
          <Image
            src="/images/login/security-guard.png"
            alt="Security Guard"
            fill
            sizes="(min-width: 640px) 220px, 200px"
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Icon badge overlapping between illustration and card */}
        <div className="relative z-30 mb-[-22px]">
          <div className="h-11 w-11 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-lg ring-4 ring-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        {/* ── WHITE CARD ── */}
        <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-slate-200/60 px-6 sm:px-8 pt-10 pb-7 relative z-10">
          {appState === "RETURNING_USER" ? (
            // ── RETURNING GUARD: Quick Login with PIN (+ passkey if enrolled) ──
            <div className="flex flex-col items-center text-center animate-fade-in-up">
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 animate-pulse opacity-20" />
                <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg relative z-10 text-indigo-600">
                  <User className="w-10 h-10" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Welcome Back, {storedProfile?.fullName?.split(" ")[0]} 👋
              </h1>
              <p className="text-sm text-slate-500 mb-6">
                Enter your 4-digit login PIN{quickLabel ? <> for <span className="font-semibold text-slate-700">{quickLabel}</span></> : null}.
              </p>

              {errorMsg && (
                <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">
                  {errorMsg}
                </p>
              )}

              <form onSubmit={handlePinLogin} className="w-full space-y-4">
                <div className="relative">
                  <input
                    type={showLoginPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={4}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    autoComplete="off"
                    autoFocus
                    className="w-full text-center text-3xl font-bold tracking-[0.6em] py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPin((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showLoginPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || loginPin.length < 4}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 hover:shadow-xl hover:shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                  ) : (
                    <>Login <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              {/* Optional biometric */}
              {hasBio && (
                <button
                  onClick={handleBiometricLogin}
                  disabled={isProcessing}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-70"
                >
                  <Fingerprint className="w-5 h-5 text-indigo-600" /> Use fingerprint / FaceID
                </button>
              )}
            </div>
          ) : (
            // ── ONBOARDING FLOW ──
            <div className="animate-fade-in-up">
              {/* Progress Bar */}
              <div className="flex items-center justify-between mb-6">
                <div className={`flex items-center gap-2 ${onboardingStep >= 1 ? "text-indigo-600" : "text-slate-400"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 1 ? "bg-indigo-100" : "bg-slate-200"}`}>1</div>
                  <span className="text-xs font-semibold hidden sm:inline">Details</span>
                </div>
                <div className={`h-px flex-1 mx-2 ${onboardingStep >= 2 ? "bg-indigo-600" : "bg-slate-200"}`} />
                <div className={`flex items-center gap-2 ${onboardingStep >= 2 ? "text-indigo-600" : "text-slate-400"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 2 ? "bg-indigo-100" : "bg-slate-200"}`}>2</div>
                  <span className="text-xs font-semibold hidden sm:inline">Quick Login</span>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-5 bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              )}

              {/* STEP 1: Details */}
              {onboardingStep === 1 && (
                <form onSubmit={submitStep1} className="space-y-5 animate-fade-in-up">
                  <div className="text-center mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                      Guard Login
                    </h1>
                    <p className="text-sm text-slate-500 mt-1.5">
                      Sign in with the Guard ID and PIN issued by your administrator.
                    </p>
                  </div>

                  {/* Guard ID */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Guard ID</label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <ShieldCheck className="h-[18px] w-[18px]" />
                      </div>
                      <input
                        type="text"
                        name="guardId"
                        value={formData.guardId}
                        onChange={handleInputChange}
                        placeholder="Enter your Guard ID"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      Use the unique Guard ID provided by your institution.
                    </p>
                  </div>

                  {/* PIN */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">PIN</label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <Fingerprint className="h-[18px] w-[18px]" />
                      </div>
                      <input
                        type="password"
                        name="pin"
                        value={formData.pin}
                        onChange={handleInputChange}
                        placeholder="Enter your PIN"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      Set by your administrator. Forgot it? Ask them to reset it.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 hover:shadow-xl hover:shadow-indigo-600/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200 disabled:opacity-70"
                  >
                    {isProcessing ? "Signing in…" : (<>Continue <ArrowRight className="h-[18px] w-[18px]" /></>)}
                  </button>
                </form>
              )}

              {/* STEP 2: Quick Login setup (4-digit PIN + optional biometric) */}
              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-10 h-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Set up Quick Login</h2>
                    <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                      Create a 4-digit PIN to sign in fast next time. Add your fingerprint or face for even quicker access — it&apos;s optional.
                    </p>
                  </div>

                  <div className="w-full space-y-4 text-left">
                    {/* Create PIN */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Create 4-digit PIN</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><KeyRound className="w-4 h-4" /></div>
                        <input
                          type={showSetupPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={4}
                          value={quickPin}
                          onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="••••"
                          autoComplete="off"
                          className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold tracking-[0.4em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-[0.4em] focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                        />
                        <button type="button" onClick={() => setShowSetupPin((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                          {showSetupPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm PIN */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Confirm PIN</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><KeyRound className="w-4 h-4" /></div>
                        <input
                          type={showSetupPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={4}
                          value={confirmQuickPin}
                          onChange={(e) => setConfirmQuickPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="••••"
                          autoComplete="off"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold tracking-[0.4em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-[0.4em] focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                        />
                      </div>
                    </div>

                    {/* Optional biometric toggle */}
                    <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600 shrink-0"><Fingerprint className="w-5 h-5" /></div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Biometric Authentication</p>
                          <p className="text-xs text-slate-500">Optional — Fingerprint / FaceID</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enableBiometric}
                        onClick={() => setEnableBiometric((v) => !v)}
                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${enableBiometric ? "bg-indigo-600" : "bg-slate-300"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${enableBiometric ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={submitQuickSetup}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:transform-none"
                  >
                    {isProcessing ? (
                      <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Setting up…</>
                    ) : (
                      <><ShieldCheck className="w-5 h-5" /> Enable Quick Login</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Need Help? divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Need Help?
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Help Card */}
          <div className="bg-indigo-50/70 border border-indigo-100/80 rounded-xl px-4 py-3.5 flex items-center gap-3.5 hover:bg-indigo-50 transition-colors duration-300 group cursor-default">
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Facing issues logging in?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Contact your administrator or caretaker for assistance.
              </p>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="mt-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full border border-slate-300 flex items-center justify-center text-slate-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Your actions are logged and monitored for security.
            </p>
            <p className="text-xs font-semibold text-indigo-600">
              Thank you for keeping the campus safe!
            </p>
            {/* Once quick login is on, this page — not /login — is where a
                returning guard lands, so the team credit lives here too. */}
            <TeamCreditLink className="mt-2" />
          </div>
        </footer>
      </main>
    </div>
  );
}
