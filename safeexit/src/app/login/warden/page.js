"use client";

<<<<<<< Updated upstream
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  ArrowRight,
  ShieldCheck,
  Camera,
  Fingerprint,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
=======
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
>>>>>>> Stashed changes
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";

// Warden accounts have no college email, so we synthesize a stable one from the
// Warden ID. The backend keys every account + passkey login on `email`, and the
// ID is unique per warden, so this gives each warden a consistent server identity.
const buildWardenEmail = (wardenId) =>
  `${wardenId.trim().toLowerCase().replace(/\s+/g, "")}@warden.safeexit.local`;

export default function WardenLoginPage() {
  const router = useRouter();

<<<<<<< Updated upstream
  // App state: returning warden or onboarding
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: details, 2: photo, 3: security
  const [storedProfile, setStoredProfile] = useState(null);

  // Form data for warden
  const [formData, setFormData] = useState({ fullName: "", wardenId: "", pin: "" });
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

=======
  // App States
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Details, 2: Quick Login
  const [storedProfile, setStoredProfile] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    fullName: "",
    wardenId: "",
    phoneNumber: "",
  });

  // Status
>>>>>>> Stashed changes
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
<<<<<<< Updated upstream
    const isRegistered = localStorage.getItem("safeexit_webauthn_registered_warden");
    const profile = localStorage.getItem("safeexit_warden_profile");
=======
    // Check if a warden is already registered on this device
    const isRegistered = localStorage.getItem("safeexit_warden_registered");
    const profile = localStorage.getItem("safeexit_warden_profile");

>>>>>>> Stashed changes
    if (isRegistered === "true" && profile) {
      setStoredProfile(JSON.parse(profile));
      setAppState("RETURNING_USER");
    } else {
      setAppState("ONBOARDING");
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
<<<<<<< Updated upstream
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const compressImage = (dataUrl, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve) => {
      if (!dataUrl) return resolve(null);
      const ImgConstructor = (typeof window !== 'undefined' && window.Image) ? window.Image : null;
      const img = ImgConstructor ? new ImgConstructor() : document.createElement('img');
      img.onload = () => {
        const ratio = img.width / img.height;
        const width = Math.min(img.width, maxWidth);
        const height = Math.round(width / ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const validateStep1 = () => {
    if (!formData.fullName.trim() || !formData.wardenId.trim() || formData.pin.trim().length !== 4) {
      setErrorMsg('Please fill name, Warden ID and 4-digit PIN.');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const submitStep1 = (e) => {
    e.preventDefault();
    if (validateStep1()) setOnboardingStep(2);
  };

  const skipOrSubmitPhoto = async () => {
    const profileToSave = { ...formData };
    try {
      if (photoPreview && typeof photoPreview === 'string' && photoPreview.startsWith('data:')) {
        const compressed = await compressImage(photoPreview, 800, 0.7);
        profileToSave.photo = compressed || null;
      } else {
        profileToSave.photo = null;
      }
      try { localStorage.setItem('safeexit_warden_profile', JSON.stringify(profileToSave)); } catch (e) {}
    } catch (err) {
      try { localStorage.setItem('safeexit_warden_profile', JSON.stringify({ ...formData, photo: null })); } catch (e) {}
    } finally {
      setOnboardingStep(3);
    }
  };

  const setupWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    try {
      if (window.PublicKeyCredential) {
        try {
          await navigator.credentials.create({ publicKey: { challenge: new Uint8Array(32), rp: { name: 'SafeExit', id: window.location.hostname }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: formData.wardenId, displayName: formData.fullName }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000 } });
        } catch (e) {
          console.log('WebAuthn create prompt dismissed or failed', e);
        }
      }

      await new Promise(r => setTimeout(r, 700));

      // Register on backend
      const profile = JSON.parse(localStorage.getItem('safeexit_warden_profile') || JSON.stringify({ name: formData.fullName, wardenId: formData.wardenId }));
      const registerRes = await fetch('/api/backend/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.fullName || formData.fullName, email: `${formData.wardenId.toLowerCase()}@college.edu`, password: formData.pin, role: 'Warden' })
      });
      if (!registerRes.ok) throw new Error('Registration failed');
      const registerData = await registerRes.json();
      const token = registerData.token;
      try { localStorage.setItem('safeexit_token', token); } catch (e) {}

      await fetch('/api/backend/auth/webauthn/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
      localStorage.setItem('safeexit_webauthn_registered_warden', 'true');

      setStoredUser({ name: profile.fullName || formData.fullName, role: 'warden', roleLabel: 'Warden', id: formData.wardenId });
      router.push('/dashboard/warden');
    } catch (err) {
      setErrorMsg('Failed to setup passkey.');
=======
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep1 = () => {
    if (!formData.fullName.trim()) {
      setErrorMsg("Please enter your full name.");
      return false;
    }
    if (!formData.wardenId.trim()) {
      setErrorMsg("Please enter your Warden ID.");
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
    localStorage.setItem("safeexit_warden_profile", JSON.stringify(formData));
    setOnboardingStep(2);
  };

  // Shared helper: create the backend account. Returns the auth token.
  const registerWardenAccount = async (profile) => {
    const email = buildWardenEmail(profile.wardenId);
    const registerRes = await fetch("/api/backend/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.fullName,
        email,
        password: profile.wardenId, // Default password (ID) for simplicity
        role: "Warden",
        studentId: profile.wardenId,
        phoneNumber: profile.phoneNumber,
      }),
    });

    // A 400 "User already exists" is fine — the warden registered before on
    // another device; we just need a token to attach a passkey to this device.
    if (!registerRes.ok) {
      const data = await registerRes.json().catch(() => ({}));
      if (registerRes.status === 400 && /exists/i.test(data.message || "")) {
        const loginRes = await fetch("/api/backend/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: profile.wardenId }),
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

  const persistWardenSession = (profile) => {
    setStoredUser({
      name: profile.fullName,
      role: "warden",
      roleLabel: "Warden",
      id: profile.wardenId,
      email: buildWardenEmail(profile.wardenId),
      mobile: profile.phoneNumber,
    });
  };

  const setupWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_warden_profile"));

      // 1. Create the account (or sign in if it already exists) to get a JWT.
      const token = await registerWardenAccount(profile);
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

      localStorage.setItem("safeexit_warden_registered", "true");
      persistWardenSession(profile);
      router.push("/dashboard/warden");
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
      const profile = JSON.parse(localStorage.getItem("safeexit_warden_profile"));
      const token = await registerWardenAccount(profile);
      localStorage.setItem("safeexit_token", token);
      persistWardenSession(profile);
      router.push("/dashboard/warden");
    } catch (err) {
      setErrorMsg(err?.message || "Could not continue. Please try again.");
>>>>>>> Stashed changes
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsProcessing(true);
<<<<<<< Updated upstream
    setErrorMsg('');
    try {
      if (window.PublicKeyCredential) {
        try { await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), rpId: window.location.hostname, userVerification: 'required' } }); } catch (e) { console.log('WebAuthn get dismissed', e); }
      }
      await new Promise(r => setTimeout(r, 400));
      const email = `${storedProfile?.wardenId?.toLowerCase() || formData.wardenId.toLowerCase()}@college.edu`;
      const verifyRes = await fetch('/api/backend/auth/webauthn/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!verifyRes.ok) throw new Error('Verify failed');
      const data = await verifyRes.json();
      try { localStorage.setItem('safeexit_token', data.token); } catch (e) {}
      setStoredUser({ name: data.name || storedProfile?.fullName || formData.fullName, role: data.role || 'warden', roleLabel: 'Warden', id: formData.wardenId });
      router.push('/dashboard/warden');
    } catch (e) {
      setErrorMsg('Biometric login failed.');
=======
    setErrorMsg("");
    try {
      const email = buildWardenEmail(storedProfile.wardenId);

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

      persistWardenSession(storedProfile);
      router.push("/dashboard/warden");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setErrorMsg("Login was cancelled or timed out. Please try again.");
      } else {
        setErrorMsg(err?.message || "Biometric login failed.");
      }
>>>>>>> Stashed changes
    } finally {
      setIsProcessing(false);
    }
  };

  const resetToOnboarding = () => {
<<<<<<< Updated upstream
    localStorage.removeItem('safeexit_webauthn_registered_warden');
    localStorage.removeItem('safeexit_warden_profile');
    setAppState('ONBOARDING');
    setOnboardingStep(1);
    setFormData({ fullName: '', wardenId: '', pin: '' });
    setPhotoPreview(null);
  };

  if (appState === 'LOADING') return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] via-[#efe8ff] to-[#e9e2ff] relative overflow-hidden">
=======
    localStorage.removeItem("safeexit_warden_registered");
    localStorage.removeItem("safeexit_warden_profile");
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({ fullName: "", wardenId: "", phoneNumber: "" });
    setErrorMsg("");
  };

  if (appState === "LOADING") return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] to-[#e9e2ff] relative overflow-hidden animate-fade-in-up">
      {/* ── Full-page background image ── */}
>>>>>>> Stashed changes
      <div className="absolute inset-0 z-0">
        <Image src="/images/login/hostel-bg.png" alt="" fill className="object-cover opacity-[0.18] pointer-events-none select-none" priority />
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

<<<<<<< Updated upstream
        {appState === 'RETURNING_USER' ? (
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-8 flex flex-col items-center text-center animate-fade-in-up">
            <div className="relative w-24 h-24 mb-6">
               <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 animate-pulse opacity-20"></div>
               {storedProfile?.photo ? (
                 <img src={storedProfile.photo} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg relative z-10" />
               ) : (
                 <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg relative z-10 text-indigo-500">
                    <User className="w-10 h-10" />
                 </div>
               )}
=======
      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pb-6 pt-2">
        {/* Warden character illustration */}
        <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] mb-[-44px] z-20 animate-float">
          <div className="absolute inset-0 rounded-full bg-white/60 shadow-[0_30px_60px_-35px_rgba(59,7,100,0.6)]" />
          <Image
            src="/images/login/warden.png"
            alt="Warden"
            fill
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Shield badge overlapping illustration and card */}
        <div className="relative z-30 mb-[-22px]">
          <div className="h-11 w-11 rounded-full bg-violet-700 flex items-center justify-center text-white shadow-lg ring-4 ring-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        {/* ── WHITE CARD ── */}
        <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-2xl shadow-violet-900/10 border border-slate-200/60 px-6 sm:px-8 pt-10 pb-7 relative z-10">
          {appState === "RETURNING_USER" ? (
            // ── RETURNING WARDEN: biometric quick login ──
            <div className="flex flex-col items-center text-center animate-fade-in-up">
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-500 to-purple-500 animate-pulse opacity-20" />
                <div className="w-24 h-24 rounded-full bg-violet-100 flex items-center justify-center border-4 border-white shadow-lg relative z-10 text-violet-600">
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
                className="mt-6 text-sm text-slate-400 hover:text-violet-600 transition-colors"
              >
                Not {storedProfile?.fullName?.split(" ")[0]}? Sign in as someone else
              </button>
            </div>
          ) : (
            // ── ONBOARDING FLOW ──
            <div className="animate-fade-in-up">
              {/* Progress Bar */}
              <div className="flex items-center justify-between mb-6">
                <div className={`flex items-center gap-2 ${onboardingStep >= 1 ? "text-violet-700" : "text-slate-400"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 1 ? "bg-violet-100" : "bg-slate-200"}`}>1</div>
                  <span className="text-xs font-semibold hidden sm:inline">Details</span>
                </div>
                <div className={`h-px flex-1 mx-2 ${onboardingStep >= 2 ? "bg-violet-700" : "bg-slate-200"}`} />
                <div className={`flex items-center gap-2 ${onboardingStep >= 2 ? "text-violet-700" : "text-slate-400"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 2 ? "bg-violet-100" : "bg-slate-200"}`}>2</div>
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
                      Warden Login
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
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      This name will appear on your dashboard.
                    </p>
                  </div>

                  {/* Warden ID */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Warden ID</label>
                    <div className="relative">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <ShieldCheck className="h-[18px] w-[18px]" />
                      </div>
                      <input
                        type="text"
                        name="wardenId"
                        value={formData.wardenId}
                        onChange={handleInputChange}
                        placeholder="Enter your Warden ID"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      Use the unique Warden ID provided by your institution.
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
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/15 focus:bg-white hover:border-slate-300"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                      Used for important security notifications.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-700 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-700/25 hover:shadow-xl hover:shadow-violet-700/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200"
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
                      <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-violet-700">
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
>>>>>>> Stashed changes
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back, {storedProfile?.fullName?.split(' ')[0]} 👋</h1>
            <p className="text-sm text-slate-500 mb-8">Use your fingerprint or face to securely login to your dashboard.</p>

<<<<<<< Updated upstream
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

            <button onClick={resetToOnboarding} className="mt-6 text-sm text-slate-400 hover:text-indigo-600 transition-colors">Not {storedProfile?.fullName?.split(' ')[0]}? Sign in as someone else</button>
=======
          {/* Need Help? divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Need Help?
            </span>
            <div className="flex-1 h-px bg-slate-200" />
>>>>>>> Stashed changes
          </div>
        ) : (
          <div className="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 overflow-hidden animate-fade-in-up">

            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
               <div className={`flex items-center gap-2 ${onboardingStep >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 1 ? 'bg-indigo-100' : 'bg-slate-200'}`}>1</div>
                 <span className="text-xs font-semibold hidden sm:inline">Details</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 2 ? 'bg-indigo-100' : 'bg-slate-200'}`}>2</div>
                 <span className="text-xs font-semibold hidden sm:inline">Photo</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 3 ? 'bg-indigo-100' : 'bg-slate-200'}`}>3</div>
                 <span className="text-xs font-semibold hidden sm:inline">Security</span>
               </div>
            </div>
<<<<<<< Updated upstream

            <div className="p-6 sm:p-8">
              {errorMsg && (
                <div className="mb-6 bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              )}

              {onboardingStep === 1 && (
                <form onSubmit={submitStep1} className="space-y-4 animate-fade-in-up">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-900">Warden Registration</h2>
                    <p className="text-sm text-slate-500 mt-1">Please fill in your details to setup your profile.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><User className="w-4 h-4" /></div>
                        <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} placeholder="E.g. Priya Rao" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Warden ID</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ShieldCheck className="w-4 h-4" /></div>
                        <input type="text" name="wardenId" value={formData.wardenId} onChange={handleInputChange} placeholder="E.g. WDN001" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">4-Digit PIN</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Fingerprint className="w-4 h-4" /></div>
                        <input type="password" name="pin" value={formData.pin} onChange={(e) => setFormData(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0,4) }))} placeholder="4-digit PIN" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2"><Camera className="w-8 h-8" /></div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Profile Photo</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">A clear face photo helps identify you when verifying passes.</p>
                   </div>

                   <div className="w-40 h-40 rounded-full border-4 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                     {photoPreview ? (
                       <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                     ) : (
                       <>
                         <ImageIcon className="w-10 h-10 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                         <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">Tap to upload</span>
                       </>
                     )}
                     <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
                   </div>

                   <div className="w-full flex gap-3 pt-4">
                     <button onClick={() => setOnboardingStep(1)} className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">Back</button>
                     <button onClick={skipOrSubmitPhoto} className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">{photoPreview ? 'Save Photo' : 'Skip for now'} <ArrowRight className="w-4 h-4" /></button>
                   </div>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-2"><ShieldCheck className="w-10 h-10" /></div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Enable Quick Login</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Use your device's biometric or passkey for fast, secure login.</p>
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

                   <button onClick={async () => {
                     const profile = JSON.parse(localStorage.getItem('safeexit_warden_profile') || JSON.stringify(formData));
                     try {
                       const registerRes = await fetch('/api/backend/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profile.fullName, email: `${profile.wardenId.toLowerCase()}@college.edu`, password: profile.pin, role: 'Warden' }) });
                       if (registerRes.ok) {
                         const data = await registerRes.json();
                         localStorage.setItem('safeexit_token', data.token);
                         setStoredUser({ name: profile.fullName, role: 'warden', roleLabel: 'Warden', id: profile.wardenId });
                         router.push('/dashboard/warden');
                       }
                     } catch (e) { console.error(e); }
                   }} className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">Maybe later, continue to dashboard</button>
                </div>
              )}

=======
            <div>
              <p className="text-sm font-bold text-slate-800">Facing issues logging in?</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Contact your administrator for assistance.
              </p>
>>>>>>> Stashed changes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
