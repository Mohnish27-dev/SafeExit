const navItems = [
	{ label: "Overview", status: "live" },
	{ label: "Scan Entry", status: "ready" },
	{ label: "Scan Exit", status: "ready" },
	{ label: "Students", status: "monitor" },
	{ label: "History", status: "review" },
	{ label: "Escalations", status: "alert" },
];

const activeLabel = "Overview";

export default function Sidebar() {
	return (
		<aside className="hidden w-[270px] flex-shrink-0 flex-col gap-6 md:flex">
			<div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-4 shadow-lg shadow-amber-100/70">
				<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-sky-400 text-white shadow-sm">
					<span className="text-lg font-semibold">SE</span>
				</div>
				<div>
					<p className="text-sm font-semibold text-slate-900">SafeExit</p>
					<p className="text-xs text-slate-500">Security Guard</p>
				</div>
			</div>

			<nav className="glass-panel rounded-2xl border border-white/60 p-4 shadow-lg shadow-amber-100/60">
				<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
					Navigation
				</p>
				<div className="mt-4 space-y-3">
					{navItems.map((item) => {
						const isActive = item.label === activeLabel;
						return (
							<button
								key={item.label}
								className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition ${
									isActive
										? "border-white/70 bg-white/90 text-slate-900 shadow-sm"
										: "border-transparent text-slate-700 hover:border-white/70 hover:bg-white/70"
								}`}
							>
								<span>{item.label}</span>
								<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
									{item.status}
								</span>
							</button>
						);
					})}
				</div>
			</nav>

			<div className="glass-panel rounded-2xl border border-white/60 p-4 shadow-lg shadow-amber-100/60">
				<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
					Shift Pulse
				</p>
				<div className="mt-4 space-y-3">
					<div className="rounded-xl bg-white/80 p-3">
						<p className="text-xs text-slate-400">Active Zone</p>
						<p className="text-sm font-semibold text-slate-800">Main Gate A</p>
					</div>
					<div className="rounded-xl bg-white/80 p-3">
						<p className="text-xs text-slate-400">Checkpoints</p>
						<p className="text-sm font-semibold text-slate-800">6 online / 1 offline</p>
					</div>
					<div className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 p-3 text-white">
						<p className="text-xs uppercase tracking-widest">Shift status</p>
						<p className="text-base font-semibold">On patrol</p>
					</div>
				</div>
			</div>
		</aside>
	);
}
