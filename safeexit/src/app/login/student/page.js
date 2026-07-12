"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  Phone,
  ArrowRight,
  LogIn,
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
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Image as ImageIcon
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { setStoredUser } from "@/app/lib/userProfile";
import {
  hasQuickPin,
  hasBiometric,
  getQuickLabel,
  setQuickPin,
  verifyQuickPin,
  clearQuickLogin,
} from "@/app/lib/quickLogin";

export default function StudentLoginPage() {
  const router = useRouter();

  // App States
  //   LOADING        — deciding the landing screen
  //   RETURNING_USER — this device has Quick Login set up (PIN + optional biometric)
  //   LOGIN          — editable email + password sign-in (fresh device / fallback)
  //   ONBOARDING     — registration (steps 1-3) then Quick Login setup (step 4)
  //   QUICK_SETUP    — after an email+password sign-in, (re)enrol Quick Login
  const [appState, setAppState] = useState("LOADING");
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: Form, 2: Verify, 3: Photo, 4: Quick Login
  const [storedProfile, setStoredProfile] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    rollNumber: "",
    branch: "",
    yearLevel: "",
    gender: "",
    hostelBlock: "",
    roomNumber: "",
    phoneNumber: "",
    emergencyContact: "",
    // Login secret the student chooses (NOT the public roll number). Kept only in
    // component state — never written to localStorage as plaintext. During Quick
    // Login setup it is encrypted under the 4-digit PIN (see lib/quickLogin).
    password: "",
    confirmPassword: "",
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

  // Returning-user Quick Login state.
  const [hasBio, setHasBio] = useState(false);     // is a passkey enrolled on THIS device?
  const [quickLabel, setQuickLabel] = useState(""); // roll number shown on the PIN screen
  const [loginPin, setLoginPin] = useState("");     // PIN typed on the returning screen
  const [showLoginPin, setShowLoginPin] = useState(false);

  // Quick Login SETUP state (onboarding step 4 + QUICK_SETUP).
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showSetupPin, setShowSetupPin] = useState(false);
  const [enableBiometric, setEnableBiometric] = useState(false); // optional, off by default
  // A valid session token for the account being set up. In ONBOARDING it comes
  // from /auth/register; in QUICK_SETUP from the email+password /auth/login. Kept
  // so a retry (e.g. after a cancelled biometric prompt) doesn't re-register.
  const [sessionToken, setSessionToken] = useState(null);
  // The password to lock behind the PIN during QUICK_SETUP (typed at the login
  // form). In ONBOARDING we use formData.password instead.
  const [pendingPassword, setPendingPassword] = useState("");

  // Generic email + password sign-in (fresh device, forgotten PIN, or "someone
  // else"). Both fields are editable — unlike the old read-only-email fallback,
  // which is removed.
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });





  
  // Forgot-password flow state (student forgot BOTH the PIN and the password).
  //   1: confirm college email  ·  2: enter emailed OTP  ·  3: choose new password
  // On success the account is re-secured and we drop into QUICK_SETUP so the PIN
  // (and optional passkey) is re-enrolled against the new password.
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [resetToken, setResetToken] = useState(null);   // signed proof from /password/verify-otp
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    // Decide the landing screen from what this device already knows.
    const profileRaw = localStorage.getItem("safeexit_user_profile");

    if (profileRaw && hasQuickPin()) {
      // This device has an onboarded account AND a Quick Login PIN — greet them
      // back and ask only for the PIN (plus biometric if it was enrolled).
      try {
        setStoredProfile(JSON.parse(profileRaw));
      } catch {
        setStoredProfile(null);
      }
      setHasBio(hasBiometric());
      setQuickLabel(getQuickLabel());
      setAppState("RETURNING_USER");
    } else {
      // No Quick Login on this device. Fall back to the email + password form. If
      // we still remember the account's email, prefill it (still editable).
      if (profileRaw) {
        try {
          const p = JSON.parse(profileRaw);
          if (p?.email) setLoginForm((f) => ({ ...f, email: p.email }));
        } catch {
          /* ignore */
        }
      }
      setAppState("LOGIN");
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

  // ---- Shared helpers -------------------------------------------------------

  // Publish the student's photo to the local profile store so the guard's scanner
  // can find it even after the in-memory store was cleared (e.g. a server restart).
  const publishPhoto = (p) => {
    if (!p?.photo) return;
    fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rollNo: p.rollNumber,
        name: p.fullName,
        photo: p.photo,
      }),
    }).catch((err) => console.error("Failed to publish profile photo", err));
  };

  // Persist the device profile (best-effort, tolerating localStorage quota).
  const persistProfile = (p) => {
    try {
      localStorage.setItem("safeexit_user_profile", JSON.stringify(p));
    } catch (err) {
      console.warn("Could not persist profile to localStorage", err);
      try {
        localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...p, photo: null }));
      } catch (e2) {
        console.error("Unable to persist profile to localStorage", e2);
      }
    }
  };

  // Publish state to the app, then head to the dashboard.
  const hydrateAndGo = (p) => {
    publishPhoto(p);
    setStoredUser({
      name: p.fullName,
      role: "student",
      roleLabel: "Student",
      subtitle: `${p.yearLevel} Year, ${p.branch}`,
      id: p.rollNumber,
      rollNo: p.rollNumber,
      email: p.email,
      hostel: p.hostelBlock
        ? `Block ${p.hostelBlock}, Room ${p.roomNumber}`
        : p.roomNumber
        ? `Room ${p.roomNumber}`
        : "—",
      room: p.roomNumber,
      mobile: p.phoneNumber,
      photo: p.photo,
      gender: p.gender,
    });
    router.push("/dashboard/student");
  };

  // Run the real WebAuthn registration ceremony to enrol a passkey. Requires a
  // valid session token. Sets the device's biometric marker on success.
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
    localStorage.setItem("safeexit_webauthn_registered", "true");
  };

  // Create the student account (onboarding). Returns a session token.
  const registerAccount = async () => {
    const profile = JSON.parse(localStorage.getItem("safeexit_user_profile"));
    const registerRes = await fetch("/api/backend/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.fullName,
        email: profile.email,
        password: formData.password, // student-chosen login secret (from step 1)
        role: "Student",
        studentId: profile.rollNumber,
        department: profile.branch,
        year: profile.yearLevel,
        gender: profile.gender,
        roomNumber: profile.roomNumber,
        hostelName: profile.hostelBlock,
        phoneNumber: profile.phoneNumber,
        emailVerificationToken: emailToken, // proves the college email was verified
      }),
    });
    if (!registerRes.ok) {
      const errBody = await registerRes.json().catch(() => ({}));
      throw new Error(errBody.message || "Registration failed");
    }
    const registerData = await registerRes.json();
    sessionStorage.setItem("safeexit_token", registerData.token);
    return registerData.token;
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
    const requiredFields = ['fullName', 'email', 'rollNumber', 'branch', 'yearLevel', 'gender', 'hostelBlock', 'roomNumber', 'phoneNumber', 'emergencyContact', 'password', 'confirmPassword'];
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
    // The password is the student's login secret — enforce a minimum length and a
    // matching confirmation so they don't lock themselves out with a typo.
    if (formData.password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("Passwords do not match.");
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
      // Never persist the login secret to localStorage — strip password fields
      // before anything touches storage. The register call reads the password
      // straight from component state instead.
      const { password, confirmPassword, ...safeProfile } = formData;
      const profileToSave = { ...safeProfile };
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
              localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...safeProfile, photo: null }));
            } catch (finalErr) {
              console.error('Unable to persist profile to localStorage', finalErr);
            }
          }
        }
      } catch (err) {
        console.error('Error while processing photo for storage', err);
        // As a last resort, store only text data
        try {
          localStorage.setItem("safeexit_user_profile", JSON.stringify({ ...safeProfile, photo: null }));
        } catch (e) {
          console.error('Unable to persist profile to localStorage after error', e);
        }
      } finally {
        // Reset Quick Login setup fields before showing step 4.
        setPin("");
        setConfirmPin("");
        setEnableBiometric(false);
        setSessionToken(null);
        setOnboardingStep(4);
      }
    })();
  };

  // ---- Quick Login setup (onboarding step 4 + QUICK_SETUP) ------------------

  // Enrol a PIN (and optional biometric), then go to the dashboard. Works for
  // both ONBOARDING (register first) and QUICK_SETUP (already signed in).
  const submitQuickSetup = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setErrorMsg("Please set a 4-digit numeric PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setErrorMsg("The PINs you entered do not match.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      let token = sessionToken;
      let password;
      let profile;

      if (appState === "ONBOARDING") {
        profile = JSON.parse(localStorage.getItem("safeexit_user_profile"));
        password = formData.password;
        // Register once; a retry (after a cancelled biometric) reuses the token.
        if (!token) {
          token = await registerAccount();
          setSessionToken(token);
        }
      } else {
        // QUICK_SETUP: account already exists, token + password captured at login.
        profile = storedProfile;
        password = pendingPassword;
      }

      // Lock the password behind the PIN so the PIN can log in next time.
      await setQuickPin(pin, password, profile.rollNumber || profile.email);

      // Optional biometric — only enrol if requested and not already present.
      if (enableBiometric && !hasBiometric()) {
        await enrollBiometric(token);
      }

      hydrateAndGo(profile);
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

  // Skip Quick Login entirely and continue. In ONBOARDING this still needs to
  // create the account first.
  const skipQuickSetup = async () => {
    setIsProcessing(true);
    setErrorMsg("");
    try {
      let profile;
      if (appState === "ONBOARDING") {
        profile = JSON.parse(localStorage.getItem("safeexit_user_profile"));
        if (!sessionToken) await registerAccount();
      } else {
        profile = storedProfile;
      }
      hydrateAndGo(profile);
    } catch (err) {
      setErrorMsg(err?.message || "Something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---- Returning-user Quick Login (PIN / biometric) -------------------------

  // Sign in with the 4-digit PIN: decrypt the stored password, then authenticate
  // for real against the backend.
  const handlePinLogin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(loginPin)) {
      setErrorMsg("Please enter your 4-digit PIN.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const password = await verifyQuickPin(loginPin);
      if (!password) throw new Error("Incorrect PIN. Please try again.");

      const email = (storedProfile?.email || "").trim();
      const res = await fetch("/api/backend/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Login failed. Try signing in with your password.");
      }
      if (data.role !== "Student") {
        throw new Error("This account is not authorized for student access.");
      }
      sessionStorage.setItem("safeexit_token", data.token);
      hydrateAndGo(storedProfile);
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
      hydrateAndGo(storedProfile);
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

  // ---- Email + password sign-in (fallback / fresh device) -------------------

  // Given a valid session (token) and the plaintext `password` it was obtained
  // with, (re)build this device's profile from the server and hand off to Quick
  // Login setup — so the student re-enrols a PIN (and optionally biometric) that
  // caches this password. Shared by password sign-in and password reset.
  const enterQuickSetupWithSession = async (token, password, emailFallback) => {
    sessionStorage.setItem('safeexit_token', token);

    // Pull the full profile so the dashboard, QR ticket, and guard scanner all
    // have real data (roll number, room, phone) instead of just an email.
    let profileData = {};
    try {
      const profRes = await fetch('/api/backend/auth/profile', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (profRes.ok) profileData = await profRes.json();
    } catch {
      // Non-fatal: fall back to whatever we already know.
    }

    const resolvedEmail = profileData.email || emailFallback;

    // The server doesn't store the profile photo. If this device still holds a
    // profile for the SAME account (e.g. a "Forgot PIN" re-login), carry its
    // photo over so the guard's face-match keeps working.
    let carriedPhoto = null;
    try {
      const existing = JSON.parse(localStorage.getItem("safeexit_user_profile") || "null");
      if (existing?.photo && (existing.email || "").toLowerCase() === resolvedEmail.toLowerCase()) {
        carriedPhoto = existing.photo;
      }
    } catch {
      /* ignore */
    }

    const deviceProfile = {
      fullName: profileData.name || "Student",
      email: resolvedEmail,
      rollNumber: profileData.studentId || "",
      branch: profileData.department || "",
      yearLevel: profileData.year || "",
      hostelBlock: profileData.hostelName || "",
      roomNumber: profileData.roomNumber || "",
      phoneNumber: profileData.phoneNumber || "",
      gender: profileData.gender || "",
      emergencyContact: "",
      photo: carriedPhoto,
    };
    persistProfile(deviceProfile);

    // Hand off to Quick Login setup (demand PIN + optional biometric again).
    setStoredProfile(deviceProfile);
    setSessionToken(token);
    setPendingPassword(password);
    setPin("");
    setConfirmPin("");
    setEnableBiometric(false);
    setErrorMsg("");
    setAppState("QUICK_SETUP");
  };

  // Sign in with college email + password. On success we (re)build this device's
  // profile from the server and hand off to Quick Login setup — so the student is
  // prompted to create a PIN (and optionally biometric) again.
  const handleGenericLogin = async (e) => {
    e.preventDefault();
    const email = loginForm.email.trim();
    const password = loginForm.password;
    if (!email) {
      setErrorMsg("Please enter your college email.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password.");
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
            ? "Email or password is incorrect. If you're new, create an account below."
            : data.message || "Login failed."
        );
      }
      // Keep non-students off the student dashboard even with valid staff creds.
      if (data.role !== 'Student') {
        throw new Error("This account is not authorized for student access.");
      }
      await enterQuickSetupWithSession(data.token, password, email);
    } catch (err) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---- Forgot password (student forgot BOTH the PIN and the password) --------

  // Step 1 → 2: email a reset code to the confirmed college address.
  const submitForgotEmail = async (e) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!/^[^\s@]+@nitp\.ac\.in$/i.test(email)) {
      setErrorMsg("Please enter your college email ending in @nitp.ac.in.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/backend/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't send the reset code. Please try again.");
      setForgotOtp("");
      setResendIn(60);
      setDevOtp(data.devOtp || null); // dev-only, when SMTP is off
      setForgotStep(2);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2 → 3: verify the emailed code, receiving a signed reset token.
  const submitForgotOtp = async (e) => {
    e.preventDefault();
    if (forgotOtp.trim().length < 6) {
      setErrorMsg("Please enter the 6-digit code sent to your email.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/backend/auth/password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim(), otp: forgotOtp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verified) throw new Error(data.message || "Verification failed.");
      setResetToken(data.resetToken);
      setDevOtp(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setForgotStep(3);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: set the new password, then drop into Quick Login setup to re-enrol the
  // PIN (and optional passkey) against it — the old PIN cached the old password and
  // was cleared, so it must be recreated.
  const submitNewPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setIsProcessing(true);
    setErrorMsg("");
    try {
      const email = forgotEmail.trim();
      const res = await fetch('/api/backend/auth/password/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetToken, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't reset your password. Please try again.");
      if (data.role !== 'Student') {
        throw new Error("This account is not authorized for student access.");
      }
      // The old device PIN encrypted the OLD password, so it's now useless — forget
      // it (keep any profile/photo) before re-enrolling against the new password.
      clearQuickLogin({ forgetProfile: false });
      setHasBio(false);
      setResetToken(null);
      await enterQuickSetupWithSession(data.token, newPassword, email);
    } catch (err) {
      setErrorMsg(err?.message || "Couldn't reset your password.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---- Navigation between screens -------------------------------------------

  // Show the email + password sign-in form. `keepProfile` prefills the email for
  // the SAME student (forgot PIN); dropping it lets a DIFFERENT student sign in.
  const goToLogin = ({ keepProfile = false } = {}) => {
    setErrorMsg("");
    setLoginPin("");
    setLoginForm({
      email: keepProfile ? storedProfile?.email || "" : "",
      password: "",
    });
    if (!keepProfile) setStoredProfile(null);
    setAppState("LOGIN");
  };

  // Forgot PIN / biometric unavailable — forget the Quick Login factors on this
  // device but keep the account so the email is prefilled. After the email +
  // password sign-in, Quick Login setup is demanded again.
  const forgotQuickLogin = () => {
    clearQuickLogin({ forgetProfile: false });
    setHasBio(false);
    goToLogin({ keepProfile: true });
  };

  // "Not <name>? Sign in as someone else" — forget the account AND the Quick Login
  // factors bound to this device so a different existing student can sign in.
  const signInAsSomeoneElse = () => {
    clearQuickLogin({ forgetProfile: true });
    setHasBio(false);
    setQuickLabel("");
    goToLogin({ keepProfile: false });
  };

  // Enter the forgot-password flow. Prefill the email from the sign-in form (or the
  // remembered profile) so a student who just failed a password login doesn't retype it.
  const goToForgotPassword = () => {
    setErrorMsg("");
    setForgotStep(1);
    setForgotEmail(loginForm.email?.trim() || storedProfile?.email || "");
    setForgotOtp("");
    setResetToken(null);
    setNewPassword("");
    setConfirmNewPassword("");
    setDevOtp(null);
    setResendIn(0);
    setAppState("FORGOT_PASSWORD");
  };

  // Back out of the forgot-password flow to the email + password sign-in screen.
  const cancelForgotPassword = () => {
    setErrorMsg("");
    setDevOtp(null);
    setResendIn(0);
    setAppState("LOGIN");
  };

  // From the sign-in form, a genuinely new student heads into registration.
  const goToRegister = () => {
    setErrorMsg("");
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({
      fullName: "", email: "", rollNumber: "", branch: "", yearLevel: "", gender: "",
      hostelBlock: "", roomNumber: "", phoneNumber: "", emergencyContact: "",
      password: "", confirmPassword: ""
    });
    setPhotoPreview(null);
    setOtp("");
    setEmailToken(null);
    setResendIn(0);
    setDevOtp(null);
    setSessionToken(null);
  };

  // ---- Quick Login setup card body (shared by step 4 and QUICK_SETUP) -------
  const renderQuickSetupBody = () => (
    <div className="space-y-6 animate-fade-in-up flex flex-col items-center text-center">
      <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-1">
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
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              autoComplete="off"
              className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold tracking-[0.4em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-[0.4em] focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowSetupPin((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
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
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              autoComplete="off"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-lg font-bold tracking-[0.4em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-[0.4em] focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Optional biometric toggle */}
        <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-indigo-600 shrink-0">
              <Fingerprint className="w-5 h-5" />
            </div>
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
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Setting up…
          </>
        ) : (
          <>
            <ShieldCheck className="w-5 h-5" />
            Enable Quick Login
          </>
        )}
      </button>

      <button
        onClick={skipQuickSetup}
        disabled={isProcessing}
        className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
      >
        Skip for now, continue to dashboard
      </button>
    </div>
  );

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
          // RETURNING USER — Quick Login with PIN (+ optional biometric)
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

            {/* Optional biometric — only when a passkey is enrolled on this device. */}
            {hasBio && (
              <button
                onClick={handleBiometricLogin}
                disabled={isProcessing}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-70"
              >
                <Fingerprint className="w-5 h-5 text-indigo-600" /> Use fingerprint / FaceID
              </button>
            )}

            <div className="mt-6 flex flex-col items-center gap-2">
              <button onClick={forgotQuickLogin} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                Forgot PIN? Sign in with password
              </button>
              <button onClick={signInAsSomeoneElse} className="text-sm text-slate-400 hover:text-indigo-600 transition-colors">
                Not {storedProfile?.fullName?.split(' ')[0]}? Sign in as someone else
              </button>
            </div>
          </div>
        ) : appState === "QUICK_SETUP" ? (
          // QUICK LOGIN SETUP after an email + password sign-in.
          <div className="w-full max-w-[440px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-6 sm:p-8 animate-fade-in-up">
            {errorMsg && (
              <div className="mb-6 bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {errorMsg}
              </div>
            )}
            {renderQuickSetupBody()}
          </div>
        ) : appState === "FORGOT_PASSWORD" ? (
          // FORGOT PASSWORD — student forgot BOTH the PIN and the password. Confirm
          // the college email, verify an emailed OTP, then set a new password. On
          // success we fall through to QUICK_SETUP to re-enrol the PIN + passkey.
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-8 flex flex-col items-center text-center animate-fade-in-up">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-5">
              <KeyRound className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-2">Reset Password</h1>
            <p className="text-sm text-slate-500 mb-6">
              {forgotStep === 1 && "Enter your college email and we'll send you a verification code."}
              {forgotStep === 2 && <>Enter the 6-digit code we sent to <span className="font-semibold text-slate-700">{forgotEmail}</span>.</>}
              {forgotStep === 3 && "Choose a new password for your account."}
            </p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}
            {devOtp && (
              <p className="text-amber-600 text-xs mb-4 font-medium bg-amber-50 p-2 rounded-lg w-full">
                Dev mode — your code is <span className="font-bold tracking-widest">{devOtp}</span>
              </p>
            )}

            {/* STEP 1: Confirm email */}
            {forgotStep === 1 && (
              <form onSubmit={submitForgotEmail} className="w-full space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">College Email</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail className="w-4 h-4" /></div>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="E.g. mohnishp.ug24.cs@nitp.ac.in"
                      autoComplete="username"
                      autoFocus
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
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Sending code…</>
                  ) : (
                    <>Send Code <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: Verify OTP */}
            {forgotStep === 2 && (
              <form onSubmit={submitForgotOtp} className="w-full space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  autoComplete="one-time-code"
                  autoFocus
                  className="w-full text-center text-3xl font-bold tracking-[0.5em] py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                />
                <button
                  type="submit"
                  disabled={isProcessing || forgotOtp.length < 6}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Verifying…</>
                  ) : (
                    <>Verify Code <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={submitForgotEmail}
                  disabled={isProcessing || resendIn > 0}
                  className="w-full text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
              </form>
            )}

            {/* STEP 3: New password */}
            {forgotStep === 3 && (
              <form onSubmit={submitNewPassword} className="w-full space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">New Password</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-4 h-4" /></div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      autoFocus
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Confirm New Password</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-4 h-4" /></div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
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
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving…</>
                  ) : (
                    <>Reset Password <CheckCircle className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            )}

            <button
              onClick={cancelForgotPassword}
              disabled={isProcessing}
              className="mt-6 text-sm text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
              Back to sign in
            </button>
          </div>
        ) : appState === "LOGIN" ? (
          // EMAIL + PASSWORD SIGN-IN — fresh device, forgotten PIN, or "someone else".
          <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-8 flex flex-col items-center text-center animate-fade-in-up">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-5">
              <LogIn className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-2">Sign In</h1>
            <p className="text-sm text-slate-500 mb-8">
              Enter your college email and password to sign in.
            </p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}

            <form onSubmit={handleGenericLogin} className="w-full space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">College Email</label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail className="w-4 h-4" /></div>
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="E.g. mohnishp.ug24.cs@nitp.ac.in"
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Password</label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-4 h-4" /></div>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Your password"
                    autoComplete="current-password"
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
            </form>

            <button
              onClick={goToForgotPassword}
              disabled={isProcessing}
              className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50"
            >
              Forgot password?
            </button>

            <div className="mt-6 pt-6 border-t border-slate-100 w-full">
              <p className="text-sm text-slate-500">
                New to SafeExit?{" "}
                <button onClick={goToRegister} disabled={isProcessing} className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-50">
                  Create an account
                </button>
              </p>
            </div>
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

                    {/* Gender */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Gender</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><ChevronDown className="w-4 h-4" /></div>
                        <select name="gender" value={formData.gender} onChange={handleInputChange} className="w-full appearance-none pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors">
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
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

                    {/* Create Password — the student's login secret (used instead of
                        the public roll number, so no one else can sign in as them). */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Create Password</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-4 h-4" /></div>
                        <input type="password" name="password" value={formData.password} onChange={handleInputChange} autoComplete="new-password" placeholder="At least 6 characters" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Confirm Password</label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="w-4 h-4" /></div>
                        <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} autoComplete="new-password" placeholder="Re-enter your password" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Escape hatch for a student who already has an account and
                      landed here by mistake — otherwise registration would fail
                      with "User already exists" and leave them stuck. */}
                  <p className="text-center text-sm text-slate-500">
                    Already registered?{" "}
                    <button type="button" onClick={() => goToLogin()} className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                      Sign in instead
                    </button>
                  </p>
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

              {/* STEP 4: Quick Login setup (4-digit PIN + optional biometric) */}
              {onboardingStep === 4 && renderQuickSetupBody()}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
