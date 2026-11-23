/**
 * One-off: make News posts created before "public by default" public too, so /picks shows them.
 * Skips dismissed posts. publicAt takes the post's createdAt so /picks keeps the original order.
 *
 *   yarn db:news-publish-existing            # dry-run on Turso if configured
 *   yarn db:news-publish-existing --local    # dry-run on prisma/dev.db
 *   yarn db:news-publish-existing --apply    # apply after reviewing the dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const PENDING_WHERE = `"isPublic" = 0 AND "reviewStatus" != 'dismissed'`;

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

  const columns = new Set(
    (await client.execute(`PRAGMA table_info("NewsItem")`)).rows.map((r) => String(r.name))
  );
  if (!columns.has("isPublic") || !columns.has("publicAt")) {
    console.log("NewsItem.isPublic/publicAt missing; run `yarn db:news-public --apply` first.");
    return;
  }

  const pending = await client.execute(
    `SELECT "id", "title", "ingestStatus" FROM "NewsItem" WHERE ${PENDING_WHERE} ORDER BY "createdAt" DESC`
  );
  for (const row of pending.rows) {
    console.log(`  will publish [${String(row.ingestStatus)}] ${String(row.title).slice(0, 80)}`);
  }
  console.log(`\n${pending.rows.length} post(s) to publish (only "ready" ones appear on /picks).`);

  if (!pending.rows.length) return;
  if (!apply) {
    console.log("Dry-run only. Re-run with --apply after reviewing.");
    return;
  }

  const result = await client.execute(
    `UPDATE "NewsItem" SET "isPublic" = 1, "publicAt" = "createdAt" WHERE ${PENDING_WHERE}`
  );
  console.log(`published ${result.rowsAffected} post(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
