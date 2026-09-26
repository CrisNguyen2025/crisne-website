import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoAuthToken) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function isCurrentClient(client: PrismaClient) {
  const delegates = client as PrismaClient & {
    role?: unknown;
    apiEndpoint?: unknown;
    roleApiAccess?: unknown;
    roadmap?: unknown;
  };

  return Boolean(
    delegates.role &&
    delegates.apiEndpoint &&
    delegates.roleApiAccess &&
    delegates.roadmap
  );
}

export const prisma =
  globalForPrisma.prisma && isCurrentClient(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
