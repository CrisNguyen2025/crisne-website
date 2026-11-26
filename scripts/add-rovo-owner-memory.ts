import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const OWNER_MEMORY_COLUMNS: { name: string; sql: string }[] = [
  { name: "useCount", sql: `ALTER TABLE "OwnerMemory" ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "confidence", sql: `ALTER TABLE "OwnerMemory" ADD COLUMN "confidence" REAL` },
  { name: "validTo", sql: `ALTER TABLE "OwnerMemory" ADD COLUMN "validTo" DATETIME` },
  { name: "evidenceSnippet", sql: `ALTER TABLE "OwnerMemory" ADD COLUMN "evidenceSnippet" TEXT` },
  { name: "sourceThreadId", sql: `ALTER TABLE "OwnerMemory" ADD COLUMN "sourceThreadId" TEXT` },
];

const IDEMPOTENT_DDL = [
  `CREATE TABLE IF NOT EXISTS "OwnerPreference" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoObserveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSynthesizedAt" DATETIME,
    "lastSynthesisHash" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "OwnerActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "topicSlug" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "OwnerMemory_source_status_idx" ON "OwnerMemory"("source", "status")`,
  `CREATE INDEX IF NOT EXISTS "OwnerActivityEvent_createdAt_idx" ON "OwnerActivityEvent"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "OwnerActivityEvent_eventType_createdAt_idx" ON "OwnerActivityEvent"("eventType", "createdAt")`,
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
  if (!tables.has("OwnerMemory")) {
    console.log("OwnerMemory table does not exist yet; run `yarn db:owner-memory --apply` first.");
    return;
  }

  const existingCols = new Set(
    (await client.execute(`PRAGMA table_info("OwnerMemory")`)).rows.map((r) => String(r.name))
  );
  const missingCols = OWNER_MEMORY_COLUMNS.filter((c) => !existingCols.has(c.name));
  const needsPreference = !tables.has("OwnerPreference");
  const needsEvents = !tables.has("OwnerActivityEvent");

  for (const c of OWNER_MEMORY_COLUMNS) {
    console.log(`  OwnerMemory.${c.name}: ${existingCols.has(c.name) ? "already there" : "will be added"}`);
  }
  console.log(`  OwnerPreference table: ${needsPreference ? "will be created" : "already there"}`);
  console.log(`  OwnerActivityEvent table: ${needsEvents ? "will be created" : "already there"}`);

  if (!missingCols.length && !needsPreference && !needsEvents) {
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
