import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const INDEX_NAME = "NewsItem_sourceId_idx";
const INDEX_SQL = `CREATE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "NewsItem"("sourceId")`;

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

  const indexes = new Set(
    (await client.execute(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='NewsItem'`)).rows.map((r) =>
      String(r.name)
    )
  );
  const exists = indexes.has(INDEX_NAME);
  console.log(`  ${INDEX_NAME}: ${exists ? "already there" : "will be created"}`);

  if (exists) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  await client.execute(INDEX_SQL);
  console.log("applied 1 DDL statement(s).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
