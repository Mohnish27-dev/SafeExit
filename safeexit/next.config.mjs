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
};

export default nextConfig;
