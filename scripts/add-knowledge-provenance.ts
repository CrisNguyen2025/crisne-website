/**
 * Migrate Turso / local SQLite for Provenance (ADR-0017): table KnowledgeProvenance and NewsItem.extractedAt.
 *
 *   yarn db:knowledge-provenance            # dry-run on Turso if configured
 *   yarn db:knowledge-provenance --local    # dry-run on prisma/dev.db
 *   yarn db:knowledge-provenance --apply    # apply changes after reviewing dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const NEWS_ITEM_EXTRACTED_AT_SQL = `ALTER TABLE "NewsItem" ADD COLUMN "extractedAt" DATETIME`;

// Same DDL as prisma/init-turso.sql; every statement is idempotent
const PROVENANCE_SQL = [
  `CREATE TABLE IF NOT EXISTS "KnowledgeProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "claimRefKey" TEXT NOT NULL,
    "newsItemId" TEXT,
    "sourceId" TEXT,
    "relationType" TEXT NOT NULL DEFAULT 'derived_from',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL,
    "extractedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeProvenance_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "RoadmapItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeProvenance_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeProvenance_claimRefKey_key" ON "KnowledgeProvenance"("claimRefKey")`,
  `CREATE INDEX IF NOT EXISTS "KnowledgeProvenance_lessonId_idx" ON "KnowledgeProvenance"("lessonId")`,
  `CREATE INDEX IF NOT EXISTS "KnowledgeProvenance_newsItemId_idx" ON "KnowledgeProvenance"("newsItemId")`,
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
  if (!tables.has("NewsItem") || !tables.has("RoadmapItem")) {
    console.log("NewsItem or RoadmapItem table does not exist yet; run `yarn db:turso:init` first.");
    return;
  }

  const newsItemCols = new Set(
    (await client.execute(`PRAGMA table_info("NewsItem")`)).rows.map((r) => String(r.name))
  );
  const needsExtractedAt = !newsItemCols.has("extractedAt");
  const needsTable = !tables.has("KnowledgeProvenance");

  console.log(`  NewsItem.extractedAt: ${needsExtractedAt ? "will be added" : "already there"}`);
  console.log(`  KnowledgeProvenance: ${needsTable ? "will be created" : "already there (indexes re-checked)"}`);

  if (!needsExtractedAt && !needsTable) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  const statements = [...(needsExtractedAt ? [NEWS_ITEM_EXTRACTED_AT_SQL] : []), ...PROVENANCE_SQL];
  await client.batch(statements, "write");
  console.log(`applied ${statements.length} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
