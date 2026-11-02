import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

/**
 * Drop Level from the roadmap (ADR-0008). Dry-run by default: prints what it would change and writes nothing.
 *
 *   yarn db:drop-group-level            # dry-run, Turso if configured
 *   yarn db:drop-group-level --local    # dry-run on prisma/dev.db
 *   yarn db:drop-group-level --apply    # write
 *
 * Per layer: group titles lose their leading emoji ("🟢 Core" -> "Core"), groups whose titles are equal after
 * that are merged into one (items moved, appended in order), then RoadmapGroup.level is dropped and
 * (layerId, title) becomes unique. KnowledgeTriage.level is copied into groupTitle, then dropped.
 */

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

/** Same comparison as lib/roadmap/duplicates.ts normalizeTitle. */
function normalizeTitle(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function stripLeadingEmoji(title: string): string {
  return title.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "").trim();
}

/** "core" -> "Core", "nâng cao" -> "Nâng Cao": the title a level-only group falls back to. */
function titleFromLevel(level: string): string {
  return level.trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

async function hasColumn(client: Client, table: string, column: string): Promise<boolean> {
  const rows = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
  return rows.some((r) => r.name === column);
}

interface GroupRow {
  id: string;
  layerId: string;
  level: string;
  title: string;
  items: number;
}

async function main() {
  const { client, target } = connect();
  const groupHasLevel = await hasColumn(client, "RoadmapGroup", "level");
  const triageHasLevel = await hasColumn(client, "KnowledgeTriage", "level");
  const triageHasGroupTitle = await hasColumn(client, "KnowledgeTriage", "groupTitle");

  const rows = (
    await client.execute(
      `SELECT g.id, g.layerId, ${groupHasLevel ? "g.level" : "'' AS level"}, g.title,
              (SELECT COUNT(*) FROM RoadmapItem i WHERE i.groupId = g.id) AS items
       FROM RoadmapGroup g ORDER BY g.layerId, g."order", g.createdAt`,
    )
  ).rows.map((r) => ({ ...r, level: String(r.level ?? ""), items: Number(r.items) }) as unknown as GroupRow);

  const byLayer = new Map<string, GroupRow[]>();
  for (const g of rows) byLayer.set(g.layerId, [...(byLayer.get(g.layerId) ?? []), g]);

  const statements: { sql: string; args: (string | number)[] }[] = [];
  const log: string[] = [];

  for (const [layerId, groups] of byLayer) {
    const byTitle = new Map<string, { title: string; groups: GroupRow[] }>();
    for (const g of groups) {
      const title = stripLeadingEmoji(g.title) || titleFromLevel(g.level) || "Untitled";
      const key = normalizeTitle(title);
      const entry = byTitle.get(key) ?? { title, groups: [] };
      entry.groups.push(g);
      byTitle.set(key, entry);
    }

    for (const { title, groups: same } of byTitle.values()) {
      // Keep the group holding the most items; the others' items move into it
      const [keep, ...rest] = [...same].sort((a, b) => b.items - a.items);
      let appended = keep.items;
      for (const g of rest) {
        if (g.items > 0) {
          log.push(`move ${g.items} item(s) from group ${g.id} (${g.title}) into ${keep.id} (${title}) in layer ${layerId}`);
          statements.push({
            sql: `UPDATE RoadmapItem SET groupId = ?, "order" = "order" + ? WHERE groupId = ?`,
            args: [keep.id, appended, g.id],
          });
          appended += g.items;
        }
        log.push(`delete merged group ${g.id} (${g.title}) in layer ${layerId}`);
        statements.push({ sql: "DELETE FROM RoadmapGroup WHERE id = ?", args: [g.id] });
      }
      if (keep.title !== title) {
        log.push(`rename group ${keep.id}: ${JSON.stringify(keep.title)} -> ${JSON.stringify(title)}`);
        statements.push({ sql: "UPDATE RoadmapGroup SET title = ? WHERE id = ?", args: [title, keep.id] });
      }
    }
  }

  if (groupHasLevel) {
    log.push("drop column RoadmapGroup.level");
    statements.push({ sql: `ALTER TABLE "RoadmapGroup" DROP COLUMN "level"`, args: [] });
  }
  log.push("ensure unique index RoadmapGroup(layerId, title)");
  statements.push({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "RoadmapGroup_layerId_title_key" ON "RoadmapGroup"("layerId", "title")`,
    args: [],
  });

  if (!triageHasGroupTitle) {
    log.push("add column KnowledgeTriage.groupTitle");
    statements.push({ sql: `ALTER TABLE "KnowledgeTriage" ADD COLUMN "groupTitle" TEXT`, args: [] });
  }
  if (triageHasLevel) {
    const triage = (await client.execute(`SELECT id, level FROM KnowledgeTriage WHERE level IS NOT NULL AND level != ''`)).rows;
    for (const t of triage) {
      const groupTitle = titleFromLevel(String(t.level));
      log.push(`triage ${t.id}: level ${JSON.stringify(t.level)} -> groupTitle ${JSON.stringify(groupTitle)}`);
      statements.push({
        sql: `UPDATE KnowledgeTriage SET groupTitle = ? WHERE id = ? AND groupTitle IS NULL`,
        args: [groupTitle, String(t.id)],
      });
    }
    log.push("drop column KnowledgeTriage.level");
    statements.push({ sql: `ALTER TABLE "KnowledgeTriage" DROP COLUMN "level"`, args: [] });
  }

  console.log(`Target: ${target} | groups: ${rows.length} | layers with groups: ${byLayer.size}`);
  for (const line of log) console.log(`  - ${line}`);
  if (!apply) {
    console.log(`\nDry-run: ${statements.length} statement(s) not executed. Re-run with --apply to write.`);
    return;
  }
  await client.batch(statements, "write");
  console.log(`\nApplied ${statements.length} statement(s) in one transaction.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
