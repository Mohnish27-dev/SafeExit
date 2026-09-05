import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  GraduationCap,
  Heart,
  Mail,
  MapPin,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  TEAM,
  TEAM_ACKNOWLEDGEMENTS,
  TEAM_MEMBERS,
  TEAM_MENTORS,
  memberHasLinks,
} from "@/app/lib/team";
import { getInitials } from "@/app/lib/userProfile";

export const metadata = {
  title: `Built by ${TEAM.name} | NITP-SafeExit`,
  description: `NITP-SafeExit was designed and built by ${TEAM.name}, students of ${TEAM.institute}.`,
  // A public credits page is the one page here worth giving a link preview to —
  // it gets shared on LinkedIn, where the card is most of the impression.
  openGraph: {
    title: `Built by ${TEAM.name} — NITP-SafeExit`,
    description: `The student team behind NITP-SafeExit at ${TEAM.institute}.`,
    images: ["/images/screenshot-wide.png"],
  },
};

// lucide-react v1 dropped every brand icon, and a generic link glyph would lose
// the instant recognition that makes these chips worth tapping — so the two
// brand marks are inlined here (official simple-icons paths, CC0).
function GithubMark({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function LinkedinMark({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.454C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

const linkChipClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2";

function MemberLinks({ member }) {
  if (!memberHasLinks(member)) return null;

  return (
    <div className="mt-4 flex items-center gap-2">
      {member.linkedin && (
        <a
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className={linkChipClass}
          aria-label={`${member.name} on LinkedIn`}
        >
          <LinkedinMark className="h-4 w-4" />
        </a>
      )}
      {member.github && (
        <a
          href={member.github}
          target="_blank"
          rel="noopener noreferrer"
          className={linkChipClass}
          aria-label={`${member.name} on GitHub`}
        >
          <GithubMark className="h-4 w-4" />
        </a>
      )}
      {member.email && (
        <a
          href={`mailto:${member.email}`}
          className={linkChipClass}
          aria-label={`Email ${member.name}`}
        >
          <Mail className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function MemberCard({ member }) {
  // Roll no / branch / year are three independent optionals sharing one line —
  // filter before joining so a missing one never leaves a dangling separator.
  const meta = [member.rollNo, member.branch, member.yearOfStudy].filter(Boolean);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-600/10 sm:p-6">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-indigo-600 via-violet-500 to-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-600/25 ring-2 ring-white sm:h-18 sm:w-18">
          {member.photo ? (
            <Image
              src={member.photo}
              alt={member.name}
              fill
              sizes="72px"
              className="object-cover"
              // Portrait photos need the crop biased upward or the square avatar
              // takes a slice out of the top of the head.
              style={member.photoPosition ? { objectPosition: member.photoPosition } : undefined}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-extrabold tracking-tight">
              {getInitials(member.name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold tracking-tight text-slate-900">
            {member.name}
          </h3>
          {member.role && (
            <p className="mt-0.5 text-sm font-bold text-indigo-600">{member.role}</p>
          )}
          {meta.length > 0 && (
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {meta.join(" · ")}
            </p>
          )}
        </div>
      </div>

      {member.contributions?.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
          {member.contributions.map((item) => (
            <li key={item} className="flex gap-2 text-sm font-medium text-slate-600">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <MemberLinks member={member} />
    </article>
  );
}

function MentorCard({ mentor }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tracking-tight text-slate-900">
            {mentor.name}
          </p>
          {mentor.title && (
            <p className="truncate text-sm font-bold text-indigo-600">{mentor.title}</p>
          )}
          {mentor.department && (
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{mentor.department}</p>
          )}
        </div>
      </div>

      {(mentor.email || mentor.webpage) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mentor.email && (
            <a
              href={`mailto:${mentor.email}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <Mail className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
              {mentor.email}
            </a>
          )}
          {mentor.webpage && (
            <a
              href={mentor.webpage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <Globe className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
              Personal webpage
            </a>
          )}
        </div>
      )}

      {mentor.specializations?.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Specialization
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mentor.specializations.map((area) => (
              <span
                key={area}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f0f0ff]">
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/login/hostel-bg.png"
          alt=""
          fill
          className="pointer-events-none select-none object-cover opacity-[0.18]"
          // Next 16 deprecated `priority`. This is a decorative 18%-opacity
          // backdrop, not the LCP element, so eager loading is the right call.
          loading="eager"
        />
      </div>
      <div className="absolute inset-x-0 top-0 z-1 h-40 bg-linear-to-b from-[#f0f0ff] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-1 h-40 bg-linear-to-t from-[#f0f0ff] to-transparent" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <Link href="/login" className="group flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-shadow group-hover:shadow-indigo-600/50">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <span className="font-sans text-xl font-bold tracking-tight text-slate-900">
              NITP-Safe<span className="text-indigo-600">Exit</span>
            </span>
            <p className="-mt-0.5 text-[10px] font-medium tracking-wide text-slate-500">
              Secure Access. Safer Campuses.
            </p>
          </div>
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-600 backdrop-blur-sm transition-all hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 sm:px-4"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back to login</span>
          <span className="sm:hidden">Back</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 pb-12 sm:px-8">
        <section className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600 shadow-sm backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Made by students
          </span>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {TEAM.name}
          </h1>
          {TEAM.tagline && (
            <p className="mx-auto mt-3 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
              {TEAM.tagline}
            </p>
          )}
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-indigo-600" />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-600 sm:text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5 backdrop-blur-sm">
              <GraduationCap className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              {TEAM.institute}
            </span>
            {TEAM.campus && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5 backdrop-blur-sm">
                <MapPin className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                {TEAM.campus}
              </span>
            )}
            {TEAM.session && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5 backdrop-blur-sm">
                Session {TEAM.session}
              </span>
            )}
          </div>

          {(TEAM.repoUrl || TEAM.contactEmail) && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {TEAM.repoUrl && (
                <a
                  href={TEAM.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-[0.98]"
                >
                  <GithubMark className="h-4 w-4" />
                  View the source
                </a>
              )}
              {TEAM.contactEmail && (
                <a
                  href={`mailto:${TEAM.contactEmail}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/80 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md active:scale-[0.98]"
                >
                  <Mail className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                  Contact the team
                </a>
              )}
            </div>
          )}
        </section>

        <section className="mt-10 sm:mt-12">
          <h2 className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
            The people behind it
          </h2>
          {/* Capped narrower than the page: with a small team, cards left to fill
              the full 5xl width stretch into letterboxed slabs. */}
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {TEAM_MEMBERS.map((member) => (
              <MemberCard key={member.id ?? member.name} member={member} />
            ))}
          </div>
        </section>

        {TEAM_MENTORS.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
              Guided by
            </h2>
            {/* A lone mentor centres as a single card; two or more go side by side. */}
            <div
              className={`mx-auto grid grid-cols-1 gap-3 ${
                TEAM_MENTORS.length > 1 ? "max-w-3xl sm:grid-cols-2" : "max-w-md"
              }`}
            >
              {TEAM_MENTORS.map((mentor) => (
                <MentorCard key={mentor.name} mentor={mentor} />
              ))}
            </div>
          </section>
        )}

        {TEAM_ACKNOWLEDGEMENTS.length > 0 && (
          <section className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Heart className="h-4 w-4 text-rose-500" aria-hidden="true" />
              With thanks to
            </h2>
            <ul className="mt-3 space-y-2">
              {TEAM_ACKNOWLEDGEMENTS.map((item) => (
                <li key={item} className="flex gap-2 text-sm font-medium text-slate-600">
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="relative z-10 px-4 pb-8 text-center">
        <p className="text-xs font-semibold text-slate-500">
          NITP-SafeExit © {new Date().getFullYear()} · Built for student safety &amp; accountability.
        </p>
      </footer>
    </div>
  );
}
