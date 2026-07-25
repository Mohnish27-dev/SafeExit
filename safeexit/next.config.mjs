import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Emit a self-contained server bundle (server.js + minimal node_modules) for Docker.
  output: 'standalone',
  // Pin Turbopack root so Next.js does not pick the parent SafeExit/ folder
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    // In Docker the backend is another container, reachable by its service name.
    // Locally this falls back to 127.0.0.1:5000. Override with BACKEND_ORIGIN.
    const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:5000';
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  async redirects() {
    // The warden designation was renamed to caretaker (same person, same routing).
    // Keeps old bookmarks, installed-PWA shortcuts and — most importantly — already
    // delivered push notifications working; their ?view= query is carried over.
    return [
      { source: '/dashboard/warden', destination: '/dashboard/caretaker', permanent: true },
      { source: '/dashboard/warden/:path*', destination: '/dashboard/caretaker/:path*', permanent: true },
      { source: '/login/warden', destination: '/login/caretaker', permanent: true },
    ];
  },
};

export default nextConfig;
