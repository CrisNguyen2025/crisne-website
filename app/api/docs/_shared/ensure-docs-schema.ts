import { prisma } from "@/lib/prisma";

let ensured = false;

async function ensureFeatureColumns() {
  await prisma.$executeRawUnsafe(`ALTER TABLE ApiEndpoint ADD COLUMN featureId TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ApiEndpoint ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ApiEndpoint ADD COLUMN reviewed BOOLEAN NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ApiEndpoint ADD COLUMN requestExample TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE ApiEndpoint ADD COLUMN responseExample TEXT`);
}

export async function ensureDocsSchema() {
  if (ensured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Role (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      focusTasks TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Feature (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ApiEndpoint (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      module TEXT NOT NULL,
      summary TEXT NOT NULL,
      requestExample TEXT,
      responseExample TEXT,
      featureId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      reviewed BOOLEAN NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(method, path)
    );
  `);

  try {
    await ensureFeatureColumns();
  } catch {
    // ignore duplicate-column errors
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS RoleApiAccess (
      id TEXT PRIMARY KEY,
      roleId TEXT NOT NULL,
      apiId TEXT NOT NULL,
      access TEXT NOT NULL DEFAULT 'denied',
      note TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(roleId, apiId),
      FOREIGN KEY(roleId) REFERENCES Role(id) ON DELETE CASCADE,
      FOREIGN KEY(apiId) REFERENCES ApiEndpoint(id) ON DELETE CASCADE
    );
  `);

  ensured = true;
}
