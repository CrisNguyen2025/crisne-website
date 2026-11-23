import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_DB_TEMPLATE_FILE, TEST_DB_WORKER_PREFIX } from "./test-db";

/**
 * Side-effect module: points DATABASE_URL at a private copy of the test DB for this test file.
 *
 * Import it FIRST, before anything that loads `@/lib/prisma`. Use it in test files that wipe whole
 * tables in `beforeEach` (the news route tests): on the shared prisma/test.db, files running in
 * parallel would delete each other's rows mid-test.
 */
const prismaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma");
const workerId = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? String(process.pid);
const dbFile = `${TEST_DB_WORKER_PREFIX}${workerId}`;

const dbPath = path.join(prismaDir, dbFile);
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
fs.copyFileSync(path.join(prismaDir, TEST_DB_TEMPLATE_FILE), dbPath);
// Relative to prisma/schema.prisma, like TEST_DATABASE_URL
process.env.DATABASE_URL = `file:./${dbFile}`;
