"use client";

export default function ComplaintsView({ reports = [], resolveReport = () => {}, setReports = () => {} }) {
  return (
    <section className="sd-luxe-panel sd-luxe-rise mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="sd-eyebrow">Complaints</p>
          <h2 className="sd-title sd-title-sm">All Reports</h2>
        </div>
        <button onClick={() => setReports([])} className="px-3 py-2 rounded bg-rose-600 text-white">Clear All</button>
      </div>
      <div className="mt-5 space-y-4">
        {reports.length === 0 ? <p className="text-sm text-slate-500">No reports</p> : reports.map((comp, i) => (
          <div key={comp.id} className="sd-luxe-card sd-timeline-item sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.08 + i * 0.04}s` }}>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${comp.tone}`}>
              <comp.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="sd-card-title text-slate-900">{comp.title}</p>
              <p className="sd-micro">{comp.by} • {comp.time}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>{comp.status}</span>
              <button onClick={() => resolveReport(comp.id)} className="px-3 py-1 rounded bg-emerald-600 text-white">Resolve</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
