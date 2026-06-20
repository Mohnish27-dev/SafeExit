import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Pin Turbopack root so Next.js does not pick the parent SafeExit/ folder
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://127.0.0.1:5000/api/:path*', // Use 127.0.0.1 instead of localhost for better Node.js compatibility
      },
    ];
  },
};

export default nextConfig;
