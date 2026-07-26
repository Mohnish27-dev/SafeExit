"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  ArrowRight,
  ShieldCheck,
  Fingerprint,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";
import { makeQuickLogin } from "@/app/lib/quickLogin";

// Wardens have no email — the normalized Warden ID IS the backend loginId
const buildWardenLoginId = (wardenId) =>
  wardenId.trim().toLowerCase().replace(/\s+/g, "");

// Own localStorage namespace so it never collides with student/guard logins
const quick = makeQuickLogin({
  pinKey: "safeexit_quick_pin_warden",
  labelKey: "safeexit_quick_label_warden",
  profileKey: "safeexit_warden_profile",
  webauthnKey: "safeexit_webauthn_registered_warden",
});

export default function WardenLoginPage() {
  const router = useRouter();

  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Details, 2: Quick Login setup
  const [storedProfile, setStoredProfile] = useState(null);

  const [formData, setFormData] = useState({ wardenId: "", pin: "" });

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
    const profileRaw = localStorage.getItem("safeexit_warden_profile");
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
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const validateStep1 = () => {
    if (!formData.wardenId.trim() || formData.pin.trim().length < 4) {
      setErrorMsg("Please enter your Warden ID and PIN.");
      return false;
    }
    setErrorMsg("");
    return true;
  };

  // Wardens are admin-provisioned, not self-registered
  const loginWardenAccount = async (loginId, pin) => {
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
          ? "Account not found or PIN incorrect. Ask your administrator to provision or reset your warden account."
          : data.message || "Login failed."
      );
    }
    // Defence in depth: keep non-warden accounts off the warden dashboard
    if (data.role !== "Warden") {
      throw new Error("This account is not authorized for warden access.");
    }
    return data;
  };

  const persistWardenSession = (profile) => {
    setStoredUser({
      name: profile.fullName,
      role: "warden",
      roleLabel: "Warden",
      id: profile.wardenId,
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
    localStorage.setItem("safeexit_webauthn_registered_warden", "true");
  };

  // STEP 1: authenticate with ID + admin PIN, then move to Quick Login setup.
  const submitStep1 = async (e) => {
    e.preventDefault();
    if (!validateStep1()) return;
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const loginId = buildWardenLoginId(formData.wardenId);
      const data = await loginWardenAccount(loginId, formData.pin);
      sessionStorage.setItem("safeexit_token", data.token);

      // Persist the ID for the returning-user path — never the admin PIN in plaintext
      const profile = { wardenId: formData.wardenId, fullName: data.name };
      localStorage.setItem("safeexit_warden_profile", JSON.stringify(profile));
      setStoredProfile(profile);
      persistWardenSession(profile);

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
      const profile = JSON.parse(localStorage.getItem("safeexit_warden_profile"));
      // Lock the admin PIN behind the Quick Login PIN
      await quick.setQuickPin(quickPin, pendingSecret, profile.wardenId);

      if (enableBiometric && !quick.hasBiometric()) {
        await enrollBiometric(sessionToken);
      }

      persistWardenSession(profile);
      router.push("/dashboard/warden");
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

      const loginId = buildWardenLoginId(storedProfile.wardenId);
      const data = await loginWardenAccount(loginId, secret);
      sessionStorage.setItem("safeexit_token", data.token);

      persistWardenSession(storedProfile);
      router.push("/dashboard/warden");
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
      const loginId = buildWardenLoginId(storedProfile.wardenId);

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

      persistWardenSession(storedProfile);
      router.push("/dashboard/warden");
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] via-[#efe8ff] to-[#e9e2ff] relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image src="/images/login/hostel-bg.png" alt="" fill sizes="100vw" className="object-cover opacity-[0.18] pointer-events-none select-none" priority />
      </div>
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-20 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl z-0" />

      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 sm:py-8 animate-fade-in-up">
        <Link href="/" className="flex flex-col items-center gap-1.5 group mb-4 sm:mb-6">
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Shield className="h-7 w-7" />
          </div>
          <div className="text-center">
            <span className="font-sans text-2xl font-bold tracking-tight text-slate-900">Safe<span className="text-indigo-600">Exit</span></span>
            <p className="text-[11px] font-medium text-slate-500 tracking-wide">Secure Access. Safer Campuses.</p>
          </div>
        </Link>

        {appState === "RETURNING_USER" ? (
          // RETURNING CARETAKER
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-8 flex flex-col items-center text-center animate-fade-in-up">
            <div className="relative w-24 h-24 mb-6">
               <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 animate-pulse opacity-20"></div>
               <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg relative z-10 text-indigo-500">
                  <User className="w-10 h-10" />
               </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back, Warden 👋</h1>
            <p className="text-sm text-slate-500 mb-6">
              Enter your 4-digit login PIN{quickLabel ? <> for <span className="font-semibold text-slate-700">{quickLabel}</span></> : null}.
            </p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}

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
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Signing in…</>
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
          <div className="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 overflow-hidden animate-fade-in-up">

            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
               <div className={`flex items-center gap-2 ${onboardingStep >= 1 ? "text-indigo-600" : "text-slate-400"}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 1 ? "bg-indigo-100" : "bg-slate-200"}`}>1</div>
                 <span className="text-xs font-semibold hidden sm:inline">Details</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 2 ? "bg-indigo-600" : "bg-slate-200"}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 2 ? "text-indigo-600" : "text-slate-400"}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 2 ? "bg-indigo-100" : "bg-slate-200"}`}>2</div>
                 <span className="text-xs font-semibold hidden sm:inline">Quick Login</span>
               </div>
            </div>

            <div className="p-6 sm:p-8">
              {errorMsg && (
                <div className="mb-6 bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              )}

              {onboardingStep === 1 && (
                <form onSubmit={submitStep1} className="space-y-4 animate-fade-in-up">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-900">Warden Login</h2>
                    <p className="text-sm text-slate-500 mt-1">Sign in with the Warden ID and PIN issued by your administrator.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Warden ID</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ShieldCheck className="w-4 h-4" /></div>
                        <input type="text" name="wardenId" value={formData.wardenId} onChange={handleInputChange}  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">PIN</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Fingerprint className="w-4 h-4" /></div>
                        <input type="password" name="pin" value={formData.pin} onChange={handleInputChange} placeholder="Enter your PIN" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={isProcessing} className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70">
                    {isProcessing ? "Signing in…" : (<>Continue <ArrowRight className="w-4 h-4" /></>)}
                  </button>
                </form>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-1"><ShieldCheck className="w-10 h-10" /></div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Set up Quick Login</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Create a 4-digit PIN to sign in fast next time. Add your fingerprint or face for even quicker access — it&apos;s optional.</p>
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

                   <button onClick={submitQuickSetup} disabled={isProcessing} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:transform-none">
                     {isProcessing ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Setting up…</>) : (<><ShieldCheck className="w-5 h-5" /> Enable Quick Login</>)}
                   </button>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
