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
};

export default nextConfig;
