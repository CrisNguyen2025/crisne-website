import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const DDL_STATEMENTS = [
  `ALTER TABLE "ThreadMessage" ADD COLUMN "contextJson" TEXT`,
  `CREATE TABLE IF NOT EXISTS "OwnerConnector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "accountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "scopes" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OwnerConnector_provider_key" ON "OwnerConnector"("provider")`,
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
  if (!tables.has("ThreadMessage")) {
    console.log("ThreadMessage table does not exist yet; run base schema push first.");
    return;
  }

  const msgCols = new Set(
    (await client.execute(`PRAGMA table_info("ThreadMessage")`)).rows.map((r) => String(r.name))
  );
  const needsContextCol = !msgCols.has("contextJson");
  const needsConnectorTable = !tables.has("OwnerConnector");

  console.log(`  ThreadMessage.contextJson: ${needsContextCol ? "will be added" : "already there"}`);
  console.log(`  OwnerConnector table: ${needsConnectorTable ? "will be created" : "already there"}`);

  if (!needsContextCol && !needsConnectorTable) {
    console.log("\nSchema already up to date.");
    return;
  }
  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply after reviewing.");
    return;
  }

  const pending: string[] = [];
  if (needsContextCol) pending.push(DDL_STATEMENTS[0]);
  if (needsConnectorTable) {
    pending.push(DDL_STATEMENTS[1], DDL_STATEMENTS[2]);
  }
  await client.batch(pending, "write");
  console.log(`applied ${pending.length} DDL statement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
