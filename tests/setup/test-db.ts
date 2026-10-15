import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Same value as `test.env.DATABASE_URL` in vitest.config.mts; relative to prisma/schema.prisma
export const TEST_DATABASE_URL = "file:./test.db";

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
}
