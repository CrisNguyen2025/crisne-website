/**
 * Add Lesson Status to RoadmapItem (ADR-0010): `status` (target | learning | known, default known) and
 * `statusUpdatedAt` (null until the status first changes).
 *
 *   yarn db:lesson-status            # dry-run on Turso if configured: prints what would change, writes nothing
 *   yarn db:lesson-status --local    # dry-run on prisma/dev.db
 *   yarn db:lesson-status --apply    # write; only after the dry-run was reviewed
 *
 * Adding columns keeps every row: existing lessons become `known`, as ADR-0010 decides. Columns that already
 * exist are left alone, so running it twice changes nothing. Backs up RoadmapItem to JSON first.
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

// SQLite cannot add a column whose default is not a constant, so statusUpdatedAt starts null
const COLUMNS: { name: string; sql: string }[] = [
  { name: "status", sql: `ALTER TABLE "RoadmapItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'known'` },
  { name: "statusUpdatedAt", sql: `ALTER TABLE "RoadmapItem" ADD COLUMN "statusUpdatedAt" DATETIME` },
];

function connect(): { client: Client; target: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!local && url && authToken) return { client: createClient({ url, authToken }), target: "turso" };
  const file = path.join(__dirname, "../prisma/dev.db");
  return { client: createClient({ url: `file:${file}` }), target: "prisma/dev.db" };
}

async function main() {
  const { client, target } = connect();
  console.log(`target: ${target}${apply ? "  (APPLY)" : "  (dry-run)"}`);

  const existing = new Set(
    (await client.execute(`PRAGMA table_info("RoadmapItem")`)).rows.map((r) => String(r.name))
  );
  const lessons = Number((await client.execute(`SELECT COUNT(*) AS n FROM "RoadmapItem"`)).rows[0].n);
  const missing = COLUMNS.filter((c) => !existing.has(c.name));

  console.log(`lessons: ${lessons}`);
  for (const c of COLUMNS) console.log(`  ${c.name}: ${existing.has(c.name) ? "already there" : "will be added"}`);
  if (!missing.length) {
    console.log("\nNothing to do.");
    return;
  }
  if (!apply) {
    console.log(`\nDry-run only. ${lessons} lessons would become 'known'. Re-run with --apply after reviewing.`);
    return;
  }

  const rows = (await client.execute(`SELECT * FROM "RoadmapItem"`)).rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))
  );
  const backupFile = path.join(__dirname, `../lesson-status-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), RoadmapItem: rows }, null, 2));
  console.log(`backup: ${backupFile}`);

  await client.batch(missing.map((c) => c.sql), "write");
  const after = (await client.execute(`SELECT status, COUNT(*) AS n FROM "RoadmapItem" GROUP BY status`)).rows;
  console.log("applied:", after.map((r) => `${r.status}=${r.n}`).join(", ") || "no lessons");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
