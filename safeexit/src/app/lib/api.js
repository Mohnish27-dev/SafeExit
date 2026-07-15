// Shared helpers for talking to the Express backend.
//
// In dev the frontend runs on :3000 and the API on :5000. The same origin is
// reused in production via NEXT_PUBLIC_API_URL. Auth is carried primarily via
// the sessionStorage token as a Bearer header, kept in sessionStorage (not
// localStorage) so each browser TAB has its own independent session — logging
// into a different role in another tab can't hijack this tab's identity. The
// httpOnly `jwt` cookie (credentials: "include") rides along as a fallback for
// requests that can't attach custom headers (e.g. EventSource). The backend's
// `protect` middleware prefers the header over the cookie for this reason.

export const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    // On localhost (direct dev), talk to the Express backend on :5000.
    // Everywhere else (devtunnels, production, any deployment) only the
    // Next.js port is reachable, so route through the Next.js rewrite at
    // /api/backend/:path* → http://127.0.0.1:5000/api/:path*
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocalhost) {
      const apiPort = port === "3000" ? "5000" : port;
      return `${protocol}//${hostname}:${apiPort}/api`;
    }
    // Non-localhost: use the rewrite proxy path (relative URL, same origin)
    return "/api/backend";
  }
  return "http://localhost:5000/api";
};

const authHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("safeexit_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

// Thin wrapper that always sends credentials + auth header and parses JSON.
// Throws an Error carrying the server message on non-2xx responses.
export const apiFetch = async (path, options = {}) => {
  const res = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
};
