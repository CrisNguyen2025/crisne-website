import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed some default tags
  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { name: "Frontend" },
      update: {},
      create: { name: "Frontend", color: "#6b9ac4" },
    }),
    prisma.tag.upsert({
      where: { name: "Backend" },
      update: {},
      create: { name: "Backend", color: "#7c9e6e" },
    }),
    prisma.tag.upsert({
      where: { name: "Tools" },
      update: {},
      create: { name: "Tools", color: "#c4a96b" },
    }),
    prisma.tag.upsert({
      where: { name: "Reading" },
      update: {},
      create: { name: "Reading", color: "#9b6bc4" },
    }),
  ]);

  console.log(`✅ Seeded ${tags.length} tags`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
