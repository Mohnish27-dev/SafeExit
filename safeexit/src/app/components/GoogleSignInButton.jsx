"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/app/lib/api";

// "Sign in with Google" for wardens and the Chief Warden (Google Identity Services).
//
// The button hands back a Google-signed ID token; the backend (POST /auth/google) verifies
// it and decides whether that college email may in. Nothing here is a security boundary:
// `hd` only makes Google's account chooser prefer @nitp.ac.in accounts.
//
// The client ID comes from the backend rather than a NEXT_PUBLIC_ variable, so the
// on-prem deployment sets it once in backend/.env instead of rebuilding the frontend.

const GSI_SRC = "https://accounts.google.com/gsi/client";
const COLLEGE_DOMAIN = "nitp.ac.in";

let scriptPromise = null;
const loadGsi = () => {
	if (typeof window === "undefined") return Promise.reject(new Error("no window"));
	if (window.google?.accounts?.id) return Promise.resolve();
	if (!scriptPromise) {
		scriptPromise = new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = GSI_SRC;
			script.async = true;
			script.defer = true;
			script.onload = () => resolve();
			script.onerror = () => {
				scriptPromise = null; // allow a retry on the next mount
				reject(new Error("Could not reach Google. Check the internet connection and reload."));
			};
			document.head.appendChild(script);
		});
	}
	return scriptPromise;
};

let clientIdPromise = null;
const fetchClientId = () => {
	if (!clientIdPromise) {
		clientIdPromise = apiFetch("/auth/google/config")
			.then((data) => data?.clientId || null)
			.catch((err) => {
				clientIdPromise = null;
				throw err;
			});
	}
	return clientIdPromise;
};

export default function GoogleSignInButton({ onCredential, loginHint = "", disabled = false }) {
	const containerRef = useRef(null);
	// GSI keeps the callback it was initialised with; route through a ref so it always
	// calls the page's current handler.
	const handlerRef = useRef(onCredential);
	const [state, setState] = useState("loading"); // loading | ready | error
	const [message, setMessage] = useState("");

	useEffect(() => {
		handlerRef.current = onCredential;
	}, [onCredential]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const clientId = await fetchClientId();
				if (!clientId) {
					throw new Error("Google sign-in is not configured yet. Contact the administrator.");
				}
				await loadGsi();
				if (cancelled || !containerRef.current) return;

				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: (response) => handlerRef.current?.(response.credential),
					hd: COLLEGE_DOMAIN,
					login_hint: loginHint || undefined,
					auto_select: false,
					cancel_on_tap_outside: true,
					ux_mode: "popup",
					context: "signin",
				});
				containerRef.current.innerHTML = "";
				window.google.accounts.id.renderButton(containerRef.current, {
					type: "standard",
					theme: "outline",
					size: "large",
					text: "signin_with",
					shape: "pill",
					logo_alignment: "left",
					width: Math.min(360, containerRef.current.offsetWidth || 320),
				});
				setState("ready");
			} catch (err) {
				if (cancelled) return;
				setMessage(err?.message || "Google sign-in is unavailable right now.");
				setState("error");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [loginHint]);

	return (
		<div className="w-full">
			{state === "loading" && (
				<div className="flex h-11 items-center justify-center gap-2 text-sm font-medium text-slate-400">
					<Loader2 className="h-4 w-4 animate-spin" /> Loading Google sign-in…
				</div>
			)}
			{state === "error" && (
				<p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
					{message}
				</p>
			)}
			<div
				ref={containerRef}
				aria-disabled={disabled}
				className={`flex min-h-11 w-full justify-center ${state === "ready" ? "" : "hidden"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
			/>
		</div>
	);
}
