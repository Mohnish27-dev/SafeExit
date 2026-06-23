"use client";

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
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { setStoredUser } from "@/app/lib/userProfile";

export default function WardenLoginPage() {
  const router = useRouter();

  // App state: returning warden or onboarding
  const [appState, setAppState] = useState("LOADING"); // LOADING, RETURNING_USER, ONBOARDING
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: details, 2: photo, 3: security
  const [storedProfile, setStoredProfile] = useState(null);

  // Form data for warden
  const [formData, setFormData] = useState({ fullName: "", wardenId: "", pin: "" });
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const isRegistered = localStorage.getItem("safeexit_webauthn_registered_warden");
    const profile = localStorage.getItem("safeexit_warden_profile");
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
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsProcessing(true);
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
    } finally {
      setIsProcessing(false);
    }
  };

  const resetToOnboarding = () => {
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
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back, {storedProfile?.fullName?.split(' ')[0]} 👋</h1>
            <p className="text-sm text-slate-500 mb-8">Use your fingerprint or face to securely login to your dashboard.</p>

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

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
