import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }) {
	return (
		<div className="min-h-screen dashboard-gradient text-slate-900">
			<div className="relative overflow-hidden">
				<div className="absolute inset-0 bg-grid-pattern opacity-50" />
				<div className="absolute inset-0 bg-dot-pattern opacity-35" />
				<div className="aurora-layer" />
				<div className="absolute -top-16 right-10 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl" />
				<div className="absolute bottom-0 left-6 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />

				<div className="relative mx-auto flex min-h-screen max-w-[1440px] gap-6 px-4 pb-12 pt-8 md:px-6 lg:px-8">
					<Sidebar />

					<div className="flex w-full flex-1 flex-col gap-6">
						<Topbar />

						<main className="flex-1">{children}</main>
					</div>
				</div>
			</div>
		</div>
	);
}
