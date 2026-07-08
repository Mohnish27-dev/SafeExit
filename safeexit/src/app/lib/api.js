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
    const apiPort = port === "3000" ? "5000" : port;
    return `${protocol}//${hostname}:${apiPort}/api`;
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
