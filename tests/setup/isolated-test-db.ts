import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_DB_TEMPLATE_FILE, TEST_DB_WORKER_PREFIX } from "./test-db";

const prismaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma");
const dbFile = `${TEST_DB_WORKER_PREFIX}${crypto.randomUUID()}`;

const dbPath = path.join(prismaDir, dbFile);
fs.copyFileSync(path.join(prismaDir, TEST_DB_TEMPLATE_FILE), dbPath);
process.env.DATABASE_URL = `file:./${dbFile}`;
(globalThis as { prisma?: unknown }).prisma = undefined;
