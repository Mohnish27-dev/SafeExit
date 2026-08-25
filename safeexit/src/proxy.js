// Gate for the two commissioning tools, /scanner-check and /gate-cards.
//
// Both pages are unauthenticated by design — they are setup material for a gate
// station, not dashboards. In production they must not be reachable by anyone who
// simply guesses the URL, so they sit behind a server-only env flag:
//   SCANNER_TOOLS=1              -> routes serve normally
//   unset / any other value      -> routes 404
//
// Proxy (the Next.js 16 rename of middleware) runs at step 3 of the request chain,
// before filesystem routes at step 5, so this gates the statically prerendered
// pages too. Runs on the Node.js runtime by default.
//
// Read at RUNTIME, not baked into the build: Next inlines only NEXT_PUBLIC_* vars
// (see lib/static-env.js), so a bare SCANNER_TOOLS stays a live process.env lookup.
// Flipping it is a container restart, not a rebuild — and because the name has no
// NEXT_PUBLIC_ prefix, the flag never reaches the browser bundle.

import { NextResponse } from "next/server";

export default function proxy() {
  if (process.env.SCANNER_TOOLS === "1") {
    return NextResponse.next();
  }
  // A bare 404 rather than a redirect: a redirect would confirm the route exists.
  return new NextResponse(null, { status: 404 });
}

// `:path*` is zero-or-more, so these cover the bare paths as well. Matcher values
// must be static literals — the docs note dynamic values are silently ignored.
export const config = {
  matcher: ["/scanner-check/:path*", "/gate-cards/:path*"],
};
