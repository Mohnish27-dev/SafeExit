"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ShieldCheck, EyeOff, Radio, Lock, Unlock, KeyRound, Fingerprint } from "lucide-react";
import useScrollReveal from "../hooks/useScrollReveal";

const securityPillars = [
  { title: "AES-256 Contact Encryption", desc: "All phone numbers and room details are encrypted at rest. Guards see only a hashed validation token.", icon: <Lock className="h-5 w-5 text-indigo-400" /> },
  { title: "Relay Phone Masking", desc: "Guard calls route through an in-app masked relay (like Uber/Ola), completely hiding real numbers.", icon: <EyeOff className="h-5 w-5 text-violet-400" /> },
  { title: "AI Misuse Alerts", desc: "Every lookup is logged. An AI monitor alerts admins if staff view a profile repeatedly or off-duty.", icon: <Radio className="h-5 w-5 text-rose-400" /> },
  { title: "Role-Restricted Decryption", desc: "Data decrypts only via temporary multi-auth keys held by the Registrar and Warden during emergencies.", icon: <ShieldCheck className="h-5 w-5 text-emerald-400" /> },
];

const CIPHER = "AF3B9E7C2D8140";
const PLAIN_PHONE = "+91 98765 43210";
const PLAIN_ROOM = "Room 304-B";

// Deterministic pseudo-cipher chars (no Math.random → SSR-safe, no hydration drift).
const scrambleChar = (seed) => "ABCDEF0123456789#@%&".charAt((seed * 7 + 3) % 20);

function VaultPlate({ open }) {
  const phone = open ? PLAIN_PHONE : PLAIN_PHONE.split("").map((c, i) => (c === " " ? " " : scrambleChar(i + 2))).join("");
  const room = open ? PLAIN_ROOM : PLAIN_ROOM.split("").map((c, i) => (c === " " ? " " : scrambleChar(i + 9))).join("");

  return (
    <div className="relative rounded-xl bg-black/40 border border-white/10 p-4 font-mono overflow-hidden">
      <div className={`decrypt-sweep ${open ? "decrypt-sweep--run" : ""}`} key={open ? "open" : "closed"}></div>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Encrypted Record</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${open ? "text-emerald-300" : "text-rose-300"}`}>
          {open ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {open ? "Decrypted" : "AES-256"}
        </span>
      </div>
      <div className="space-y-2 relative z-10">
        <div>
          <p className="text-[9px] text-slate-500 mb-0.5">PHONE</p>
          <p className="text-sm font-bold tracking-wider">
            {phone.split("").map((c, i) => (
              <span key={i} className={`cipher-char ${open ? "cipher-char--open" : "cipher-char--locked"}`}>{c}</span>
            ))}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-500 mb-0.5">ROOM</p>
          <p className="text-sm font-bold tracking-wider">
            {room.split("").map((c, i) => (
              <span key={i} className={`cipher-char ${open ? "cipher-char--open" : "cipher-char--locked"}`}>{c}</span>
            ))}
          </p>
        </div>
        <div className="pt-1">
          <p className="text-[9px] text-slate-500 mb-0.5">CIPHERTEXT</p>
          <p className="text-[11px] text-slate-500 break-all leading-relaxed">{CIPHER}9F1E{CIPHER.slice(0, 6)}…</p>
        </div>
      </div>
    </div>
  );
}

export default function Security() {
  useScrollReveal();
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);

  // Press-and-hold the key to decrypt (mimics a multi-auth unlock).
  const startHold = useCallback(() => {
    setHolding(true);
    timer.current = setTimeout(() => { setOpen(true); setHolding(false); }, 900);
  }, []);

  const cancelHold = useCallback(() => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Auto-relock after a few seconds so the demo loops for every viewer.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setOpen(false), 4200);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <section id="security" className="py-20 bg-slate-900 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 -z-10 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -z-10 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl"></div>
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

          {/* Text + pillars */}
          <div className="lg:col-span-6 space-y-6">
            <span className="reveal inline-block text-xs font-extrabold text-cyan-200 uppercase tracking-widest bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
              Safety-Grade Privacy
            </span>
            <h3 className="reveal font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              Safety That Never Trades Away Privacy
            </h3>
            <p className="reveal text-slate-400 text-base leading-relaxed font-medium">
              Student safety cannot come at the cost of privacy. SafeExit enforces encrypted logs and anonymous access filters so authorities can protect students without ever exposing personal data.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {securityPillars.map((pillar, idx) => (
                <div
                  key={idx}
                  style={{ transitionDelay: `${idx * 70}ms` }}
                  className="reveal p-5 bg-slate-800/40 border border-slate-750/70 rounded-2xl space-y-3 hover:border-indigo-500/50 hover:bg-slate-800/70 transition-all duration-300"
                >
                  <div className="h-10 w-10 bg-slate-850 rounded-xl flex items-center justify-center border border-slate-700/60">
                    {pillar.icon}
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-100">{pillar.title}</h4>
                  <p className="text-xs text-slate-450 leading-relaxed font-medium">{pillar.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive encryption vault */}
          <div className="lg:col-span-6 reveal" style={{ transitionDelay: "120ms" }}>
            <div className="vault p-7 sm:p-8 relative">
              {/* Falling code rain */}
              <div className="vault-rain" aria-hidden="true">
                {[8, 24, 40, 56, 72, 88].map((left, i) => (
                  <span key={i} style={{ left: `${left}%`, animationDuration: `${6 + i}s`, animationDelay: `${i * 0.7}s` }}>
                    01001010110100101101001011010
                  </span>
                ))}
              </div>

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                    <Fingerprint className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">Zero-Trust Vault</p>
                    <p className="text-[10px] text-slate-400 font-medium">Multi-auth decryption demo</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${open ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : "text-rose-300 border-rose-500/40 bg-rose-500/10"}`}>
                  {open ? "UNLOCKED" : "SECURED"}
                </span>
              </div>

              {/* Encrypted plate */}
              <div className="relative z-10">
                <VaultPlate open={open} />
              </div>

              {/* Key control */}
              <div className="relative z-10 mt-6 flex flex-col items-center gap-3">
                <div className="relative">
                  <span className="key-halo h-20 w-20 -left-2 -top-2"></span>
                  <button
                    onMouseDown={startHold}
                    onMouseUp={cancelHold}
                    onMouseLeave={cancelHold}
                    onTouchStart={startHold}
                    onTouchEnd={cancelHold}
                    disabled={open}
                    className={`relative h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                      open
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
                        : holding
                        ? "bg-cyan-500 text-white scale-95 shadow-lg shadow-cyan-500/50"
                        : "bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:bg-slate-750"
                    }`}
                  >
                    {open ? <Unlock className="h-6 w-6" /> : <KeyRound className={`h-6 w-6 ${holding ? "animate-pulse" : ""}`} />}
                  </button>
                </div>
                <p className="text-[11px] font-semibold text-slate-400 text-center">
                  {open ? "Record decrypted · auto-relocks in seconds" : holding ? "Authenticating…" : "Press & hold the key to decrypt"}
                </p>
              </div>

              {/* Footer note */}
              <div className="relative z-10 mt-6 flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-700/50">
                <ShieldCheck className="h-5 w-5 text-cyan-300 shrink-0" />
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Every QR pass is verified live against the server at the gate — a screenshot or stale pass can never get a student through.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
