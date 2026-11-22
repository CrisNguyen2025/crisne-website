/**
 * Migrate Turso / local SQLite for ADR-0015 (OwnerMemory + ThreadState extensions):
 * - Adds activeLessonId, activeLessonTitle, activeSection, closedAt to ThreadState
 * - Creates OwnerMemory table and indexes
 *
 *   yarn db:owner-memory            # dry-run on Turso if configured
 *   yarn db:owner-memory --local    # dry-run on prisma/dev.db
 *   yarn db:owner-memory --apply    # apply changes after reviewing dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const THREAD_STATE_COLUMNS: { name: string; sql: string }[] = [
  { name: "activeLessonId", sql: `ALTER TABLE "ThreadState" ADD COLUMN "activeLessonId" TEXT` },
  { name: "activeLessonTitle", sql: `ALTER TABLE "ThreadState" ADD COLUMN "activeLessonTitle" TEXT` },
  { name: "activeSection", sql: `ALTER TABLE "ThreadState" ADD COLUMN "activeSection" TEXT` },
  { name: "closedAt", sql: `ALTER TABLE "ThreadState" ADD COLUMN "closedAt" DATETIME` },
];

const IDEMPOTENT_DDL = [
  `CREATE TABLE IF NOT EXISTS "OwnerMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scopeTopicSlug" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'explicit',
    "status" TEXT NOT NULL DEFAULT 'active',
    "replacesMemoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS "ThreadState_closedAt_updatedAt_idx" ON "ThreadState"("closedAt", "updatedAt")`,
  `CREATE INDEX IF NOT EXISTS "OwnerMemory_status_scopeTopicSlug_idx" ON "OwnerMemory"("status", "scopeTopicSlug")`,
  `CREATE INDEX IF NOT EXISTS "OwnerMemory_kind_status_idx" ON "OwnerMemory"("kind", "status")`,
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

  const tables = new Set(
    (await client.execute(`SELECT name FROM sqlite_master WHERE type='table'`)).rows.map((r) => String(r.name))
  );
  const existingCols = tables.has("ThreadState")
    ? new Set((await client.execute(`PRAGMA table_info("ThreadState")`)).rows.map((r) => String(r.name)))
    : new Set<string>();

  const missingCols = THREAD_STATE_COLUMNS.filter((c) => !existingCols.has(c.name));
  const needsOwnerMemory = !tables.has("OwnerMemory");

  for (const c of THREAD_STATE_COLUMNS) {
    console.log(`  ThreadState.${c.name}: ${existingCols.has(c.name) ? "already there" : "will be added"}`);
  }
  console.log(`  OwnerMemory table: ${needsOwnerMemory ? "will be created" : "already there"}`);

  if (!missingCols.length && !needsOwnerMemory) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  const statements = [...missingCols.map((c) => c.sql), ...IDEMPOTENT_DDL];
  await client.batch(statements, "write");
  console.log(`applied ${statements.length} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
