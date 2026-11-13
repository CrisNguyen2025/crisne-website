import * as fs from "fs";
import * as path from "path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { INITIAL_ROADMAP_DATA } from "../lib/roadmap/data";
import { planSeedImport, type ExistingLesson } from "./lib/seed-import-plan";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const topicIdx = process.argv.indexOf("--topic");
const topicSlug = topicIdx !== -1 && process.argv[topicIdx + 1] ? process.argv[topicIdx + 1] : "ai-architecture";

function connect(): { client: Client; target: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!local && url && authToken) {
    return { client: createClient({ url, authToken }), target: "turso" };
  }
  const file = path.join(__dirname, "../prisma/dev.db");
  return { client: createClient({ url: `file:${file}` }), target: "prisma/dev.db" };
}

async function notifyReindex(): Promise<void> {
  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) {
    console.log("\nNote: RAG_SERVICE_URL or RAG_INTERNAL_KEY not set. Abot index will refresh automatically in ~30s.");
    return;
  }
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/internal/reindex`, {
      method: "POST",
      headers: { "x-internal-key": internalKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log("\nAbot reindex triggered successfully.");
    } else {
      console.warn(`\nWarning: Abot reindex returned HTTP ${res.status}. Index will refresh automatically in ~30s.`);
    }
  } catch (error) {
    console.warn("\nWarning: Could not contact Abot for reindex. Index will refresh automatically in ~30s.", error);
  }
}

async function main(): Promise<void> {
  const { client, target } = connect();
  try {
    const topicRes = await client.execute({
      sql: 'SELECT id, slug, title FROM "Roadmap" WHERE slug = ?',
      args: [topicSlug],
    });

    if (topicRes.rows.length === 0) {
      console.error(`Error: Topic with slug "${topicSlug}" does not exist.`);
      process.exit(1);
    }

    const topic = topicRes.rows[0];
    const roadmapId = String(topic.id);

    const existingRes = await client.execute({
      sql: 'SELECT id, title, "order" FROM "RoadmapItem" WHERE roadmapId = ?',
      args: [roadmapId],
    });

    const existingLessons: ExistingLesson[] = existingRes.rows.map((r) => ({
      title: String(r.title),
      order: Number(r.order),
    }));

    const plan = planSeedImport({
      existingLessons,
      seedLayers: INITIAL_ROADMAP_DATA,
      roadmapId,
    });

    console.log(`target: ${target}${apply ? "  (APPLY)" : "  (dry-run)"}`);
    console.log(`topic: ${String(topic.slug)} (${String(topic.title)})`);
    console.log(`\nSections to add (${plan.toAdd.length} lessons total):`);
    for (const [section, count] of Object.entries(plan.bySection)) {
      console.log(`  - ${section}: +${count}`);
    }
    console.log(`\nSkipped (already exist): ${plan.skipped.length}`);

    if (plan.toAdd.length === 0) {
      console.log("\nNothing to do.");
      return;
    }

    console.log(`\nFirst 5 lessons to add:`);
    for (const item of plan.toAdd.slice(0, 5)) {
      console.log(`  - [${item.section}] ${item.title} (order: ${item.order}, status: ${item.status})`);
    }

    if (!apply) {
      console.log(`\nDry-run only. Re-run with --apply after reviewing.`);
      return;
    }

    const backupRows = (
      await client.execute({
        sql: 'SELECT * FROM "RoadmapItem" WHERE roadmapId = ?',
        args: [roadmapId],
      })
    ).rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]))
    );

    const timestamp = Date.now();
    const backupFile = path.join(__dirname, `../seed-import-backup-${timestamp}.json`);
    fs.writeFileSync(
      backupFile,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          topicSlug: String(topic.slug),
          roadmapId,
          RoadmapItem: backupRows,
        },
        null,
        2
      )
    );
    console.log(`\nbackup: ${backupFile}`);

    const statements: InStatement[] = plan.toAdd.map((item) => {
      if (!Number.isInteger(item.createdAt) || !Number.isInteger(item.updatedAt)) {
        throw new Error(
          `Lesson dates must be integer epoch milliseconds. Got createdAt=${item.createdAt}, updatedAt=${item.updatedAt}`
        );
      }
      return {
        sql: `INSERT INTO "RoadmapItem" (
        "id", "roadmapId", "section", "title", "description", "content", "order", "status", "statusUpdatedAt", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.id,
          roadmapId,
          item.section,
          item.title,
          item.description,
          item.content,
          item.order,
          item.status,
          null,
          item.createdAt,
          item.updatedAt,
        ],
      };
    });

    await client.batch(statements, "write");
    console.log(`\nApplied: ${plan.toAdd.length} lessons added to ${String(topic.slug)}.`);

    await notifyReindex();
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
