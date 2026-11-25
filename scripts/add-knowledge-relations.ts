import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const RELATION_SQL = [
  `CREATE TABLE IF NOT EXISTS "KnowledgeRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromLessonId" TEXT NOT NULL,
    "toLessonId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'relates',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeRelation_fromLessonId_fkey" FOREIGN KEY ("fromLessonId") REFERENCES "RoadmapItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeRelation_toLessonId_fkey" FOREIGN KEY ("toLessonId") REFERENCES "RoadmapItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeRelation_fromLessonId_toLessonId_relationType_key" ON "KnowledgeRelation"("fromLessonId", "toLessonId", "relationType")`,
  `CREATE INDEX IF NOT EXISTS "KnowledgeRelation_fromLessonId_idx" ON "KnowledgeRelation"("fromLessonId")`,
  `CREATE INDEX IF NOT EXISTS "KnowledgeRelation_toLessonId_idx" ON "KnowledgeRelation"("toLessonId")`,
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
  if (!tables.has("RoadmapItem")) {
    console.log("RoadmapItem table does not exist yet; run `yarn db:turso:init` first.");
    return;
  }

  const needsTable = !tables.has("KnowledgeRelation");
  console.log(`  KnowledgeRelation: ${needsTable ? "will be created" : "already there (indexes re-checked)"}`);

  if (!needsTable) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  await client.batch(RELATION_SQL, "write");
  console.log(`applied ${RELATION_SQL.length} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
