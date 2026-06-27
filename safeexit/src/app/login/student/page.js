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

  // Status
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const submitStep1 = (e) => {
    e.preventDefault();
    if (validateStep1()) {
      setOnboardingStep(2);
    }
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
        setOnboardingStep(3);
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
          phoneNumber: profile.phoneNumber
        })
      });

      if (!registerRes.ok) {
         throw new Error("Registration failed");
      }

      const registerData = await registerRes.json();
      const token = registerData.token;
      localStorage.setItem('safeexit_token', token);

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
      localStorage.setItem('safeexit_token', data.token);

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

  const resetToOnboarding = () => {
    localStorage.removeItem("safeexit_webauthn_registered");
    localStorage.removeItem("safeexit_user_profile");
    setAppState("ONBOARDING");
    setOnboardingStep(1);
    setFormData({
      fullName: "", email: "", rollNumber: "", branch: "", yearLevel: "",
      hostelBlock: "", roomNumber: "", phoneNumber: "", emergencyContact: ""
    });
    setPhotoPreview(null);
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
            <p className="text-sm text-slate-500 mb-8">Use your fingerprint or face to securely login to your dashboard.</p>

            {errorMsg && <p className="text-rose-500 text-sm mb-4 font-medium bg-rose-50 p-2 rounded-lg w-full">{errorMsg}</p>}

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
                 <span className="text-xs font-semibold hidden sm:inline">Photo</span>
               </div>
               <div className={`h-px flex-1 mx-2 ${onboardingStep >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
               <div className={`flex items-center gap-2 ${onboardingStep >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>
                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${onboardingStep >= 3 ? 'bg-indigo-100' : 'bg-slate-200'}`}>3</div>
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

              {/* STEP 2: Photo Upload */}
              {onboardingStep === 2 && (
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
                     <button onClick={() => setOnboardingStep(1)} className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer">
                       Back
                     </button>
                     <button onClick={skipOrSubmitPhoto} className="flex-[2] flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] transition-all cursor-pointer">
                       {photoPreview ? 'Save Photo' : 'Skip for now'} <ArrowRight className="w-4 h-4" />
                     </button>
                   </div>
                </div>
              )}

              {/* STEP 3: WebAuthn Setup */}
              {onboardingStep === 3 && (
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
                             phoneNumber: profile.phoneNumber
                           })
                         });
                         if (registerRes.ok) {
                           const registerData = await registerRes.json();
                           localStorage.setItem('safeexit_token', registerData.token);
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
                         }
                       } catch (e) {
                         console.error(e);
                       }
                     }} 
                     className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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
