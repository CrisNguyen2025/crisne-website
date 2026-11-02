/**
 * Flatten Topic → Layer → Group → Lesson into Topic → Lesson with a `section` (ADR-0009). Replaces
 * drop-group-level.ts, whose migration (ADR-0008) never ran on Turso.
 *
 *   yarn db:flatten-sections            # dry-run on Turso if configured: prints the plan, writes nothing
 *   yarn db:flatten-sections --local    # dry-run on prisma/dev.db
 *   yarn db:flatten-sections --apply    # write, in one transaction; only after the dry-run was reviewed
 *
 * Stops without writing when two lessons of one topic would share a name. Backs up every table to JSON first.
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { planFlatten, type ItemRow, type GroupRow, type LayerRow, type TriageRow } from "./lib/flatten-sections";

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

async function columns(client: Client, table: string): Promise<string[]> {
  const rows = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
  return rows.map((r) => String(r.name));
}

async function backup(client: Client, file: string): Promise<void> {
  const tables = (await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%'"
  )).rows.map((r) => String(r.name));
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) {
    dump[t] = (await client.execute(`SELECT * FROM "${t}"`)).rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))
    );
  }
  fs.writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }, null, 2));
}

async function main() {
  const { client, target } = connect();
  console.log(`target: ${target}${apply ? "  (APPLY)" : "  (dry-run)"}`);

  const layers = (await client.execute('SELECT id, roadmapId, "order", title FROM RoadmapLayer')).rows as unknown as LayerRow[];
  const groups = (await client.execute('SELECT id, layerId, "order", title FROM RoadmapGroup')).rows as unknown as GroupRow[];
  const items = (await client.execute('SELECT id, groupId, "order", title FROM RoadmapItem')).rows as unknown as ItemRow[];
  const triageHasLayer = (await columns(client, "KnowledgeTriage")).includes("layerId");
  const triage = triageHasLayer
    ? ((await client.execute('SELECT id, layerId, groupTitle FROM KnowledgeTriage')).rows as unknown as TriageRow[])
    : [];

  const plan = planFlatten({
    layers: layers.map((l) => ({ ...l, order: Number(l.order), roadmapId: String(l.roadmapId) })),
    groups: groups.map((g) => ({ ...g, order: Number(g.order) })),
    items: items.map((i) => ({ ...i, order: Number(i.order) })),
    triage,
  });

  console.log(`layers ${layers.length} → sections; groups ${groups.length} → merged; lessons ${items.length}; triage ${triage.length}`);
  const sections = new Set(plan.items.map((i) => `${i.roadmapId}: ${i.section}`));
  for (const s of sections) console.log(`  section  ${s}`);
  if (plan.conflicts.length) {
    console.error("\nSTOP: lesson names clash inside one topic. Rename them, then run again:");
    for (const c of plan.conflicts) console.error(`  - ${c}`);
    process.exit(1);
  }
  if (!apply) {
    console.log("\nDry-run only. Nothing written. Re-run with --apply after reviewing the plan.");
    return;
  }

  const backupFile = path.join(__dirname, `../flatten-backup-${Date.now()}.json`);
  await backup(client, backupFile);
  console.log(`backup: ${backupFile}`);

  // Lesson rows are rebuilt with the new columns; their content is carried over as is
  const itemById = new Map((await client.execute("SELECT * FROM RoadmapItem")).rows.map((r) => [String(r.id), r]));
  const sectionById = new Map(plan.items.map((u) => [u.id, u]));
  const statements: InStatement[] = [
    `CREATE TABLE "RoadmapItem_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "roadmapId" TEXT NOT NULL,
      "section" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "content" TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "RoadmapItem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  ];
  for (const [id, row] of itemById) {
    const u = sectionById.get(id);
    if (!u) throw new Error(`lesson ${id} has no plan`);
    statements.push({
      sql: `INSERT INTO "RoadmapItem_new" ("id","roadmapId","section","title","description","content","order","createdAt","updatedAt")
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        id, u.roadmapId, u.section, String(row.title), (row.description ?? null) as string | null,
        (row.content ?? null) as string | null, u.order, row.createdAt as string, (row.updatedAt ?? row.createdAt) as string,
      ],
    });
  }
  statements.push(
    `DROP TABLE "RoadmapItem"`,
    `ALTER TABLE "RoadmapItem_new" RENAME TO "RoadmapItem"`,
    `CREATE INDEX "RoadmapItem_roadmapId_idx" ON "RoadmapItem"("roadmapId")`,
    `CREATE UNIQUE INDEX "RoadmapItem_roadmapId_title_key" ON "RoadmapItem"("roadmapId", "title")`,
    `DROP TABLE "RoadmapGroup"`,
    `DROP TABLE "RoadmapLayer"`,
  );

  // Roadmap loses shortCode. Dropped as a column, not by rebuilding the table: DROP TABLE "Roadmap" would
  // cascade-delete the lessons that reference it (foreign keys are on), so the table stays.
  statements.push(`ALTER TABLE "Roadmap" DROP COLUMN "shortCode"`);

  // KnowledgeTriage: the three layer/group targets become one section, dropped as columns (no foreign keys)
  if (triageHasLayer) {
    const sectionFor = new Map(plan.triage.map((t) => [t.id, t.section]));
    statements.push(`ALTER TABLE "KnowledgeTriage" ADD COLUMN "section" TEXT`);
    for (const t of triage) {
      statements.push({ sql: `UPDATE "KnowledgeTriage" SET "section" = ? WHERE id = ?`, args: [sectionFor.get(t.id) ?? null, t.id] });
    }
    for (const col of ["layerId", "layerTag", "groupTitle"]) {
      statements.push(`ALTER TABLE "KnowledgeTriage" DROP COLUMN "${col}"`);
    }
  }

  await client.batch(statements, "write");
  const left = (await client.execute("SELECT COUNT(*) AS n FROM RoadmapItem")).rows[0].n;
  console.log(`applied: ${left} lessons in the new shape. Tables RoadmapLayer and RoadmapGroup are gone.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
