"use client";

export default function ProfileView({ user, displayName }) {
  return (
    <section className="sd-luxe-panel sd-luxe-rise mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center gap-6">
        <div className="h-28 w-28 rounded-xl bg-linear-to-br from-indigo-600 to-cyan-400 flex items-center justify-center text-white text-3xl font-bold">{(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}</div>
        <div>
          <h2 className="text-2xl font-bold">{displayName}</h2>
          <p className="text-sm text-slate-500">{(user && (user.roleLabel || user.role)) || 'Chief Warden'}</p>
          <p className="mt-3 text-sm text-slate-700 max-w-xl">This is the Warden profile view. Add contact details, shift info and quick actions here so maintainers are impressed by the UX.</p>
          <div className="mt-4 flex gap-3">
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={() => alert('Edit profile (demo)')}>Edit Profile</button>
            <button className="px-4 py-2 rounded border" onClick={() => alert('Contact student (demo)')}>Contact</button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-xl bg-white/80 border"> <h4 className="font-bold">Shift</h4> <p className="text-sm text-slate-600">On patrol • Main Gate A</p> </div>
        <div className="p-4 rounded-xl bg-white/80 border"> <h4 className="font-bold">Contact</h4> <p className="text-sm text-slate-600">warden.priya@hostel.edu • +91 98765 43210</p> </div>
      </div>
    </section>
  );
}
