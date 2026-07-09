"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  Phone,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Camera,
  Fingerprint,
  CheckCircle,
  Building,
  MapPin,
  AlertCircle,
  BookOpen,
  Mail,
  Image as ImageIcon
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";

export default function StudentLoginPage() {
  const router = useRouter();
  
  // App States
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Form, 2: Photo, 3: WebAuthn
  const [storedProfile, setStoredProfile] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    rollNumber: "",
    branch: "",
    yearLevel: "",
    hostelBlock: "",
    roomNumber: "",
    phoneNumber: "",
    emergencyContact: "",
  });
  
  // Photo State
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Email verification (OTP) state
  const [otp, setOtp] = useState("");
  const [emailToken, setEmailToken] = useState(null); // signed proof from /otp/verify
  const [resendIn, setResendIn] = useState(0);         // resend cooldown (seconds)
  const [devOtp, setDevOtp] = useState(null);          // dev-only: code shown when SMTP is off

  // Status
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Returning-user fallback: when the passkey is unavailable (sensor disabled,
  // credential wiped, new browser profile) a student can still sign in with the
  // email + roll number they registered with. `credentialMode` toggles that form
  // on the RETURNING_USER card without wiping the stored passkey shortcut.
  const [credentialMode, setCredentialMode] = useState(false);
  // Only the roll number (password) is entered; the email is fixed to this
  // device's onboarded account and never editable.
  const [credentials, setCredentials] = useState({ password: "" });

  useEffect(() => {
    // Check if user is already registered on this device
    const isRegistered = localStorage.getItem("safeexit_webauthn_registered");
    const profile = localStorage.getItem("safeexit_user_profile");
    
    if (isRegistered === "true" && profile) {
      setStoredProfile(JSON.parse(profile));
      setAppState("RETURNING_USER");
    } else {
      setAppState("ONBOARDING");
    }
  }, []);

  // Resend cooldown ticker — counts `resendIn` down to 0 once per second.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Request a verification code for the entered college email. Shared by the
  // "Continue" button on step 1 and the "Resend" button on step 2.
  const sendEmailOtp = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/backend/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't send the code. Please try again.");
      setResendIn(60);
      // In local dev (no SMTP configured) the backend returns the code so the
      // flow is testable without a real inbox. Never present in production.
      setDevOtp(data.devOtp || null);
      return true;
    } catch (err) {
      setErrorMsg(err.message);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Check the 6-digit code. On success we receive a signed token proving the
  // email was verified, which is later required by the register endpoint.
  const verifyEmailOtp = async () => {
    if (otp.trim().length < 6) {
      setErrorMsg("Please enter the 6-digit code sent to your email.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/backend/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim(), otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verified) throw new Error(data.message || "Verification failed.");
      setEmailToken(data.emailVerificationToken);
      setDevOtp(null);
      setOnboardingStep(3); // proceed to Photo
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Compress a dataURL image to reduce size before storing in localStorage
  const compressImage = (dataUrl, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve) => {
      if (!dataUrl) return resolve(null);
      // Use the global browser Image constructor explicitly to avoid
      // colliding with the imported Next.js Image component.
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
        // Export as JPEG to reduce size (works well for photos)
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const validateStep1 = () => {
    const requiredFields = ['fullName', 'email', 'rollNumber', 'branch', 'yearLevel', 'hostelBlock', 'roomNumber', 'phoneNumber', 'emergencyContact'];
    for (let field of requiredFields) {
      if (!formData[field] || formData[field].trim() === "") {
        setErrorMsg("Please fill in all fields.");
        return false;
      }
    }
    // College email must be a valid NIT Patna address (e.g. shubhamk.ug24.cs@nitp.ac.in)
    if (!/^[^\s@]+@nitp\.ac\.in$/i.test(formData.email.trim())) {
      setErrorMsg("Please enter a valid NIT Patna email ending in @nitp.ac.in.");
      return false;
    }
    if (formData.phoneNumber.length < 10) {
      setErrorMsg("Please enter a valid phone number.");
      return false;
    }
    setErrorMsg("");
    return true;
  };

  const submitStep1 = async (e) => {
    e.preventDefault();
    if (!validateStep1()) return;
    // Fire off the verification email, then move to the code-entry step.
    setOtp("");
    setEmailToken(null);
    const sent = await sendEmailOtp();
    if (sent) setOnboardingStep(2);
  };

  const skipOrSubmitPhoto = () => {
    // Save profile to localStorage temporarily
    (async () => {
      const profileToSave = { ...formData };
      try {
        if (photoPreview && typeof photoPreview === 'string' && photoPreview.startsWith('data:')) {
          // Try to compress large images before saving
          const compressed = await compressImage(photoPreview, 800, 0.7);
          profileToSave.photo = compressed || null;
        } else {
          profileToSave.photo = null;
        }

        try {
          localStorage.setItem("safeexit_user_profile", JSON.stringify(profileToSave));
        } catch (e) {
          // If quota exceeded, fall back to saving without the photo
          console.warn('localStorage quota exceeded, saving profile without photo', e);
          const fallback = { ...profileToSave, photo: null };
          try {
            localStorage.setItem("safeexit_user_profile", JSON.stringify(fallback));
          } catch (e2) {
            // If still failing, remove any stale large keys and try once more
            console.warn('second localStorage attempt failed, clearing old profile key and retrying', e2);
            try {
              localStorage.removeItem('safeexit_user_profile');
              localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...formData, photo: null }));
            } catch (finalErr) {
              console.error('Unable to persist profile to localStorage', finalErr);
            }
          }
        }
      } catch (err) {
        console.error('Error while processing photo for storage', err);
        // As a last resort, store only text data
        try {
          localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...formData, photo: null }));
        } catch (e) {
          console.error('Unable to persist profile to localStorage after error', e);
        }
      } finally {
        setOnboardingStep(4);
      }
    })();
  };

  const setupWebAuthn = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const profile = JSON.parse(localStorage.getItem("safeexit_user_profile"));
      const email = profile.email;

      // 1. Create the account. The returned JWT authorizes the passkey registration below.
      const registerRes = await fetch('/api/backend/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.fullName,
          email,
          password: profile.rollNumber, // Default password for simplicity
          role: 'Student',
          studentId: profile.rollNumber,
          department: profile.branch,
          year: profile.yearLevel,
          roomNumber: profile.roomNumber,
          hostelName: profile.hostelBlock,
          phoneNumber: profile.phoneNumber,
          emailVerificationToken: emailToken // proves the college email was verified
        })
      });

      if (!registerRes.ok) {
         const errBody = await registerRes.json().catch(() => ({}));
         throw new Error(errBody.message || "Registration failed");
      }

      const registerData = await registerRes.json();
      const token = registerData.token;
      sessionStorage.setItem('safeexit_token', token);

      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      // 2. Ask the server for a registration challenge (PublicKeyCredentialCreationOptions).
      const optionsRes = await fetch('/api/backend/auth/webauthn/register/options', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders,
      });
      if (!optionsRes.ok) {
        throw new Error("Could not start passkey setup");
      }
      const optionsJSON = await optionsRes.json();

      // 3. Prompt the platform authenticator (fingerprint / FaceID) to create and
      //    sign the credential. This is the real WebAuthn ceremony, not a mock.
      const attResp = await startRegistration({ optionsJSON });

      // 4. Send the signed attestation back; the server verifies it cryptographically
      //    and stores the public key. Only a verified response counts as registered.
      const verifyRes = await fetch('/api/backend/auth/webauthn/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders,
        body: JSON.stringify(attResp),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.message || "Passkey verification failed");
      }

      // Mark as registered
      localStorage.setItem("safeexit_webauthn_registered", "true");

      // Update our global state
      setStoredUser({
        name: profile.fullName,
        role: "student",
        roleLabel: "Student",
        subtitle: `${profile.yearLevel} Year, ${profile.branch}`,
        id: profile.rollNumber,
        rollNo: profile.rollNumber,
        email,
        hostel: `Block ${profile.hostelBlock}, Room ${profile.roomNumber}`,
        room: profile.roomNumber,
        mobile: profile.phoneNumber,
        photo: profile.photo
      });

      router.push("/dashboard/student");
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setErrorMsg("Passkey setup was cancelled or timed out. Please try again.");
      } else if (err?.name === 'InvalidStateError') {
        setErrorMsg("A passkey is already registered on this device for this account.");
      } else {
        setErrorMsg(err?.message || "Failed to setup Quick Login. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const email = storedProfile.email;

      // 1. Get an authentication challenge scoped to this account's registered passkeys.
      const optionsRes = await fetch('/api/backend/auth/webauthn/login/options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!optionsRes.ok) {
        throw new Error("No passkey found for this account on the server.");
      }
      const optionsJSON = await optionsRes.json();

      // 2. Prompt the authenticator to sign the challenge with the stored private key.
      const asseResp = await startAuthentication({ optionsJSON });

      // 3. The server verifies the signature against the stored public key. Only a
      //    cryptographically valid assertion yields a session token.
      const verifyRes = await fetch('/api/backend/auth/webauthn/login/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, response: asseResp })
      });

      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(data.message || "Biometric login failed on server.");
      }
      sessionStorage.setItem('safeexit_token', data.token);

      // Re-publish the photo so the guard's scanner can find it even after the
      // in-memory profile store was cleared (e.g. a server restart since signup).
      if (storedProfile.photo) {
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rollNo: storedProfile.rollNumber,
            name: storedProfile.fullName,
            photo: storedProfile.photo,
          }),
        }).catch((err) => console.error("Failed to publish profile photo", err));
      }

      // Login success
      setStoredUser({
        name: storedProfile.fullName,
        role: "student",
        roleLabel: "Student",
        subtitle: `${storedProfile.yearLevel} Year, ${storedProfile.branch}`,
        id: storedProfile.rollNumber,
        rollNo: storedProfile.rollNumber,
        email: storedProfile.email,
        hostel: `Block ${storedProfile.hostelBlock}, Room ${storedProfile.roomNumber}`,
        room: storedProfile.roomNumber,
        mobile: storedProfile.phoneNumber,
        photo: storedProfile.photo
      });

      router.push("/dashboard/student");
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setErrorMsg("Login was cancelled or timed out. Please try again.");
      } else {
        setErrorMsg(err?.message || "Biometric login failed.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Sign in with the registered college email + roll number instead of the
  // passkey. The account's password IS the roll number (set at registration),
  // and the backend /auth/login accepts it for students even after a passkey is
  // enrolled — so this is a genuine fallback, not a second registration.
  const handleCredentialLogin = async (e) => {
    e.preventDefault();
    // The email is FIXED to the account this device was onboarded with — it is
    // never taken from the input. This scopes the fallback to "recover my own
    // account" and prevents typing a classmate's email to hijack their session.
    // (The password is still a roll number, a weak secret — see the backend note.)
    const email = (storedProfile?.email || "").trim();
    const password = credentials.password.trim();
    if (!email) {
      setErrorMsg("No account is set up on this device. Use \"Sign in as someone else\".");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your roll number.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/backend/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Email or roll number is incorrect. Please try again."
            : data.message || "Login failed."
        );
      }
      // Defence in depth: keep non-students off the student dashboard even if
      // someone reuses staff credentials here (the route guards are the real gate).
      if (data.role !== 'Student') {
        throw new Error("This account is not authorized for student access.");
      }
      // Defence in depth: the account that authenticated must be the one this
      // device belongs to, so the token and the profile we display can't diverge.
      if (data.email && data.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error("This account doesn't match this device. Use \"Sign in as someone else\".");
      }
      sessionStorage.setItem('safeexit_token', data.token);

      // Re-publish the photo so the guard's scanner can find it, mirroring the
      // biometric login path.
      if (storedProfile?.photo) {
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rollNo: storedProfile.rollNumber,
            name: storedProfile.fullName,
            photo: storedProfile.photo,
          }),
        }).catch((err) => console.error("Failed to publish profile photo", err));
      }

      setStoredUser({
        name: storedProfile.fullName,
        role: "student",
        roleLabel: "Student",
        subtitle: `${storedProfile.yearLevel} Year, ${storedProfile.branch}`,
        id: storedProfile.rollNumber,
        rollNo: storedProfile.rollNumber,
        email: storedProfile.email,
        hostel: `Block ${storedProfile.hostelBlock}, Room ${storedProfile.roomNumber}`,
        room: storedProfile.roomNumber,
        mobile: storedProfile.phoneNumber,
        photo: storedProfile.photo
      });

      router.push("/dashboard/student");
    } catch (err) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Returning student wants to type email + roll number instead of using the
  // passkey (biometric failed / sensor unavailable). Unlike resetToOnboarding
  // this keeps the stored passkey shortcut so the NEXT visit still offers it — it
  // just shows the credential form for this one sign-in. Email is prefilled from
  // the stored profile since we already know it.
  const switchToCredentialLogin = () => {
    setCredentials({ password: "" });
    setErrorMsg("");
    setCredentialMode(true);
  };

  const backToPasskey = () => {
    setErrorMsg("");
    setCredentialMode(false);
  };

  const resetToOnboarding = () => {
    localStorage.removeItem("safeexit_webauthn_registered");
    localStorage.removeItem("safeexit_user_profile");
    setCredentialMode(false);
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({
      fullName: "", email: "", rollNumber: "", branch: "", yearLevel: "",
      hostelBlock: "", roomNumber: "", phoneNumber: "", emergencyContact: ""
    });
    setPhotoPreview(null);
    setOtp("");
    setEmailToken(null);
    setResendIn(0);
    setDevOtp(null);
  };

  if (appState === "LOADING") return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] via-[#efe8ff] to-[#e9e2ff] relative overflow-hidden">
      {/* Background styling remains the same */}
      <div className="absolute inset-0 z-0">
        <Image src="/images/login/hostel-bg.png" alt="" fill className="object-cover opacity-[0.18] pointer-events-none select-none" priority />
      </div>
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-20 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl z-0" />

      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 sm:py-8 animate-fade-in-up">
        {/* Header */}
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
          // RETURNING USER FLOW (WebAuthn)
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
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back, {storedProfile?.fullName?.split(' ')[0]} 👋</h1>
            <p className="text-sm text-slate-500 mb-8">
              {credentialMode
                ? "Enter your college email and roll number to sign in."
                : "Use your fingerprint or face to securely login to your dashboard."}
            </p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}

            {credentialMode ? (
              // FALLBACK: email + roll number sign-in for when the passkey can't be used.
              <form onSubmit={handleCredentialLogin} className="w-full space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">College Email</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail className="w-4 h-4" /></div>
                    {/* Locked to this device's account — you can only sign back into your own. */}
                    <input
                      type="email"
                      value={storedProfile?.email || ""}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Roll Number</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ShieldCheck className="w-4 h-4" /></div>
                    <input
                      type="password"
                      value={credentials.password}
                      onChange={(e) => setCredentials((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Your roll number"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70"
                >
                  {isProcessing ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Signing in…</>
                  ) : (
                    <>Sign In <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <button
                  type="button"
                  onClick={backToPasskey}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-70"
                >
                  <Fingerprint className="w-4 h-4" /> Back to passkey login
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={handleBiometricLogin}
                  disabled={isProcessing}
                  className="w-full relative group overflow-hidden flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold text-[15px] shadow-xl shadow-slate-900/20 hover:shadow-slate-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:scale-100"
                >
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

                <button
                  onClick={switchToCredentialLogin}
                  disabled={isProcessing}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-70"
                >
                  <ShieldCheck className="w-4 h-4" /> Sign in with Email &amp; Roll Number instead
                </button>
              </>
            )}

            <button onClick={resetToOnboarding} className="mt-6 text-sm text-slate-400 hover:text-indigo-600 transition-colors">
              Not {storedProfile?.fullName?.split(' ')[0]}? Sign in as someone else
            </button>
          </div>
        ) : (
          // ONBOARDING FLOW
          <div className="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 overflow-hidden animate-fade-in-up">
            
            {/* Progress Bar */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
               <div className={`flex items-center gap-2 ${onboardingStep >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 1 ? 'bg-indigo-100' : 'bg-slate-200'}`}>1</div>
                 <span className="text-xs font-semibold hidden sm:inline">Details</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 2 ? 'bg-indigo-100' : 'bg-slate-200'}`}>2</div>
                 <span className="text-xs font-semibold hidden sm:inline">Verify</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 3 ? 'bg-indigo-100' : 'bg-slate-200'}`}>3</div>
                 <span className="text-xs font-semibold hidden sm:inline">Photo</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 4 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 4 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 4 ? 'bg-indigo-100' : 'bg-slate-200'}`}>4</div>
                 <span className="text-xs font-semibold hidden sm:inline">Security</span>
               </div>
            </div>

            <div className="p-6 sm:p-8">
              {errorMsg && (
                <div className="mb-6 bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {errorMsg}
                </div>
              )}

              {/* STEP 1: Details */}
              {onboardingStep === 1 && (
                <form onSubmit={submitStep1} className="space-y-4 animate-fade-in-up">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-900">Student Registration</h2>
                    <p className="text-sm text-slate-500 mt-1">Please fill in your details to setup your profile.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><User className="w-4 h-4" /></div>
                        <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} placeholder="E.g. Ananya Sharma" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* College Email */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">College Email</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail className="w-4 h-4" /></div>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="E.g. shubhamk.ug24.cs@nitp.ac.in" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Roll No */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Roll Number</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ShieldCheck className="w-4 h-4" /></div>
                        <input type="text" name="rollNumber" value={formData.rollNumber} onChange={handleInputChange} placeholder="E.g. STU2024" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Branch */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Branch</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><BookOpen className="w-4 h-4" /></div>
                        <input type="text" name="branch" value={formData.branch} onChange={handleInputChange} placeholder="E.g. Computer Science" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Year */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Year</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ChevronDown className="w-4 h-4" /></div>
                        <select name="yearLevel" value={formData.yearLevel} onChange={handleInputChange} className="w-full appearance-none pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors">
                          <option value="">Select Year</option>
                          <option value="1st">1st Year</option>
                          <option value="2nd">2nd Year</option>
                          <option value="3rd">3rd Year</option>
                          <option value="4th">4th Year</option>
                        </select>
                      </div>
                    </div>

                    {/* Hostel Block */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Hostel Block</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Building className="w-4 h-4" /></div>
                        <input type="text" name="hostelBlock" value={formData.hostelBlock} onChange={handleInputChange} placeholder="E.g. Block A" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Room No */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Room No.</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><MapPin className="w-4 h-4" /></div>
                        <input type="text" name="roomNumber" value={formData.roomNumber} onChange={handleInputChange} placeholder="E.g. 204" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Phone Number</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Phone className="w-4 h-4" /></div>
                        <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} placeholder="10-digit number" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">Emergency Contact (Parent/Guardian)</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400"><AlertCircle className="w-4 h-4" /></div>
                        <input type="tel" name="emergencyContact" value={formData.emergencyContact} onChange={handleInputChange} placeholder="Emergency 10-digit number" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-rose-100 bg-rose-50/30 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 focus:bg-white transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* STEP 2: Verify College Email (OTP) */}
              {onboardingStep === 2 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2">
                     <Mail className="w-8 h-8" />
                   </div>

                   {emailToken ? (
                     // Already verified (e.g. user navigated back from the Photo step).
                     // The one-time code has been consumed server-side, so we show a
                     // confirmed state instead of asking them to re-enter it.
                     <>
                       <div>
                         <h2 className="text-2xl font-bold text-slate-900">Email Verified</h2>
                         <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                           <span className="font-semibold text-slate-700">{formData.email}</span> is confirmed. You can continue.
                         </p>
                       </div>
                       <div className="w-full bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl p-4 flex items-center gap-3">
                         <CheckCircle className="w-5 h-5 shrink-0" />
                         <span className="text-sm font-semibold text-left">Your college email is verified.</span>
                       </div>
                       <div className="w-full flex gap-3 pt-2">
                         <button onClick={() => setOnboardingStep(1)} className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer">
                           Back
                         </button>
                         <button onClick={() => setOnboardingStep(3)} className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                           Continue <ArrowRight className="w-4 h-4" />
                         </button>
                       </div>
                     </>
                   ) : (
                     <>
                       <div>
                         <h2 className="text-2xl font-bold text-slate-900">Verify Your Email</h2>
                         <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                           We sent a 6-digit code to <span className="font-semibold text-slate-700">{formData.email}</span>. Enter it below to confirm this is your college email.
                         </p>
                       </div>

                       {devOtp && (
                         <div className="w-full bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 text-xs font-medium">
                           Dev mode (email not configured): your code is <span className="font-bold tracking-widest">{devOtp}</span>
                         </div>
                       )}

                       <input
                         type="text"
                         inputMode="numeric"
                         autoComplete="one-time-code"
                         maxLength={6}
                         value={otp}
                         onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                         placeholder="------"
                         className="w-full max-w-[240px] text-center text-3xl font-bold tracking-[0.5em] py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                       />

                       <button
                         onClick={verifyEmailOtp}
                         disabled={isProcessing || otp.length < 6}
                         className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                       >
                         {isProcessing ? (
                           <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Verifying...</>
                         ) : (
                           <>Verify & Continue <ArrowRight className="w-4 h-4" /></>
                         )}
                       </button>

                       <div className="w-full flex items-center justify-between text-sm">
                         <button onClick={() => setOnboardingStep(1)} className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer">
                           Back
                         </button>
                         <button
                           onClick={sendEmailOtp}
                           disabled={isProcessing || resendIn > 0}
                           className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
                         >
                           {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                         </button>
                       </div>
                     </>
                   )}
                </div>
              )}

              {/* STEP 3: Photo Upload */}
              {onboardingStep === 3 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2">
                     <Camera className="w-8 h-8" />
                   </div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Profile Photo</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Security guards will use this photo to verify your identity when scanning your exit pass. A clear face photo is highly recommended.</p>
                   </div>

                   {/* Upload Area */}
                   <div 
                     className="w-40 h-40 rounded-full border-4 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-400 transition-colors"
                     onClick={() => fileInputRef.current?.click()}
                   >
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
                     <button onClick={() => setOnboardingStep(2)} className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer">
                       Back
                     </button>
                     <button onClick={skipOrSubmitPhoto} className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                       {photoPreview ? 'Save Photo' : 'Skip for now'} <ArrowRight className="w-4 h-4" />
                     </button>
                   </div>
                </div>
              )}

              {/* STEP 4: WebAuthn Setup */}
              {onboardingStep === 4 && (
                <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                     <ShieldCheck className="w-10 h-10" />
                   </div>
                   <div>
                     <h2 className="text-2xl font-bold text-slate-900">Enable Quick Login</h2>
                     <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Never type a password again! Use your device&apos;s fingerprint or face scan to log in securely next time.</p>
                   </div>

                   <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 my-2">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600">
                          <Fingerprint className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-800">Biometric Login</p>
                          <p className="text-xs text-slate-500">Fingerprint, FaceID, or Device PIN</p>
                        </div>
                        <div className="ml-auto text-emerald-500"><CheckCircle className="w-5 h-5" /></div>
                     </div>
                     <p className="text-xs text-slate-500 text-left">Your biometric data never leaves your device. We use modern WebAuthn standards for maximum security.</p>
                   </div>

                   <button 
                     onClick={setupWebAuthn}
                     disabled={isProcessing}
                     className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:transform-none"
                   >
                     {isProcessing ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
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
                     onClick={async () => {
                       // Skip webauthn, just save and go
                       const profile = JSON.parse(localStorage.getItem("safeexit_user_profile"));
                       setIsProcessing(true);
                       setErrorMsg("");
                       try {
                         // Real Backend API Call - Register User without WebAuthn
                         const registerRes = await fetch('/api/backend/auth/register', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({
                             name: profile.fullName,
                             email: profile.email,
                             password: profile.rollNumber, // Default password
                             role: 'Student',
                             studentId: profile.rollNumber,
                             department: profile.branch,
                             year: profile.yearLevel,
                             roomNumber: profile.roomNumber,
                             hostelName: profile.hostelBlock,
                             phoneNumber: profile.phoneNumber,
                             emailVerificationToken: emailToken // proves the college email was verified
                           })
                         });
                         if (registerRes.ok) {
                           const registerData = await registerRes.json();
                           sessionStorage.setItem('safeexit_token', registerData.token);
                           setStoredUser({
                             name: profile.fullName,
                             role: "student",
                             roleLabel: "Student",
                             subtitle: `${profile.yearLevel} Year, ${profile.branch}`,
                             id: profile.rollNumber,
                             rollNo: profile.rollNumber,
                             email: profile.email,
                             hostel: `Block ${profile.hostelBlock}, Room ${profile.roomNumber}`,
                             room: profile.roomNumber,
                             mobile: profile.phoneNumber,
                             photo: profile.photo
                           });
                           router.push("/dashboard/student");
                         } else {
                           const errBody = await registerRes.json().catch(() => ({}));
                           setErrorMsg(errBody.message || "Registration failed. Please try again.");
                         }
                       } catch (e) {
                         setErrorMsg(e?.message || "Registration failed. Please try again.");
                       } finally {
                         setIsProcessing(false);
                       }
                     }}
                     disabled={isProcessing}
                     className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                   >
                     Maybe later, continue to dashboard
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
