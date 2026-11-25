import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

// Same value as `test.env.DATABASE_URL` in vitest.config.mts; relative to prisma/schema.prisma
export const TEST_DATABASE_URL = "file:./test.db";

/** Clean copy of test.db taken right after `db push`; per-worker DBs are copied from it. */
export const TEST_DB_TEMPLATE_FILE = "test.db.template";
export const TEST_DB_WORKER_PREFIX = "test.db.worker-";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Vitest global setup: brings prisma/test.db up to the current schema before any test runs,
 * so DB-backed tests never write to prisma/dev.db. (Yarn 4 does not run `pretest` scripts.)
 */
export default async function setup(): Promise<() => void> {
  const prismaDir = path.join(rootDir, "prisma");
  const cleanArtifacts = (keepMainTestDb = false) => {
    for (const name of fs.readdirSync(prismaDir)) {
      if (keepMainTestDb && name === "test.db") continue;
      if (name === "test.db" || name.startsWith("test.db-") || name.startsWith("test.db.")) {
        fs.rmSync(path.join(prismaDir, name), { force: true });
      }
    }
  };
  cleanArtifacts(false);

  execFileSync(
    path.join(rootDir, "node_modules/.bin/prisma"),
    ["db", "push", "--skip-generate", "--accept-data-loss"],
    {
      cwd: rootDir,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    }
  );

  // Checkpoint any WAL frames into test.db before snapshotting it for isolated workers
  const dbPath = path.join(prismaDir, "test.db");
  const client = createClient({ url: `file:${dbPath}` });
  try {
    await client.execute("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    client.close();
  }

  fs.copyFileSync(dbPath, path.join(prismaDir, TEST_DB_TEMPLATE_FILE));
  return () => {
    cleanArtifacts(false);
  };
}
