import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/safeexit",
	// The ERP host redirects `/safeexit` -> `/safeexit/`; Next's own normalization
	// redirects the slash back off. Serve both spellings instead of ping-ponging.
	skipTrailingSlashRedirect: true,
	reactCompiler: true,
	// Emit a self-contained server bundle (server.js + minimal node_modules) for Docker.
	output: "standalone",
	// Pin Turbopack root so Next.js does not pick the parent SafeExit/ folder
	turbopack: {
		root: projectRoot,
	},
	async rewrites() {
		// In Docker the backend is another container, reachable by its service name.
		// Locally this falls back to 127.0.0.1:5000. Override with BACKEND_ORIGIN.
		const backendOrigin =
			process.env.BACKEND_ORIGIN || "http://127.0.0.1:5000";
		return [
			{
				source: "/api/:path*",
				destination: `${backendOrigin}/api/:path*`,
			},
		];
	},
};

export default nextConfig;
