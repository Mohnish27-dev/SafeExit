// Backend fetch helpers. Token in sessionStorage (per-tab); httpOnly cookie covers EventSource.

export const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    // Localhost hits :5000 directly; elsewhere use the /api/backend rewrite proxy.
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocalhost) {
      const apiPort = port === "3000" ? "5000" : port;
      return `${protocol}//${hostname}:${apiPort}/api`;
    }
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

// Sends credentials + auth header, parses JSON, throws on non-2xx
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
