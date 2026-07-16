"use client";

import { Loader2 } from "lucide-react";

// Full-screen placeholder while useRequireAuth verifies; prevents protected content flashing.
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
