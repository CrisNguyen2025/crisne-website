/**
 * Backfill `slug` field on RoadmapItem: idempotent migration (D1, D2, D3).
 *
 *   npx ts-node scripts/migrate-roadmap-item-slugs.ts            # dry-run: prints what would change, writes nothing
 *   npx ts-node scripts/migrate-roadmap-item-slugs.ts --local    # dry-run on prisma/dev.db
 *   npx ts-node scripts/migrate-roadmap-item-slugs.ts --apply    # write; only after dry-run review
 *
 * Generates slug = slugify(title) for each item without a slug.
 * Collisions in the same roadmapId are appended with -2, -3, etc. (D3).
 * Existing slugs are kept (D2).
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { slugify } from "../lib/utils";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

function connect(): { client: Client; target: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!local && url && authToken) return { client: createClient({ url, authToken }), target: "turso" };
  const file = path.join(__dirname, "../prisma/dev.db");
  return { client: createClient({ url: `file:${file}` }), target: "prisma/dev.db" };
}

interface ItemRow {
  id: string;
  roadmapId: string;
  title: string;
  slug?: string | null;
}

interface SlugUpdate {
  id: string;
  title: string;
  newSlug: string;
  roadmapId: string;
}

function collectSlugUpdatesForRoadmap(roadmapId: string, items: ItemRow[]): SlugUpdate[] {
  const usedSlugs = new Set<string>();
  for (const it of items) {
    const trimmed = it.slug?.trim();
    if (trimmed) usedSlugs.add(trimmed);
  }

  const updates: SlugUpdate[] = [];
  for (const it of items) {
    if (it.slug?.trim()) continue;
    const base = slugify(it.title) || "lesson";
    let candidate = base;
    let counter = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter++;
    }
    usedSlugs.add(candidate);
    updates.push({ id: it.id, title: it.title, newSlug: candidate, roadmapId });
  }
  return updates;
}

function planMissingItemSlugs(rows: ItemRow[]): SlugUpdate[] {
  const byRoadmap = new Map<string, ItemRow[]>();
  for (const item of rows) {
    const list = byRoadmap.get(item.roadmapId) || [];
    list.push(item);
    byRoadmap.set(item.roadmapId, list);
  }

  const updates: SlugUpdate[] = [];
  for (const [roadmapId, items] of byRoadmap.entries()) {
    updates.push(...collectSlugUpdatesForRoadmap(roadmapId, items));
  }
  return updates;
}

function logSampleUpdates(updates: SlugUpdate[]): void {
  console.log(`Lessons needing slug update: ${updates.length}`);
  if (updates.length === 0) return;

  console.log("\nSample updates:");
  for (const u of updates.slice(0, 10)) {
    console.log(`  [${u.id}] "${u.title}" -> "${u.newSlug}" (topic: ${u.roadmapId})`);
  }
  if (updates.length > 10) {
    console.log(`  ... and ${updates.length - 10} more`);
  }
}

async function applySlugMigration(client: Client, updates: SlugUpdate[]): Promise<void> {
  // Backup table first
  const fullRows = (await client.execute('SELECT * FROM "RoadmapItem"')).rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))
  );
  const backupDir = fs.existsSync(path.join(__dirname, "../.handoff/runs"))
    ? path.join(__dirname, "../.handoff/runs")
    : "/tmp";
  const backupFile = path.join(backupDir, `roadmap-item-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), RoadmapItem: fullRows }, null, 2));
  console.log(`Backup saved to: ${backupFile}`);

  // Apply updates in batch
  const statements: InStatement[] = updates.map((u) => ({
    sql: 'UPDATE "RoadmapItem" SET "slug" = ? WHERE id = ?',
    args: [u.newSlug, u.id],
  }));
  statements.push({
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "RoadmapItem_roadmapId_slug_key" ON "RoadmapItem"("roadmapId", "slug")',
    args: [],
  });

  await client.batch(statements, "write");
  console.log(`Successfully updated ${updates.length} lessons with slugs and created unique index.`);
}

async function main() {
  const { client, target } = connect();
  console.log(`target: ${target}${apply ? "  (APPLY)" : "  (dry-run)"}`);

  const existingColumns = new Set(
    (await client.execute('PRAGMA table_info("RoadmapItem")')).rows.map((r) => String(r.name))
  );

  const hasSlugColumn = existingColumns.has("slug");
  console.log(`Column "slug": ${hasSlugColumn ? "already exists" : "needs to be added"}`);

  if (!hasSlugColumn && apply) {
    await client.execute('ALTER TABLE "RoadmapItem" ADD COLUMN "slug" TEXT');
    console.log('Added column "slug" to RoadmapItem');
  }

  const query = hasSlugColumn
    ? 'SELECT id, roadmapId, title, slug FROM "RoadmapItem" ORDER BY "order" ASC, createdAt ASC'
    : 'SELECT id, roadmapId, title, NULL as slug FROM "RoadmapItem" ORDER BY "order" ASC, createdAt ASC';

  const rows = (await client.execute(query)).rows as unknown as ItemRow[];
  console.log(`Total lessons: ${rows.length}`);

  const updates = planMissingItemSlugs(rows);
  logSampleUpdates(updates);

  if (updates.length === 0 && hasSlugColumn) {
    console.log("\nAll items have slugs. Ensuring unique index exists...");
    if (apply) {
      await client.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "RoadmapItem_roadmapId_slug_key" ON "RoadmapItem"("roadmapId", "slug")'
      );
      console.log("Unique index verified.");
    }
    return;
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
    return;
  }

  await applySlugMigration(client, updates);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
