import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(root, ".next", "dev", "lock");
const killPorts = process.argv.includes("--ports");

function removeLock() {
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    console.log("Removed stale .next/dev/lock");
  }
}

function killPortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`Freed port ${port} (PID ${pid})`);
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* port already free */
  }
}

removeLock();

if (killPorts && process.platform === "win32") {
  killPortWindows(3000);
  killPortWindows(3001);
}

console.log(killPorts ? "Ports cleared. Run: npm run dev" : "Lock cleared. Use npm run dev:clean if port 3000 is still busy.");
