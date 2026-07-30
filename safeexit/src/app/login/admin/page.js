"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  LockKeyhole,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { setStoredUser } from "@/app/lib/userProfile";

// Admins have no email; the normalized Admin ID is their backend login ID.
const buildAdminLoginId = (adminId) =>
  adminId.trim().toLowerCase().replace(/\s+/g, "");

export default function AdminLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: "",
    adminId: "",
    pin: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // The previous flow saved the entered profile (including its PIN) on the device.
    localStorage.removeItem("safeexit_admin_profile");
  }, []);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const name = formData.fullName.trim();
    const adminId = formData.adminId.trim();
    const pin = formData.pin.trim();

    if (!name || !adminId || !/^\d{4}$/.test(pin)) {
      setErrorMsg("Please enter your name, Admin ID, and 4-digit PIN.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/backend/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          loginId: buildAdminLoginId(adminId),
          password: pin,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Incorrect name, Admin ID, or PIN.");
        }
        if (response.status === 429) {
          throw new Error("Too many attempts. Please wait a few minutes and try again.");
        }
        throw new Error(data.message || "Could not sign in.");
      }

      if (data.role !== "Admin") {
        throw new Error("This account is not authorized for admin access.");
      }

      sessionStorage.setItem("safeexit_token", data.token);
      setStoredUser({
        name: data.name,
        role: "admin",
        roleLabel: "Administrator",
        id: data.studentId || adminId,
      });
      router.push("/dashboard/admin");
    } catch (error) {
      setErrorMsg(error?.message || "Could not sign in. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-[#eef2ff] via-[#e8ecff] to-[#e2e8ff]">
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/login/hostel-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="pointer-events-none select-none object-cover opacity-[0.18]"
          priority
        />
      </div>
      <div className="absolute -left-24 -top-24 z-0 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="absolute -right-20 top-16 z-0 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 z-0 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative z-10 flex flex-1 flex-col items-center px-4 py-6 sm:py-8">
        <Link href="/" className="group mb-4 flex flex-col items-center gap-1.5 sm:mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Shield className="h-7 w-7" />
          </div>
          <div className="text-center">
            <span className="font-sans text-2xl font-bold tracking-tight text-slate-900">
              NITP-Safe<span className="text-indigo-600">Exit</span>
            </span>
            <p className="text-[11px] font-medium tracking-wide text-slate-500">
              Admin Console · Command Center
            </p>
          </div>
        </Link>

        <div className="w-full max-w-[500px] overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-indigo-900/10">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-center gap-2 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-semibold">Administrator Login</span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-slate-900">Admin Sign In</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Enter your administrator credentials to continue.
                </p>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="admin-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-name"
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    autoComplete="name"
                    autoFocus
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-id" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Admin ID
                </label>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-id"
                    type="text"
                    name="adminId"
                    value={formData.adminId}
                    onChange={handleInputChange}
                    autoComplete="username"
                    placeholder="e.g. ADM001"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-pin" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  4-Digit PIN
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-pin"
                    type="password"
                    name="pin"
                    value={formData.pin}
                    onChange={(event) =>
                      setFormData((previous) => ({
                        ...previous,
                        pin: event.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={4}
                    placeholder="Enter your PIN"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isProcessing ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
