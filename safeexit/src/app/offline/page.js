export const metadata = {
  title: "Offline | NITP-SafeExit",
  description: "You are currently offline.",
};

export default function Offline() {
  return (
    <div className="min-h-screen bg-[var(--background)] dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center px-6 font-sans">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-8 w-8 text-slate-500 dark:text-slate-400"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3l18 18M9.75 9.75a3 3 0 014.5 4.5M6.343 6.343a8.25 8.25 0 000 11.314M17.657 6.343a8.25 8.25 0 010 11.314M12 18.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          NITP-SafeExit can&apos;t reach the network right now. Check your connection —
          the app will reconnect automatically once you&apos;re back online.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 transition hover:opacity-90"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
