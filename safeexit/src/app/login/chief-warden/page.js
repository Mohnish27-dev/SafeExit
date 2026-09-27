"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TeamCreditLink from "@/app/components/TeamCreditLink";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import { ArrowLeft, Crown, Loader2, Shield } from "lucide-react";
import { getToken } from "@/app/lib/auth";
import { getStoredUser, setStoredUser } from "@/app/lib/userProfile";
import {
  clearLegacyQuickLogin,
  forgetEmail,
  getRememberedEmail,
  rememberEmail,
  signInWithGoogle,
} from "@/app/lib/wardenGoogleLogin";

// The Chief Warden signs in with their college Google account. Exactly one email is
// provisioned for this role; the backend turns every other account away, hostel wardens
// included.
export default function ChiefWardenLoginPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getToken() && getStoredUser()?.role === "chief-warden") {
      router.replace("/dashboard/chief-warden");
      return;
    }
    clearLegacyQuickLogin("chief-warden");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate device-local state once
    setRememberedEmail(getRememberedEmail("chief-warden"));
    setReady(true);
  }, [router]);

  const handleCredential = useCallback(
    async (credential) => {
      setLoading(true);
      setError("");
      try {
        const data = await signInWithGoogle(credential, "ChiefWarden");
        sessionStorage.setItem("safeexit_token", data.token);
        setStoredUser({
          name: data.name,
          role: "chief-warden",
          roleLabel: "Chief Warden",
          id: data.email,
          email: data.email,
        });
        rememberEmail("chief-warden", data.email);
        router.replace("/dashboard/chief-warden");
      } catch (err) {
        setError(err?.message || "Sign-in failed. Please try again.");
        setLoading(false);
      }
    },
    [router],
  );

  const useDifferentAccount = () => {
    forgetEmail("chief-warden");
    setRememberedEmail("");
    setError("");
  };

  if (!ready) return null;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-10">
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

        <div className="mt-7">
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {rememberedEmail ? "Welcome back. " : ""}Sign in with the Chief Warden&apos;s college Google account (@nitp.ac.in). Other accounts are not accepted.
            </p>
          </div>

          {error && <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

          {loading ? (
            <div className="flex h-11 items-center justify-center gap-2 text-sm font-semibold text-indigo-600">
              <Loader2 className="h-5 w-5 animate-spin" /> Signing in…
            </div>
          ) : (
            <GoogleSignInButton onCredential={handleCredential} loginHint={rememberedEmail} />
          )}

          {rememberedEmail && !loading && (
            <button type="button" onClick={useDifferentAccount} className="mt-5 block w-full text-center text-xs font-bold text-slate-400 hover:text-indigo-600">
              Not {rememberedEmail}? Use a different account
            </button>
          )}
        </div>
      </section>

      {/* A returning chief warden lands here, not on /login, so the team credit has to be
          reachable from this page too. */}
      <TeamCreditLink className="relative" />
    </main>
  );
}
