import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
export default function setup(): void {
  execFileSync(
    path.join(rootDir, "node_modules/.bin/prisma"),
    ["db", "push", "--skip-generate", "--accept-data-loss"],
    {
      cwd: rootDir,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    }
  );

  // Snapshot the freshly pushed schema before any test writes to test.db, and drop the
  // per-worker copies left by the previous run (see tests/setup/isolated-test-db.ts).
  const prismaDir = path.join(rootDir, "prisma");
  for (const name of fs.readdirSync(prismaDir)) {
    if (name.startsWith(TEST_DB_WORKER_PREFIX)) {
      fs.rmSync(path.join(prismaDir, name), { force: true });
    }
  }
  fs.copyFileSync(path.join(prismaDir, "test.db"), path.join(prismaDir, TEST_DB_TEMPLATE_FILE));
}
