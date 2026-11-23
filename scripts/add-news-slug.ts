/**
 * Migrate Turso / local SQLite for NewsItem.slug and backfill unique readable slugs:
 *
 *   yarn db:news-slug            # dry-run on Turso if configured
 *   yarn db:news-slug --local    # dry-run on prisma/dev.db
 *   yarn db:news-slug --apply    # apply schema + backfill slugs after reviewing dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";
import { buildBaseNewsSlug, isEligibleNewsTitleForSlug, pickUniqueNewsSlug } from "../lib/news/slug";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const ADD_SLUG_COLUMN_SQL = `ALTER TABLE "NewsItem" ADD COLUMN "slug" TEXT`;
const ADD_SLUG_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS "NewsItem_slug_key" ON "NewsItem"("slug")`;

interface SlugCandidateRow {
  id: string;
  title: string;
  domain: string;
  slug: string | null;
  ingestStatus: string;
}

function collectPendingSlugUpdates(
  rows: SlugCandidateRow[],
  used: Set<string>
): { id: string; slug: string }[] {
  const updates: { id: string; slug: string }[] = [];
  for (const row of rows) {
    if (row.slug?.trim()) continue;
    if (row.ingestStatus !== "ready" && row.ingestStatus !== "partial") continue;
    if (!isEligibleNewsTitleForSlug(row.title)) continue;
    const nextSlug = pickUniqueNewsSlug(buildBaseNewsSlug(row.title, row.domain), used);
    updates.push({ id: row.id, slug: nextSlug });
    console.log(`  [slug] ${row.id} -> ${nextSlug}`);
  }
  return updates;
}

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
  const needsColumn = !existingCols.has("slug");
  console.log(`  NewsItem.slug: ${needsColumn ? "will be added" : "already there"}`);

  if (needsColumn && !apply) {
    const previewRes = await client.execute(
      `SELECT "id", "title", "domain", "ingestStatus" FROM "NewsItem" ORDER BY "createdAt" ASC, "id" ASC`
    );
    const previewRows: SlugCandidateRow[] = previewRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      domain: String(r.domain),
      slug: null,
      ingestStatus: String(r.ingestStatus),
    }));
    const pending = collectPendingSlugUpdates(previewRows, new Set<string>());
    console.log(`\n${pending.length} post(s) will receive slugs. Re-run with --apply after reviewing.`);
    return;
  }

  if (needsColumn && apply) {
    await client.batch([ADD_SLUG_COLUMN_SQL, ADD_SLUG_INDEX_SQL], "write");
    console.log("applied slug column and unique index.");
  }

  const res = await client.execute(
    `SELECT "id", "title", "domain", "slug", "ingestStatus" FROM "NewsItem" ORDER BY "createdAt" ASC, "id" ASC`
  );
  const rows: SlugCandidateRow[] = res.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    domain: String(r.domain),
    slug: typeof r.slug === "string" && r.slug.trim() ? r.slug.trim() : null,
    ingestStatus: String(r.ingestStatus),
  }));
  const used = new Set(rows.map((r) => r.slug).filter((s): s is string => s !== null));
  const updates = collectPendingSlugUpdates(rows, used);

  if (updates.length === 0) {
    console.log("\nAll eligible NewsItem rows already have slugs.");
    return;
  }

  if (!apply) {
    console.log(`\n${updates.length} post(s) missing slugs. Re-run with --apply after reviewing.`);
    return;
  }

  await client.batch(
    updates.map((u) => ({
      sql: `UPDATE "NewsItem" SET "slug" = ? WHERE "id" = ?`,
      args: [u.slug, u.id],
    })),
    "write"
  );
  console.log(`backfilled ${updates.length} slug(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
