import SecurityDashboardPage from "./security/page";

const statusCards = [
  {
    label: "Inside campus",
    value: "142",
    tone: "from-emerald-400 to-teal-400",
    note: "Students currently in",
  },
  {
    label: "On outing",
    value: "68",
    tone: "from-amber-300 to-orange-400",
    note: "Students out",
  },
  {
    label: "Overdue",
    value: "12",
    tone: "from-rose-400 to-red-500",
    note: "Not yet returned",
  },
];

const quickActions = [
  {
    title: "Scan Entry (IN)",
    desc: "Validate QR when students arrive on campus.",
    tone: "from-emerald-400 to-emerald-600",
    button: "Scan entry",
  },
  {
    title: "Scan Exit (OUT)",
    desc: "Confirm approved outings with one scan.",
    tone: "from-sky-400 to-blue-500",
    button: "Scan exit",
  },
];

const recentScans = [
  {
    name: "Ananya Verma",
    meta: "3rd Year, CSE - STU2024CSE102",
    tag: "Entry (IN)",
    time: "09:15 AM",
  },
  {
    name: "Rohan Singh",
    meta: "2nd Year, ECE - STU2023ECE809",
    tag: "Exit (OUT)",
    time: "08:45 AM",
  },
  {
    name: "Priya Sharma",
    meta: "1st Year, IT - STU2024IT045",
    tag: "Entry (IN)",
    time: "08:20 AM",
  },
  {
    name: "Kunal Mehta",
    meta: "4th Year, ME - STU2022ME011",
    tag: "Exit (OUT)",
    time: "08:05 AM",
  },
];

export default function DashboardPage() {
  return <SecurityDashboardPage />;
}

function LegacyGuardDashboardPage() {
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-6">
          <div className="glass-panel rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Good morning, Ravi
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  Stay alert and keep the campus secure.
                </h2>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">19 May 2024</p>
                <p>09:41:23 AM</p>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Quick Scan</h3>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Live
              </span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {quickActions.map((action) => (
                <div
                  key={action.title}
                  className="rounded-2xl border border-slate-200 bg-white/70 p-4"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${action.tone} text-white`}>
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 7h10v10H7z" />
                      <path d="M12 7v10" />
                      <path d="M7 12h10" />
                    </svg>
                  </div>
                  <h4 className="mt-3 text-sm font-semibold text-slate-900">
                    {action.title}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">{action.desc}</p>
                  <button
                    className={`mt-4 w-full rounded-full bg-gradient-to-r ${action.tone} px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white`}
                  >
                    {action.button}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Students Status</h3>
              <button className="text-xs font-semibold text-slate-500">View all</button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {statusCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-slate-200 bg-white/70 p-4"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${card.tone} text-white`}>
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <path d="M20 8v6" />
                      <path d="M23 11h-6" />
                    </svg>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
                  <p className="text-xs font-semibold text-slate-700">{card.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{card.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Recent Scans</h3>
              <button className="text-xs font-semibold text-slate-500">View all</button>
            </div>
            <div className="mt-4 space-y-3">
              {recentScans.map((scan) => (
                <div
                  key={`${scan.name}-${scan.time}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                      {scan.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{scan.name}</p>
                      <p className="text-xs text-slate-500">{scan.meta}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                      {scan.tag}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{scan.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Shift signal
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">
              Zone readiness
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Main gate and hostel blocks are synced. One checkpoint is offline.
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: "Main gate", status: "Online", tone: "bg-emerald-100 text-emerald-700" },
                { label: "Hostel block A", status: "Online", tone: "bg-emerald-100 text-emerald-700" },
                { label: "Hostel block B", status: "Offline", tone: "bg-rose-100 text-rose-700" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3 py-2"
                >
                  <span className="text-xs font-semibold text-slate-600">{item.label}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${item.tone}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Alerts
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  2 students overdue
                </h3>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600">
                Action
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Please check the students who have not returned within their approved time window.
            </p>
            <button className="mt-4 w-full rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
              View now
            </button>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Guard notes
            </p>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <p>1. Verify QR camera lens before the next shift.</p>
              <p>2. Remind late students to submit approval slips.</p>
              <p>3. Keep escort log ready at Main Gate A.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-2 rounded-2xl bg-white/90 px-4 py-3 shadow-lg md:hidden">
        {[{ label: "Home" }, { label: "Students" }, { label: "History" }, { label: "Profile" }].map((item) => (
          <button
            key={item.label}
            className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold text-slate-500"
          >
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
