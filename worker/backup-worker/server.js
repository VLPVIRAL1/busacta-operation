// Standalone backup worker — deploy on Render / Fly.io / Railway / any VPS.
// Triggered by the "Generate Full SQL Backup" button in the BusAcTa Admin Panel.
//
// Required env vars:
//   SUPABASE_URL                e.g. https://sgewqhxcknlllpkcurkf.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (KEEP SECRET — never in frontend)
//   DATABASE_URL                postgres connection string (Supabase → Project Settings → Database → Connection string → URI)
//   PORT                        optional, defaults to 8080
//
// pg_dump must be on PATH. The Dockerfile installs it via `postgresql-client`.

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, PORT = "8080" } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error(
    "Missing required env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL).",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.use(express.json());

// CORS — open POST for the trigger endpoint. The JWT is the real auth.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, service: "busacta-backup-worker" }));

app.post("/trigger-backup", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  // 1. Validate the JWT against Supabase Auth.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const userId = userData.user.id;

  // 2. Confirm the caller is an admin via your has_role() function.
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSuper } = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (!isAdmin && !isSuper) {
    return res.status(403).json({ error: "Admin role required" });
  }

  // 3. Respond immediately, run pg_dump + upload in the background.
  res.status(202).json({ accepted: true, userId });

  runBackup(userId).catch((err) => console.error("[backup] failed:", err));
});

async function runBackup(userId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${stamp}.sql`;
  const dir = await mkdtemp(join(tmpdir(), "pgdump-"));
  const filepath = join(dir, filename);

  console.log(`[backup] starting ${filename} (requested by ${userId})`);

  await new Promise((resolve, reject) => {
    // --no-owner / --no-privileges keep the dump portable across hosts.
    const proc = spawn(
      "pg_dump",
      [DATABASE_URL, "--no-owner", "--no-privileges", "--clean", "--if-exists", "--file", filepath],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    proc.on("error", reject);
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`))));
  });

  const buf = await readFile(filepath);
  const { error: uploadErr } = await admin.storage
    .from("database-backups")
    .upload(filename, buf, { contentType: "application/sql", upsert: false });

  await unlink(filepath).catch(() => {});

  if (uploadErr) throw uploadErr;
  console.log(`[backup] uploaded ${filename} (${buf.byteLength} bytes)`);
}

app.listen(Number(PORT), () => console.log(`backup worker listening on :${PORT}`));
