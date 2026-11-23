/**
 * Migrate Turso / local SQLite for the public News flag (NewsItem.isPublic, publicAt):
 *
 *   yarn db:news-public            # dry-run on Turso if configured
 *   yarn db:news-public --local    # dry-run on prisma/dev.db
 *   yarn db:news-public --apply    # apply changes after reviewing dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const NEWS_ITEM_COLUMNS: { name: string; sql: string }[] = [
  {
    name: "isPublic",
    sql: `ALTER TABLE "NewsItem" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false`,
  },
  { name: "publicAt", sql: `ALTER TABLE "NewsItem" ADD COLUMN "publicAt" DATETIME` },
];
const PUBLIC_INDEX_SQL = `CREATE INDEX IF NOT EXISTS "NewsItem_isPublic_publicAt_idx" ON "NewsItem"("isPublic", "publicAt")`;

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
  if (!tables.has("NewsItem")) {
    console.log("NewsItem table does not exist yet; run `yarn db:turso:init` first.");
    return;
  }

  const existingCols = new Set(
    (await client.execute(`PRAGMA table_info("NewsItem")`)).rows.map((r) => String(r.name))
  );
  const missingCols = NEWS_ITEM_COLUMNS.filter((c) => !existingCols.has(c.name));

  for (const col of NEWS_ITEM_COLUMNS) {
    console.log(`  NewsItem.${col.name}: ${existingCols.has(col.name) ? "already there" : "will be added"}`);
  }

  if (!missingCols.length) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  // The index statement is idempotent, so it runs together with the missing columns
  await client.batch([...missingCols.map((c) => c.sql), PUBLIC_INDEX_SQL], "write");
  console.log(`applied ${missingCols.length + 1} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
