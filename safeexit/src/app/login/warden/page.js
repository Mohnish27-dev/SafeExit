"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, AlertCircle, Building2, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import TeamCreditLink from "@/app/components/TeamCreditLink";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import { getToken } from "@/app/lib/auth";
import { getStoredUser, setStoredUser } from "@/app/lib/userProfile";
import {
	clearLegacyQuickLogin,
	forgetEmail,
	getRememberedEmail,
	rememberEmail,
	signInWithGoogle,
} from "@/app/lib/wardenGoogleLogin";
import { BASE_PATH } from "@/app/lib/basePath";

// Wardens (and assistant wardens) are professors: they sign in with their @nitp.ac.in
// Google account. The backend only admits an email an admin provisioned as a warden, and
// the account's hostel decides which students the dashboard shows. There is no ID or
// PIN to hand out, and so nothing a student could pick up and replay.
export default function WardenLoginPage() {
	const router = useRouter();
	const [ready, setReady] = useState(false);
	const [rememberedEmail, setRememberedEmail] = useState("");
	const [errorMsg, setErrorMsg] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		if (getToken() && getStoredUser()?.role === "warden") {
			router.replace("/dashboard/warden");
			return;
		}
		clearLegacyQuickLogin("warden");
		// eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate device-local state once
		setRememberedEmail(getRememberedEmail("warden"));
		setReady(true);
	}, [router]);

	const handleCredential = useCallback(
		async (credential) => {
			setIsProcessing(true);
			setErrorMsg("");
			try {
				const data = await signInWithGoogle(credential, "Warden");
				sessionStorage.setItem("safeexit_token", data.token);
				setStoredUser({
					name: data.name,
					role: "warden",
					roleLabel: "Warden",
					id: data.email,
					email: data.email,
					managedHostel: data.managedHostel,
				});
				rememberEmail("warden", data.email);
				router.replace("/dashboard/warden");
			} catch (err) {
				setErrorMsg(err?.message || "Sign-in failed. Please try again.");
				setIsProcessing(false);
			}
		},
		[router],
	);

	const useDifferentAccount = () => {
		forgetEmail("warden");
		setRememberedEmail("");
		setErrorMsg("");
	};

	if (!ready) return null;

	return (
		<div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] via-[#efe8ff] to-[#e9e2ff] relative overflow-hidden">
			<div className="absolute inset-0 z-0">
				<Image
					src={`${BASE_PATH}/images/login/hostel-bg.png`}
					alt=""
					fill
					sizes="100vw"
					className="object-cover opacity-[0.18] pointer-events-none select-none"
					priority
				/>
			</div>
			<div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
			<div className="absolute top-16 -right-20 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
			<div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl z-0" />

			<div className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 sm:py-8 animate-fade-in-up">
				<Link
					href="/"
					className="flex flex-col items-center gap-1.5 group mb-4 sm:mb-6"
				>
					<div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
						<Shield className="h-7 w-7" />
					</div>
					<div className="text-center">
						<span className="font-sans text-2xl font-bold tracking-tight text-slate-900">
							NITP-Safe
							<span className="text-indigo-600">Exit</span>
						</span>
						<p className="text-[11px] font-medium text-slate-500 tracking-wide">
							Secure Access. Safer Campuses.
						</p>
					</div>
				</Link>

				<div className="w-full max-w-[440px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 p-6 sm:p-8 flex flex-col items-center text-center animate-fade-in-up">
					<div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg text-indigo-500 mb-5">
						<Building2 className="w-9 h-9" />
					</div>
					<h1 className="text-2xl font-bold text-slate-900">
						{rememberedEmail ? "Welcome Back, Warden" : "Warden Login"}
					</h1>
					<p className="text-sm text-slate-500 mt-2 mb-6 max-w-sm">
						Sign in with your college Google account (
						<span className="font-semibold text-slate-700">@nitp.ac.in</span>
						). You&apos;ll go straight to your hostel&apos;s dashboard.
					</p>

					{errorMsg && (
						<div
							role="alert"
							className="mb-5 w-full bg-rose-50 text-rose-700 text-sm font-medium p-3 rounded-xl border border-rose-100 flex items-start gap-2 text-left"
						>
							<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
							<span>{errorMsg}</span>
						</div>
					)}

					{isProcessing ? (
						<div className="flex h-11 items-center justify-center gap-2 text-sm font-semibold text-indigo-600">
							<Loader2 className="h-5 w-5 animate-spin" /> Signing in…
						</div>
					) : (
						<GoogleSignInButton
							onCredential={handleCredential}
							loginHint={rememberedEmail}
						/>
					)}

					{rememberedEmail && !isProcessing && (
						<button
							type="button"
							onClick={useDifferentAccount}
							className="mt-5 text-xs font-bold text-slate-400 hover:text-indigo-600"
						>
							Not {rememberedEmail}? Use a different account
						</button>
					)}

					<p className="mt-6 text-xs text-slate-400">
						Only wardens registered by the administrator can sign in.
					</p>
				</div>

				{/* A returning warden lands here, not on /login, so the team credit has to be
            reachable from this page too. */}
				<TeamCreditLink className="mt-6 mb-2" />
			</div>
		</div>
	);
}
