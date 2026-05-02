import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function isCurrentClient(client: PrismaClient) {
  const delegates = client as PrismaClient & {
    role?: unknown;
    apiEndpoint?: unknown;
    roleApiAccess?: unknown;
  };

  return Boolean(delegates.role && delegates.apiEndpoint && delegates.roleApiAccess);
}

export const prisma =
  globalForPrisma.prisma && isCurrentClient(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
