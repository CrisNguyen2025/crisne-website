import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";
import { defaultGroupTitle, normalizeLevel } from "../lib/roadmap/levels";

/**
 * Tidy roadmap groups. Dry-run by default: prints what it would change and writes nothing.
 *
 *   yarn ts-node --compiler-options '{"module":"CommonJS"}' scripts/cleanup-roadmap-groups.ts           # dry-run, Turso if configured
 *   ... scripts/cleanup-roadmap-groups.ts --local                                                       # dry-run on prisma/dev.db
 *   ... scripts/cleanup-roadmap-groups.ts --apply                                                       # write
 *
 * Per layer: groups whose levels are equal after normalizeLevel ("Core" / "core") are merged into one
 * (items moved, appended in order), that group's level is stored normalized, and empty groups are deleted.
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

interface GroupRow {
  id: string;
  layerId: string;
  level: string;
  title: string;
  items: number;
}

async function main() {
  const { client, target } = connect();
  const rows = (
    await client.execute(
      `SELECT g.id, g.layerId, g.level, g.title,
              (SELECT COUNT(*) FROM RoadmapItem i WHERE i.groupId = g.id) AS items
       FROM RoadmapGroup g ORDER BY g.layerId, g."order", g.createdAt`,
    )
  ).rows.map((r) => ({ ...r, items: Number(r.items) }) as unknown as GroupRow);

  const byLayer = new Map<string, GroupRow[]>();
  for (const g of rows) byLayer.set(g.layerId, [...(byLayer.get(g.layerId) ?? []), g]);

  const statements: { sql: string; args: (string | number)[] }[] = [];
  const log: string[] = [];

  for (const [layerId, groups] of byLayer) {
    const byLevel = new Map<string, GroupRow[]>();
    for (const g of groups) byLevel.set(normalizeLevel(g.level), [...(byLevel.get(normalizeLevel(g.level)) ?? []), g]);

    for (const [level, same] of byLevel) {
      // Keep the group holding the most items; the others' items move into it
      const [keep, ...rest] = [...same].sort((a, b) => b.items - a.items);
      const moved = rest.reduce((n, g) => n + g.items, 0);
      if (keep.items + moved === 0) {
        for (const g of same) {
          log.push(`delete empty group ${g.id} (${g.title}, level ${g.level}) in layer ${layerId}`);
          statements.push({ sql: "DELETE FROM RoadmapGroup WHERE id = ?", args: [g.id] });
        }
        continue;
      }
      for (const g of rest) {
        if (g.items > 0) {
          log.push(`move ${g.items} item(s) from group ${g.id} (${g.level}) into ${keep.id} (${keep.level}) in layer ${layerId}`);
          statements.push({
            sql: `UPDATE RoadmapItem SET groupId = ?, "order" = "order" + ? WHERE groupId = ?`,
            args: [keep.id, keep.items, g.id],
          });
        }
        log.push(`delete merged group ${g.id} (${g.title}, level ${g.level}) in layer ${layerId}`);
        statements.push({ sql: "DELETE FROM RoadmapGroup WHERE id = ?", args: [g.id] });
      }
      if (keep.level !== level) {
        log.push(`normalize level of group ${keep.id}: ${JSON.stringify(keep.level)} -> ${JSON.stringify(level)}`);
        statements.push({ sql: "UPDATE RoadmapGroup SET level = ? WHERE id = ?", args: [level, keep.id] });
        if (keep.title.trim() === "") {
          statements.push({ sql: "UPDATE RoadmapGroup SET title = ? WHERE id = ?", args: [defaultGroupTitle(level), keep.id] });
        }
      }
    }
  }

  console.log(`Target: ${target} | groups: ${rows.length} | layers with groups: ${byLayer.size}`);
  if (!log.length) {
    console.log("Nothing to change.");
    return;
  }
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
