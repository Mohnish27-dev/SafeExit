"use client";

import { Loader2 } from "lucide-react";

// Full-screen placeholder shown while useRequireAuth verifies the session (and
// while an unauthorized redirect is in flight). Rendering this instead of the
// real dashboard is what prevents protected content from flashing before the
// redirect completes.
export default function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f0f0ff] text-slate-600">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium">Checking your session…</p>
      </div>
    </main>
  );
}
