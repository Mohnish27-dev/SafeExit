"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  LockKeyhole,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { apiFetch } from "@/app/lib/api";
import { getToken } from "@/app/lib/auth";
import { getStoredUser, setStoredUser } from "@/app/lib/userProfile";
import {
  CHIEF_WARDEN_WEBAUTHN_KEY,
  chiefWardenQuickLogin as quick,
  readRememberedChiefWarden,
  rememberChiefWardenProfile,
} from "@/app/lib/chiefWardenQuickLogin";

const normalizeStaffId = (value) => value.trim().toLowerCase().replace(/\s+/g, "");

export default function ChiefWardenLoginPage() {
  const router = useRouter();
  const [appState, setAppState] = useState("LOADING");
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [quickPin, setQuickPin] = useState("");
  const [confirmQuickPin, setConfirmQuickPin] = useState("");
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false);
  const [pendingSecret, setPendingSecret] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [quickLabel, setQuickLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getToken() && getStoredUser()?.role === "chief-warden") {
      router.replace("/dashboard/chief-warden");
      return;
    }

    const remembered = readRememberedChiefWarden();
    if (remembered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate device-local Quick Login state once
      setProfile(remembered);
      setHasBiometric(quick.hasBiometric());
      setQuickLabel(quick.getQuickLabel());
      setAppState("RETURNING_USER");
    } else {
      setAppState("ONBOARDING");
    }
  }, [router]);

  const persistSession = (storedProfile) => {
    setStoredUser({
      name: storedProfile.fullName,
      role: "chief-warden",
      roleLabel: "Chief Warden",
      id: storedProfile.staffId,
    });
  };

  const loginAccount = async (id, pin) => {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId: normalizeStaffId(id), password: pin }),
    });
    if (data.role !== "ChiefWarden") {
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
      throw new Error("This account is not authorized for Chief Warden access.");
    }
    return data;
  };

  const enrollPasskey = async (token) => {
    const headers = { Authorization: `Bearer ${token}` };
    const optionsJSON = await apiFetch("/auth/webauthn/register/options", { method: "POST", headers });
    const response = await startRegistration({ optionsJSON });
    const verification = await apiFetch("/auth/webauthn/register/verify", {
      method: "POST",
      headers,
      body: JSON.stringify(response),
    });
    if (!verification.verified) throw new Error("Passkey verification failed.");
    localStorage.setItem(CHIEF_WARDEN_WEBAUTHN_KEY, "true");
  };

  const submitAccountLogin = async (event) => {
    event.preventDefault();
    if (!staffId.trim() || adminPin.trim().length < 4) {
      setError("Enter the Chief Warden ID and PIN issued by the administrator.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await loginAccount(staffId, adminPin.trim());
      sessionStorage.setItem("safeexit_token", data.token);

      const nextProfile = { staffId: staffId.trim(), fullName: data.name };
      rememberChiefWardenProfile(nextProfile);
      setProfile(nextProfile);
      persistSession(nextProfile);
      setPendingSecret(adminPin.trim());
      setSessionToken(data.token);
      setQuickPin("");
      setConfirmQuickPin("");
      setEnableBiometric(false);
      setStep(2);
    } catch (err) {
      setError(err.message || "Could not sign in. Check the ID and PIN and try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitQuickSetup = async () => {
    if (!/^\d{4}$/.test(quickPin)) {
      setError("Create a 4-digit numeric Quick Login PIN.");
      return;
    }
    if (quickPin !== confirmQuickPin) {
      setError("The Quick Login PINs do not match.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await quick.setQuickPin(quickPin, pendingSecret, profile.staffId);
      // Re-write and verify the remembered profile only after the encrypted PIN
      // blob exists, so successful setup is atomic from the next visit's view.
      rememberChiefWardenProfile(profile);
      if (!readRememberedChiefWarden()) {
        throw new Error("This browser could not save Quick Login. Check that site storage is allowed and try again.");
      }
      if (enableBiometric && !quick.hasBiometric()) await enrollPasskey(sessionToken);
      persistSession(profile);
      router.replace("/dashboard/chief-warden");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setError("Passkey setup was cancelled. Your Quick PIN is saved; try again or turn off biometric authentication.");
      } else if (err?.name === "InvalidStateError") {
        setError("A passkey already exists for this account on this device. Turn off biometric authentication to continue.");
      } else {
        setError(err.message || "Could not finish Quick Login setup.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPinLogin = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(loginPin)) {
      setError("Enter your 4-digit Quick Login PIN.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const secret = await quick.verifyQuickPin(loginPin);
      if (!secret) throw new Error("Incorrect Quick Login PIN.");
      const data = await loginAccount(profile.staffId, secret);
      sessionStorage.setItem("safeexit_token", data.token);
      persistSession(profile);
      router.replace("/dashboard/chief-warden");
    } catch (err) {
      setError(err.message || "Quick Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const loginId = normalizeStaffId(profile.staffId);
      const optionsJSON = await apiFetch("/auth/webauthn/login/options", {
        method: "POST",
        body: JSON.stringify({ loginId }),
      });
      const response = await startAuthentication({ optionsJSON });
      const data = await apiFetch("/auth/webauthn/login/verify", {
        method: "POST",
        body: JSON.stringify({ loginId, response }),
      });
      if (data.role !== "ChiefWarden") throw new Error("This passkey is not authorized for Chief Warden access.");
      sessionStorage.setItem("safeexit_token", data.token);
      persistSession(profile);
      router.replace("/dashboard/chief-warden");
    } catch (err) {
      setError(err?.name === "NotAllowedError" ? "Passkey login was cancelled or timed out." : err.message || "Passkey login failed.");
    } finally {
      setLoading(false);
    }
  };

  const forgetDevice = () => {
    quick.clearQuickLogin({ forgetProfile: true });
    sessionStorage.removeItem("safeexit_token");
    sessionStorage.removeItem("safeexit:user");
    setProfile(null);
    setLoginPin("");
    setError("");
    setStep(1);
    setAppState("ONBOARDING");
  };

  if (appState === "LOADING") return null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
      <div className="absolute inset-0 opacity-40" aria-hidden="true">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
      </div>

      <section className="relative w-full max-w-md rounded-[2rem] border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur sm:p-9">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Back to roles
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-600 text-white shadow-lg"><Crown className="h-7 w-7" /></span>
          <div><p className="text-xs font-bold uppercase tracking-[0.28em] text-indigo-500">NITP-SafeExit</p><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Chief Warden</h1><p className="text-sm font-medium text-slate-500">Campus-wide hostel oversight</p></div>
        </div>

        {appState === "RETURNING_USER" ? (
          <div className="mt-7 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><User className="h-9 w-9" /></span>
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Welcome back, Chief Warden</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Enter your 4-digit Quick Login PIN{quickLabel ? <> for <b className="text-slate-700">{quickLabel}</b></> : null}.</p>

            {error && <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

            <form onSubmit={handleQuickPinLogin} className="mt-5 space-y-4">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input type={showLoginPin ? "text" : "password"} inputMode="numeric" maxLength={4} value={loginPin} onChange={(event) => setLoginPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" autoComplete="off" autoFocus className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-12 text-center text-2xl font-black tracking-[0.5em] text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100" />
                <button type="button" onClick={() => setShowLoginPin((value) => !value)} aria-label={showLoginPin ? "Hide PIN" : "Show PIN"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">{showLoginPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <button type="submit" disabled={loading || loginPin.length !== 4} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-600 px-4 py-3 font-bold text-white shadow-lg disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} Login</button>
            </form>

            {hasBiometric && <button type="button" onClick={handlePasskeyLogin} disabled={loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"><Fingerprint className="h-5 w-5" /> Use fingerprint / Face ID</button>}
            <button type="button" onClick={forgetDevice} className="mt-5 text-xs font-bold text-slate-400 hover:text-indigo-600">Use a different Chief Warden account</button>
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-5 flex items-center gap-2 text-xs font-bold">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${step >= 1 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>1</span><span className="text-slate-600">Account</span><span className={`h-0.5 flex-1 ${step >= 2 ? "bg-indigo-600" : "bg-slate-200"}`} /><span className={`flex h-7 w-7 items-center justify-center rounded-full ${step >= 2 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>2</span><span className="text-slate-600">Quick Login</span>
            </div>

            {error && <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

            {step === 1 ? (
              <form onSubmit={submitAccountLogin} className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"><Shield className="mt-0.5 h-4 w-4 shrink-0" /><p>Use the Chief Warden ID and PIN issued by an administrator.</p></div>
                <div><label htmlFor="chief-warden-id" className="text-xs font-bold uppercase tracking-wider text-slate-600">Chief Warden ID</label><input id="chief-warden-id" value={staffId} onChange={(event) => setStaffId(event.target.value)} autoComplete="username" placeholder="E.g. CWDN001" className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100" required /></div>
                <div><label htmlFor="chief-warden-pin" className="text-xs font-bold uppercase tracking-wider text-slate-600">Administrator-issued PIN</label><div className="relative mt-1.5"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="chief-warden-pin" type={showAdminPin ? "text" : "password"} value={adminPin} onChange={(event) => setAdminPin(event.target.value)} autoComplete="current-password" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-12 text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100" required /><button type="button" onClick={() => setShowAdminPin((value) => !value)} aria-label={showAdminPin ? "Hide PIN" : "Show PIN"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">{showAdminPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-600 px-4 py-3 font-bold text-white shadow-lg disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crown className="h-5 w-5" />} Continue</button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><ShieldCheck className="h-8 w-8" /></span><h2 className="mt-3 text-xl font-extrabold text-slate-900">Set up Quick Login</h2><p className="mt-1 text-sm text-slate-500">Create a device-only 4-digit PIN. Fingerprint or Face ID is optional.</p></div>
                <div><label className="text-xs font-bold uppercase tracking-wider text-slate-600">Create 4-digit PIN</label><div className="relative mt-1.5"><KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={showSetupPin ? "text" : "password"} inputMode="numeric" maxLength={4} value={quickPin} onChange={(event) => setQuickPin(event.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="new-password" style={{ color: "#0f172a", WebkitTextFillColor: "#0f172a", caretColor: "#4f46e5" }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-12 text-center text-xl font-black tracking-[0.4em] text-slate-900 selection:bg-indigo-600 selection:text-white outline-none focus:border-indigo-400 focus:bg-white" /><button type="button" onClick={() => setShowSetupPin((value) => !value)} aria-label={showSetupPin ? "Hide PIN" : "Show PIN"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">{showSetupPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                <div><label className="text-xs font-bold uppercase tracking-wider text-slate-600">Confirm PIN</label><div className="relative mt-1.5"><input type={showSetupPin ? "text" : "password"} inputMode="numeric" maxLength={4} value={confirmQuickPin} onChange={(event) => setConfirmQuickPin(event.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="new-password" style={{ color: "#0f172a", WebkitTextFillColor: "#0f172a", caretColor: "#4f46e5" }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-center text-xl font-black tracking-[0.4em] text-slate-900 selection:bg-indigo-600 selection:text-white outline-none focus:border-indigo-400 focus:bg-white" /><button type="button" onClick={() => setShowSetupPin((value) => !value)} aria-label={showSetupPin ? "Hide confirmation PIN" : "Show confirmation PIN"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100">{showSetupPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                <button type="button" role="switch" aria-checked={enableBiometric} onClick={() => setEnableBiometric((value) => !value)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-indigo-600 shadow"><Fingerprint className="h-5 w-5" /></span><span><b className="block text-sm text-slate-800">Biometric authentication</b><span className="text-xs text-slate-500">Optional · Fingerprint / Face ID</span></span></span><span className={`relative h-7 w-12 rounded-full transition ${enableBiometric ? "bg-indigo-600" : "bg-slate-300"}`}><span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${enableBiometric ? "translate-x-5" : ""}`} /></span></button>
                <button type="button" onClick={submitQuickSetup} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white shadow-lg disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} Enable Quick Login</button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
