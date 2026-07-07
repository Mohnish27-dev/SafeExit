"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  User,
  Phone,
  ArrowRight,
  Fingerprint,
  CheckCircle,
  AlertCircle,
  Headphones,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";

// Guards have no college email, so we synthesize a stable one from the Guard ID.
// The backend keys every account + passkey login on `email`, and the ID is unique
// per guard, so this gives each guard a consistent server identity.
const buildGuardEmail = (guardId) =>
  `${guardId.trim().toLowerCase().replace(/\s+/g, "")}@guard.safeexit.local`;

export default function SecurityLoginPage() {
  const router = useRouter();

  // App States
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Details, 2: Quick Login
  const [storedProfile, setStoredProfile] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    fullName: "",
    guardId: "",
    phoneNumber: "",
  });

  // Status
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Check if a guard is already registered on this device
    const isRegistered = localStorage.getItem("safeexit_guard_registered");
    const profile = localStorage.getItem("safeexit_guard_profile");

    if (isRegistered === "true" && profile) {
      setStoredProfile(JSON.parse(profile));
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
    if (!formData.fullName.trim()) {
      setErrorMsg("Please enter your full name.");
      return false;
    }
    if (!formData.guardId.trim()) {
      setErrorMsg("Please enter your Guard ID.");
      return false;
    }
    if (formData.phoneNumber.replace(/\D/g, "").length < 10) {
      setErrorMsg("Please enter a valid 10-digit phone number.");
      return false;
    }
    setErrorMsg("");
    return true;
  };

  const submitStep1 = (e) => {
    e.preventDefault();
    if (!validateStep1()) return;
    // Persist the details so step 2 (and any retry) can read them back.
    localStorage.setItem("safeexit_guard_profile", JSON.stringify(formData));
    setOnboardingStep(2);
  };

  // Shared helper: create the backend account. Returns the auth token.
  const registerGuardAccount = async (profile) => {
    const email = buildGuardEmail(profile.guardId);
    const registerRes = await fetch("/api/backend/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.fullName,
        email,
        password: profile.guardId, // Default password (ID) for simplicity
        role: "Guard",
        studentId: profile.guardId,
        phoneNumber: profile.phoneNumber,
      }),
    });

    // A 400 "User already exists" is fine — the guard registered before on
    // another device; we just need a token to attach a passkey to this device.
    if (!registerRes.ok) {
      const data = await registerRes.json().catch(() => ({}));
      if (registerRes.status === 400 && /exists/i.test(data.message || "")) {
        const loginRes = await fetch("/api/backend/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: profile.guardId }),
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

  const persistGuardSession = (profile) => {
    setStoredUser({
      name: profile.fullName,
      role: "security",
      roleLabel: "Security Guard",
      id: profile.guardId,
      email: buildGuardEmail(profile.guardId),
      mobile: profile.phoneNumber,
    });
  };

  const setupWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_guard_profile"));

      // 1. Create the account (or sign in if it already exists) to get a JWT.
      const token = await registerGuardAccount(profile);
      sessionStorage.setItem("safeexit_token", token);

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

      localStorage.setItem("safeexit_guard_registered", "true");
      persistGuardSession(profile);
      router.push("/dashboard/security");
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
      const profile = JSON.parse(localStorage.getItem("safeexit_guard_profile"));
      const token = await registerGuardAccount(profile);
      sessionStorage.setItem("safeexit_token", token);
      persistGuardSession(profile);
      router.push("/dashboard/security");
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
      const email = buildGuardEmail(storedProfile.guardId);

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

  const resetToOnboarding = () => {
    localStorage.removeItem("safeexit_guard_registered");
    localStorage.removeItem("safeexit_guard_profile");
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({ fullName: "", guardId: "", phoneNumber: "" });
    setErrorMsg("");
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
              Safe<span className="text-indigo-600">Exit</span>
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
            // ── RETURNING GUARD: biometric quick login ──
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
              <p className="text-sm text-slate-500 mb-8">
                Use your fingerprint or face to securely login to your dashboard.
              </p>

              {errorMsg && (
                <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleBiometricLogin}
                disabled={isProcessing}
                className="w-full relative group overflow-hidden flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold text-[15px] shadow-xl shadow-slate-900/20 hover:shadow-slate-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:scale-100"
              >
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                {isProcessing ? (
                  <span className="flex items-center gap-2 relative z-10">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2 relative z-10">
                    <Fingerprint className="w-6 h-6" />
                    Login with Passkey
                  </span>
                )}
              </button>

              <button
                onClick={resetToOnboarding}
                className="mt-6 text-sm text-slate-400 hover:text-indigo-600 transition-colors"
              >
                Not {storedProfile?.fullName?.split(" ")[0]}? Sign in as someone else
              </button>
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
                      Please fill in your details to setup your profile.
                    </p>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Full Name</label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <User className="h-[18px] w-[18px]" />
                      </div>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      This name will appear on your dashboard.
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

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Phone Number</label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <Phone className="h-[18px] w-[18px]" />
                      </div>
                      <input
                        type="tel"
                        name="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        inputMode="numeric"
                        placeholder="10-digit number"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      Used for important security notifications.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 hover:shadow-xl hover:shadow-indigo-600/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200"
                  >
                    Continue <ArrowRight className="h-[18px] w-[18px]" />
                  </button>
                </form>
              )}

              {/* STEP 2: WebAuthn Setup (no photo step) */}
              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-10 h-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Enable Quick Login</h2>
                    <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                      Never type a password again! Use your device&apos;s fingerprint or face scan to log in securely next time.
                    </p>
                  </div>

                  <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600">
                        <Fingerprint className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800">Biometric Login</p>
                        <p className="text-xs text-slate-500">Fingerprint, FaceID, or Device PIN</p>
                      </div>
                      <div className="ml-auto text-emerald-500">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 text-left">
                      Your biometric data never leaves your device. We use modern WebAuthn standards for maximum security.
                    </p>
                  </div>

                  <button
                    onClick={setupWebAuthn}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:transform-none"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Setting up Passkey...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-5 h-5" />
                        Enable Fingerprint / FaceID
                      </>
                    )}
                  </button>

                  <button
                    onClick={skipWebAuthn}
                    disabled={isProcessing}
                    className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Maybe later, continue to dashboard
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
                Contact your administrator or warden for assistance.
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
          </div>
        </footer>
      </main>
    </div>
  );
}
