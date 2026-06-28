"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  ArrowRight,
  ShieldCheck,
  Fingerprint,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";

// Admins have no college email, so we synthesize a stable one from the Admin ID.
// The backend keys every account + passkey login on `email`, and the ID is unique
// per admin, so this gives each admin a consistent server identity.
const buildAdminEmail = (adminId) =>
  `${adminId.trim().toLowerCase().replace(/\s+/g, "")}@admin.safeexit.local`;

export default function AdminLoginPage() {
  const router = useRouter();

  // App state: returning admin or onboarding
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Details, 2: Quick Login
  const [storedProfile, setStoredProfile] = useState(null);

  const [formData, setFormData] = useState({ fullName: "", adminId: "", pin: "" });

  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const isRegistered = localStorage.getItem("safeexit_webauthn_registered_admin");
    const profile = localStorage.getItem("safeexit_admin_profile");
    if (isRegistered === "true" && profile) {
      setStoredProfile(JSON.parse(profile));
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
    if (!formData.fullName.trim() || !formData.adminId.trim() || formData.pin.trim().length !== 4) {
      setErrorMsg("Please fill name, Admin ID and 4-digit PIN.");
      return false;
    }
    setErrorMsg("");
    return true;
  };

  const submitStep1 = (e) => {
    e.preventDefault();
    if (!validateStep1()) return;
    localStorage.setItem("safeexit_admin_profile", JSON.stringify(formData));
    setOnboardingStep(2);
  };

  // Shared helper: create the backend account. Returns the auth token.
  const registerAdminAccount = async (profile) => {
    const email = buildAdminEmail(profile.adminId);
    const registerRes = await fetch("/api/backend/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.fullName,
        email,
        password: profile.pin, // 4-digit PIN doubles as the account password
        role: "Admin",
        studentId: profile.adminId,
      }),
    });

    // A 400 "User already exists" is fine — the admin registered before on
    // another device; we just need a token to attach a passkey to this device.
    if (!registerRes.ok) {
      const data = await registerRes.json().catch(() => ({}));
      if (registerRes.status === 400 && /exists/i.test(data.message || "")) {
        const loginRes = await fetch("/api/backend/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: profile.pin }),
        });
        if (!loginRes.ok) throw new Error("Account exists. Could not sign in to add a passkey.");
        const loginData = await loginRes.json();
        return loginData.token;
      }
      throw new Error(data.message || "Registration failed");
    }

    const registerData = await registerRes.json();
    return registerData.token;
  };

  const persistAdminSession = (profile) => {
    setStoredUser({
      name: profile.fullName,
      role: "admin",
      roleLabel: "Administrator",
      id: profile.adminId,
      email: buildAdminEmail(profile.adminId),
    });
  };

  const setupWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_admin_profile"));

      // 1. Create the account (or sign in if it already exists) to get a JWT.
      const token = await registerAdminAccount(profile);
      localStorage.setItem("safeexit_token", token);

      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // 2. Ask the server for a registration challenge.
      const optionsRes = await fetch("/api/backend/auth/webauthn/register/options", {
        method: "POST",
        credentials: "include",
        headers: authHeaders,
      });
      if (!optionsRes.ok) throw new Error("Could not start passkey setup");
      const optionsJSON = await optionsRes.json();

      // 3. Prompt the platform authenticator (fingerprint / FaceID).
      const attResp = await startRegistration({ optionsJSON });

      // 4. Send the signed attestation back for cryptographic verification.
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

      localStorage.setItem("safeexit_webauthn_registered_admin", "true");
      persistAdminSession(profile);
      router.push("/dashboard/admin");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setErrorMsg("Passkey setup was cancelled or timed out. Please try again.");
      } else if (err?.name === "InvalidStateError") {
        setErrorMsg("A passkey is already registered on this device for this account.");
      } else {
        setErrorMsg(err?.message || "Failed to setup Quick Login. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const skipWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_admin_profile"));
      const token = await registerAdminAccount(profile);
      localStorage.setItem("safeexit_token", token);
      persistAdminSession(profile);
      router.push("/dashboard/admin");
    } catch (err) {
      setErrorMsg(err?.message || "Could not continue. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const email = buildAdminEmail(storedProfile.adminId);

      // 1. Get an authentication challenge scoped to this account's passkeys.
      const optionsRes = await fetch("/api/backend/auth/webauthn/login/options", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!optionsRes.ok) {
        throw new Error("No passkey found for this account on the server.");
      }
      const optionsJSON = await optionsRes.json();

      // 2. Prompt the authenticator to sign the challenge.
      const asseResp = await startAuthentication({ optionsJSON });

      // 3. Server verifies the signature and issues a session token.
      const verifyRes = await fetch("/api/backend/auth/webauthn/login/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, response: asseResp }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(data.message || "Biometric login failed on server.");
      }
      localStorage.setItem("safeexit_token", data.token);

      persistAdminSession(storedProfile);
      router.push("/dashboard/admin");
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

  const resetToOnboarding = () => {
    localStorage.removeItem("safeexit_webauthn_registered_admin");
    localStorage.removeItem("safeexit_admin_profile");
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({ fullName: "", adminId: "", pin: "" });
    setErrorMsg("");
  };

  if (appState === "LOADING") return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#eef2ff] via-[#e8ecff] to-[#e2e8ff] relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image src="/images/login/hostel-bg.png" alt="" fill sizes="100vw" className="object-cover opacity-[0.18] pointer-events-none select-none" priority />
      </div>
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-20 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl z-0" />

      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 sm:py-8 animate-fade-in-up">
        <Link href="/" className="flex flex-col items-center gap-1.5 group mb-4 sm:mb-6">
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Shield className="h-7 w-7" />
          </div>
          <div className="text-center">
            <span className="font-sans text-2xl font-bold tracking-tight text-slate-900">Safe<span className="text-indigo-600">Exit</span></span>
            <p className="text-[11px] font-medium text-slate-500 tracking-wide">Admin Console · Command Center</p>
          </div>
        </Link>

        {appState === "RETURNING_USER" ? (
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-8 flex flex-col items-center text-center animate-fade-in-up">
            <div className="relative w-24 h-24 mb-6">
               <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 animate-pulse opacity-20"></div>
               <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg relative z-10 text-indigo-500">
                  <ShieldCheck className="w-10 h-10" />
               </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back, {storedProfile?.fullName?.split(" ")[0]} 👋</h1>
            <p className="text-sm text-slate-500 mb-8">Use your fingerprint or face to securely access the admin console.</p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}

            <button onClick={handleBiometricLogin} disabled={isProcessing} className="w-full relative group overflow-hidden flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold text-[15px] shadow-xl shadow-slate-900/20 hover:shadow-slate-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:scale-100">
               <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
               {isProcessing ? (
                 <span className="flex items-center gap-2 relative z-10">
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                   Authenticating...
                 </span>
               ) : (
                 <span className="flex items-center gap-2 relative z-10">
                   <Fingerprint className="w-6 h-6" />
                   Login with Passkey
                 </span>
               )}
            </button>

            <button onClick={resetToOnboarding} className="mt-6 text-sm text-slate-400 hover:text-indigo-600 transition-colors">Not {storedProfile?.fullName?.split(" ")[0]}? Sign in as someone else</button>
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
                    <h2 className="text-2xl font-bold text-slate-900">Admin Registration</h2>
                    <p className="text-sm text-slate-500 mt-1">Please fill in your details to setup the admin console.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><User className="w-4 h-4" /></div>
                        <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} placeholder="E.g. Arjun Rao" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Admin ID</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ShieldCheck className="w-4 h-4" /></div>
                        <input type="text" name="adminId" value={formData.adminId} onChange={handleInputChange} placeholder="E.g. ADM001" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">4-Digit PIN</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Fingerprint className="w-4 h-4" /></div>
                        <input type="password" name="pin" value={formData.pin} onChange={(e) => setFormData(p => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0,4) }))} placeholder="4-digit PIN" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-2"><ShieldCheck className="w-10 h-10" /></div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Enable Quick Login</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Never type a password again! Use your device&apos;s fingerprint or face scan to log in securely next time.</p>
                   </div>

                   <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 my-2">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600"><Fingerprint className="w-5 h-5" /></div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-800">Biometric Login</p>
                          <p className="text-xs text-slate-500">Fingerprint, FaceID, or Device PIN</p>
                        </div>
                        <div className="ml-auto text-emerald-500"><CheckCircle className="w-5 h-5" /></div>
                     </div>
                     <p className="text-xs text-slate-500 text-left">Your biometric data never leaves your device. We use modern WebAuthn standards for maximum security.</p>
                   </div>

                   <button onClick={setupWebAuthn} disabled={isProcessing} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:transform-none">
                     {isProcessing ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Setting up Passkey...</>) : (<><Fingerprint className="w-5 h-5" /> Enable Fingerprint / FaceID</>)}
                   </button>

                   <button onClick={skipWebAuthn} disabled={isProcessing} className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50">Maybe later, continue to console</button>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
