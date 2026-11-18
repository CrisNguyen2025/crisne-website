/**
 * Migrate RoadmapItem.slug to global uniqueness and create SlugRedirect table.
 *
 *   npx ts-node scripts/migrate-global-lesson-slugs.ts            # dry-run on Turso (or dev.db)
 *   npx ts-node scripts/migrate-global-lesson-slugs.ts --local    # dry-run on prisma/dev.db
 *   npx ts-node scripts/migrate-global-lesson-slugs.ts --apply    # write; only after dry-run review
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { allocateGlobalLessonSlug } from "../lib/utils";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

function connect(): { client: Client; target: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!local && url && authToken) {
    return { client: createClient({ url, authToken }), target: "turso" };
  }
  const file = path.join(__dirname, "../prisma/dev.db");
  return { client: createClient({ url: `file:${file}` }), target: "prisma/dev.db" };
}

interface JoinedLessonRow {
  id: string;
  roadmapId: string;
  topicSlug: string;
  title: string;
  slug: string | null;
}

async function main() {
  const { client, target } = connect();
  console.log(`target: ${target}${apply ? "  (APPLY)" : "  (dry-run)"}`);

  try {
    const rows = (
      await client.execute(
        `SELECT i.id, i.roadmapId, r.slug AS topicSlug, i.title, i.slug
         FROM "RoadmapItem" i
         JOIN "Roadmap" r ON r.id = i.roadmapId
         ORDER BY r."order" ASC, i."order" ASC, i.createdAt ASC`
      )
    ).rows as unknown as JoinedLessonRow[];

    const usedSlugs = new Set<string>();
    const usedByTopic = new Map<string, Set<string>>();
    const updates: { id: string; oldSlug: string; newSlug: string; title: string; topicSlug: string }[] = [];
    const redirects: { fromSlug: string; targetId: string }[] = [];

    for (const row of rows) {
      let topicUsed = usedByTopic.get(row.roadmapId);
      if (!topicUsed) {
        topicUsed = new Set<string>();
        usedByTopic.set(row.roadmapId, topicUsed);
      }
      const current = (row.slug ?? "").trim();
      if (current && !usedSlugs.has(current)) {
        usedSlugs.add(current);
        topicUsed.add(current);
        continue;
      }
      const nextSlug = allocateGlobalLessonSlug(row.title, usedSlugs, row.topicSlug, topicUsed);
      updates.push({
        id: row.id,
        oldSlug: current,
        newSlug: nextSlug,
        title: row.title,
        topicSlug: row.topicSlug,
      });
      if (current && current !== nextSlug && !redirects.some((r) => r.fromSlug === current)) {
        redirects.push({ fromSlug: current, targetId: row.id });
      }
    }

    console.log(`Total lessons: ${rows.length}`);
    console.log(`Lessons needing global slug update: ${updates.length}`);
    console.log(`SlugRedirect entries to record: ${redirects.length}`);

    if (updates.length > 0) {
      for (const u of updates.slice(0, 15)) {
        console.log(`  [${u.topicSlug}] "${u.title}": "${u.oldSlug || "(empty)"}" -> "${u.newSlug}"`);
      }
      if (updates.length > 15) {
        console.log(`  ... and ${updates.length - 15} more`);
      }
    }

    if (!apply) {
      console.log("\nDry-run only. Re-run with --apply to write changes.");
      return;
    }

    const fullRows = (await client.execute('SELECT * FROM "RoadmapItem"')).rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))
    );
    const backupDir = fs.existsSync(path.join(__dirname, "../.handoff/runs"))
      ? path.join(__dirname, "../.handoff/runs")
      : "/tmp";
    const backupFile = path.join(backupDir, `roadmap-item-global-slug-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), RoadmapItem: fullRows }, null, 2));
    console.log(`Backup saved to: ${backupFile}`);

    const statements: InStatement[] = [
      {
        sql: `CREATE TABLE IF NOT EXISTS "SlugRedirect" (
          "fromSlug" TEXT NOT NULL PRIMARY KEY,
          "entity" TEXT NOT NULL,
          "targetId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        args: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS "SlugRedirect_entity_targetId_idx" ON "SlugRedirect"("entity", "targetId")',
        args: [],
      },
      {
        sql: 'DROP INDEX IF EXISTS "RoadmapItem_roadmapId_slug_key"',
        args: [],
      },
    ];

    for (const u of updates) {
      statements.push({
        sql: 'UPDATE "RoadmapItem" SET "slug" = ? WHERE id = ?',
        args: [u.newSlug, u.id],
      });
    }

    for (const r of redirects) {
      statements.push({
        sql: `INSERT OR IGNORE INTO "SlugRedirect" ("fromSlug", "entity", "targetId") VALUES (?, 'lesson', ?)`,
        args: [r.fromSlug, r.targetId],
      });
    }

    statements.push({
      sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "RoadmapItem_slug_key" ON "RoadmapItem"("slug")',
      args: [],
    });

    await client.batch(statements, "write");
    console.log("Successfully migrated RoadmapItem slugs to global uniqueness and created SlugRedirect.");
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
