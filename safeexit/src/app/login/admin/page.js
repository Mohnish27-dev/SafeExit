"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Shield, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import { getToken } from "@/app/lib/auth";
import { getStoredUser, setStoredUser } from "@/app/lib/userProfile";
import { BASE_PATH } from "@/app/lib/basePath";
import {
	clearLegacyQuickLogin,
	signInWithGoogle,
} from "@/app/lib/wardenGoogleLogin";

// The admin console is opened by one college Google account, safeexit@nitp.ac.in. The
// backend checks that address against its own allowlist and turns every other account
// away; the hint below only tells the Google chooser which account to offer.
const ADMIN_EMAIL = "safeexit@nitp.ac.in";

export default function AdminLoginPage() {
	const router = useRouter();
	const [ready, setReady] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		if (getToken() && getStoredUser()?.role === "admin") {
			router.replace("/dashboard/admin");
			return;
		}
		clearLegacyQuickLogin("admin");
		// eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate once on the client
		setReady(true);
	}, [router]);

	const handleCredential = useCallback(
		async (credential) => {
			setIsProcessing(true);
			setErrorMsg("");
			try {
				const data = await signInWithGoogle(credential, "Admin");
				if (data.role !== "Admin") {
					throw new Error(
						"This account is not authorized for admin access.",
					);
				}
				sessionStorage.setItem("safeexit_token", data.token);
				setStoredUser({
					name: data.name,
					role: "admin",
					roleLabel: "Administrator",
					id: data.email,
					email: data.email,
				});
				router.replace("/dashboard/admin");
			} catch (error) {
				setErrorMsg(
					error?.status === 429
						? "Too many attempts. Please wait a few minutes and try again."
						: error?.message || "Could not sign in. Please try again.",
				);
				setIsProcessing(false);
			}
		},
		[router],
	);

	if (!ready) return null;

	return (
		<div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-[#eef2ff] via-[#e8ecff] to-[#e2e8ff]">
			<div className="absolute inset-0 z-0">
				<Image
					src={`${BASE_PATH}/images/login/hostel-bg.png`}
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
				<Link
					href="/"
					className="group mb-4 flex flex-col items-center gap-1.5 sm:mb-6"
				>
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
						<Shield className="h-7 w-7" />
					</div>
					<div className="text-center">
						<span className="font-sans text-2xl font-bold tracking-tight text-slate-900">
							NITP-Safe
							<span className="text-indigo-600">Exit</span>
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
							<span className="text-sm font-semibold">
								Administrator Login
							</span>
						</div>
					</div>

					<div className="space-y-5 p-6 sm:p-8">
						<div className="text-center">
							<h1 className="text-2xl font-bold text-slate-900">
								Admin Sign In
							</h1>
							<p className="mt-1 text-sm text-slate-500">
								Sign in with the SafeExit administrator Google
								account (<span className="font-semibold text-slate-700">{ADMIN_EMAIL}</span>).
								Other accounts are not accepted.
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

						{isProcessing ? (
							<div className="flex h-11 items-center justify-center gap-2 text-sm font-semibold text-indigo-600">
								<Loader2 className="h-5 w-5 animate-spin" /> Signing in…
							</div>
						) : (
							<GoogleSignInButton
								onCredential={handleCredential}
								loginHint={ADMIN_EMAIL}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
