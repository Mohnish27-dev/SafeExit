import { DoorOpen, Phone, ShieldCheck, UserRound } from "lucide-react";

const phoneHref = (value) => `tel:${String(value || "").replace(/[^\d+]/g, "")}`;

function ContactCard({ label, name, phoneNumber, roomNumber, tone = "indigo" }) {
  const tones = tone === "rose"
    ? {
        shell: "border-rose-100 bg-rose-50/70",
        icon: "bg-rose-100 text-rose-600",
        link: "text-rose-700",
      }
    : {
        shell: "border-indigo-100 bg-indigo-50/60",
        icon: "bg-indigo-100 text-indigo-600",
        link: "text-indigo-700",
      };

  return (
    <article className={`min-w-0 rounded-2xl border p-3 ${tones.shell}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones.icon}`}>
          {tone === "rose" ? <ShieldCheck className="h-4.5 w-4.5" /> : <UserRound className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          {name && <p className="mt-0.5 break-words text-sm font-bold text-slate-800">{name}</p>}
          <a
            href={phoneHref(phoneNumber)}
            className={`mt-1 flex min-w-0 max-w-full items-start gap-1.5 text-sm font-bold hover:underline ${tones.link}`}
          >
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-all">{phoneNumber}</span>
          </a>
          {roomNumber && (
            <p className="mt-1 flex min-w-0 items-start gap-1.5 text-xs font-medium text-slate-500">
              <DoorOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">Room {roomNumber}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Emergency-only contacts shown beneath an SOS or overdue student card.
 * One column on phones prevents long names/numbers from widening the PWA viewport;
 * larger screens progressively expand to two and then three columns.
 */
export default function EmergencyContactsPanel({ student = {} }) {
  const trustedContacts = Array.isArray(student.closeContacts)
    ? student.closeContacts.filter((contact) => contact?.mobileNumber)
    : [];

  if (!student.guardianPhoneNumber && trustedContacts.length === 0) return null;

  return (
    <section
      aria-label="Emergency contacts"
      className="mt-3 min-w-0 rounded-2xl border border-slate-100 bg-white/80 p-3 sm:p-4"
    >
      <div className="mb-2.5 flex min-w-0 items-center gap-2">
        <Phone className="h-4 w-4 shrink-0 text-rose-500" />
        <div className="min-w-0">
          <h4 className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-700">
            Emergency contacts
          </h4>
          <p className="text-[11px] font-medium text-slate-400">Tap a number to call</p>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {student.guardianPhoneNumber && (
          <ContactCard
            label="Parent / Guardian"
            phoneNumber={student.guardianPhoneNumber}
            tone="rose"
          />
        )}
        {trustedContacts.map((contact, index) => (
          <ContactCard
            key={`${contact.mobileNumber}-${index}`}
            label={`Trusted contact ${index + 1}`}
            name={contact.name}
            phoneNumber={contact.mobileNumber}
            roomNumber={contact.roomNumber}
          />
        ))}
      </div>
    </section>
  );
}
