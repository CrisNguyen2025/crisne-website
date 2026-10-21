import * as fs from "fs";
import * as path from "path";
import { createClient, type Client } from "@libsql/client";

/**
 * One triage item per trace. Dry-run by default: prints what it would change and writes nothing.
 *
 *   yarn ts-node --compiler-options '{"module":"CommonJS"}' scripts/dedupe-knowledge-triage.ts           # dry-run, Turso if configured
 *   ... scripts/dedupe-knowledge-triage.ts --local                                                       # dry-run on prisma/dev.db
 *   ... scripts/dedupe-knowledge-triage.ts --apply                                                       # write
 *
 * The old feedback route created an item on every 👎 submit, so a trace could get several. Per trace the
 * item furthest along is kept (APPROVED > DRAFTED > PENDING, then the newest); the other PENDING items are
 * set to DISMISSED (never deleted, so a wrong pick can be undone). DRAFTED / APPROVED items are never changed.
 */

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const local = process.argv.includes("--local");

const STATUS_RANK: Record<string, number> = { APPROVED: 3, DRAFTED: 2, PENDING: 1 };

function connect(): { client: Client; target: string } {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!local && url && authToken) return { client: createClient({ url, authToken }), target: "turso" };
  const file = path.join(__dirname, "../prisma/dev.db");
  return { client: createClient({ url: `file:${file}` }), target: "prisma/dev.db" };
}

interface TriageRow {
  id: string;
  traceId: string;
  status: string;
  createdAt: string;
}

async function main() {
  const { client, target } = connect();
  const { rows } = await client.execute(
    `SELECT id, traceId, status, createdAt FROM KnowledgeTriage
     WHERE traceId IN (SELECT traceId FROM KnowledgeTriage WHERE traceId IS NOT NULL AND status != 'DISMISSED'
                       GROUP BY traceId HAVING COUNT(*) > 1)
       AND status != 'DISMISSED'`
  );
  const byTrace = new Map<string, TriageRow[]>();
  for (const row of rows as unknown as TriageRow[]) {
    byTrace.set(row.traceId, [...(byTrace.get(row.traceId) ?? []), row]);
  }

  const dismiss: TriageRow[] = [];
  for (const [traceId, items] of byTrace) {
    const [keep, ...others] = [...items].sort(
      (a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) || String(b.createdAt).localeCompare(String(a.createdAt))
    );
    const extra = others.filter((item) => item.status === "PENDING");
    console.log(`trace ${traceId}: keep ${keep.id} (${keep.status}), dismiss ${extra.length}`);
    dismiss.push(...extra);
  }

  console.log(`\n${target}: ${byTrace.size} traces with duplicates, ${dismiss.length} items to dismiss`);
  if (!apply) {
    console.log("Dry-run: nothing written. Re-run with --apply to dismiss them.");
    return;
  }
  for (const item of dismiss) {
    await client.execute({ sql: "UPDATE KnowledgeTriage SET status = 'DISMISSED' WHERE id = ?", args: [item.id] });
  }
  console.log(`Dismissed ${dismiss.length} items.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
