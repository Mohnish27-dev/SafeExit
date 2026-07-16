// Demo profile store (by roll number) in the OS temp dir; survives dev restarts.
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Node.js runtime required — this handler uses the filesystem
export const runtime = "nodejs";

const STORE_PATH = path.join(os.tmpdir(), "safeexit-profiles.json");

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    // File missing or unreadable → empty store
    return {};
  }
}

async function writeStore(store) {
  await fs.writeFile(STORE_PATH, JSON.stringify(store), "utf8");
}

export async function POST(request) {
  try {
    const data = await request.json();
    if (!data.rollNo) {
      return Response.json({ error: "Roll number is required" }, { status: 400 });
    }

    const store = await readStore();
    store[data.rollNo] = data;
    await writeStore(store);

    return Response.json({ success: true, message: "Profile saved successfully" });
  } catch (error) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rollNo = searchParams.get("rollNo");

  if (!rollNo) {
    return Response.json({ error: "Roll number is required" }, { status: 400 });
  }

  const store = await readStore();
  const user = store[rollNo];
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({ success: true, profile: user });
}
