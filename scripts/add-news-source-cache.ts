/**
 * Migrate Turso / local SQLite for NewsSource HTTP caching headers (etag, lastModified):
 *
 *   yarn db:news-source-cache            # dry-run on Turso if configured
 *   yarn db:news-source-cache --local    # dry-run on prisma/dev.db
 *   yarn db:news-source-cache --apply    # apply changes after reviewing dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const NEWS_SOURCE_COLUMNS: { name: string; sql: string }[] = [
  { name: "etag", sql: `ALTER TABLE "NewsSource" ADD COLUMN "etag" TEXT` },
  { name: "lastModified", sql: `ALTER TABLE "NewsSource" ADD COLUMN "lastModified" TEXT` },
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
  if (!tables.has("NewsSource")) {
    console.log("NewsSource table does not exist yet; run `yarn db:turso:init` first.");
    return;
  }

  const existingCols = new Set(
    (await client.execute(`PRAGMA table_info("NewsSource")`)).rows.map((r) => String(r.name))
  );
  const missingCols = NEWS_SOURCE_COLUMNS.filter((c) => !existingCols.has(c.name));

  for (const col of NEWS_SOURCE_COLUMNS) {
    console.log(`  NewsSource.${col.name}: ${existingCols.has(col.name) ? "already there" : "will be added"}`);
  }

  if (!missingCols.length) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  await client.batch(
    missingCols.map((c) => c.sql),
    "write"
  );
  console.log(`applied ${missingCols.length} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
