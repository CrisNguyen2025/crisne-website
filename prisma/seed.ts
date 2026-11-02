import * as fs from "fs";
import * as path from "path";

// Tự động nạp .env.local và .env khi chạy prisma db seed độc lập
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(__dirname, "..", file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadEnv();

import { prisma } from "../lib/prisma";
import { INITIAL_ROADMAP_DATA, type SeedLayer } from "../lib/roadmap/data";
import { sectionName } from "../scripts/lib/flatten-sections";

/** Writes the lessons of a topic in page order, each under its section (ADR-0009). */
async function seedLayers(roadmapId: string, layers: SeedLayer[]) {
  let order = 0;
  for (const layer of layers) {
    for (const group of layer.groups) {
      const section = sectionName(
        { id: layer.id, roadmapId, order: layer.order, title: layer.title },
        group.title,
        layer.groups.length,
      );
      for (const item of group.items) {
        order += 1;
        const data = {
          roadmapId,
          section,
          title: item.title,
          description: item.description,
          content: item.content || null,
          order,
        };
        await prisma.roadmapItem.upsert({ where: { id: item.id }, update: data, create: { id: item.id, ...data } });
      }
    }
  }
}

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Seed Tags (existing logic)
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

  // 2. Seed Roadmap: AI & LLM Architecture
  const aiRoadmap = await prisma.roadmap.upsert({
    where: { slug: "ai-architecture" },
    update: {
      title: "AI & LLM Architecture Roadmap",
      description: "Comprehensive blueprint for LLM applications, RAG pipelines, evaluations, and production serving.",
      icon: "Cpu",
      order: 1,
    },
    create: {
      slug: "ai-architecture",
      title: "AI & LLM Architecture Roadmap",
      description: "Comprehensive blueprint for LLM applications, RAG pipelines, evaluations, and production serving.",
      icon: "Cpu",
      order: 1,
    },
  });

  await seedLayers(aiRoadmap.id, INITIAL_ROADMAP_DATA);
  console.log(`✅ Seeded AI Architecture Roadmap with ${INITIAL_ROADMAP_DATA.length} layers`);

  // 3. Seed Demo Roadmap 2: Backend Engineering Roadmap
  const beRoadmap = await prisma.roadmap.upsert({
    where: { slug: "backend-roadmap" },
    update: {
      title: "Backend Engineering Roadmap",
      description: "Core architectural foundations, APIs, caching, databases, and microservices patterns.",
      icon: "Server",
      order: 2,
    },
    create: {
      slug: "backend-roadmap",
      title: "Backend Engineering Roadmap",
      description: "Core architectural foundations, APIs, caching, databases, and microservices patterns.",
      icon: "Server",
      order: 2,
    },
  });

  const beLayers = [
    {
      id: "be-layer-01",
      order: 1,
      shortTag: "01-DB",
      title: "01. Database Architecture & Persistence",
      subtitle: "Relational, NoSQL, indexing strategies, migrations, and ORMs",
      groups: [
        {
          id: "be-layer-01-core",
          title: "Core",
          items: [
            {
              id: "be-item-01",
              title: "Relational DB (PostgreSQL / MySQL)",
              description: "ACID properties, transactions, normalization, foreign keys, and connection pooling.",
            },
            {
              id: "be-item-02",
              title: "B-Tree & GiST Indexing",
              description: "Understanding query execution plans (EXPLAIN ANALYZE) and composite index performance.",
            },
            {
              id: "be-item-03",
              title: "Database Migrations & Schema Evolution",
              description: "Safe zero-downtime migration strategies (expand and contract pattern).",
            },
          ],
        },
        {
          id: "be-layer-01-intermediate",
          title: "Intermediate",
          items: [
            {
              id: "be-item-04",
              title: "Read Replicas & Connection Pooling (PgBouncer)",
              description: "Scaling read heavy workloads with master-replica replication and connection pooling.",
            },
          ],
        },
      ],
    },
    {
      id: "be-layer-02",
      order: 2,
      shortTag: "02-API",
      title: "02. API Design & Communication",
      subtitle: "RESTful, GraphQL, gRPC, and asynchronous message broker patterns",
      groups: [
        {
          id: "be-layer-02-core",
          title: "Core",
          items: [
            {
              id: "be-item-05",
              title: "Idempotency & HTTP Semantics",
              description: "Proper use of HTTP verbs, status codes, and Idempotency-Key headers for distributed safety.",
            },
            {
              id: "be-item-06",
              title: "Authentication & Authorization (JWT / OAuth2 / RBAC)",
              description: "Session management, token refresh flows, and role-based access control.",
            },
          ],
        },
      ],
    },
  ];

  await seedLayers(beRoadmap.id, beLayers);
  console.log(`✅ Seeded Backend Roadmap with ${beLayers.length} layers`);
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
