import { PrismaClient } from "@prisma/client";
import { INITIAL_ROADMAP_DATA } from "../lib/roadmap/data";

const prisma = new PrismaClient();

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
      shortCode: "AI",
      description: "Comprehensive blueprint for LLM applications, RAG pipelines, evaluations, and production serving.",
      icon: "Cpu",
      order: 1,
    },
    create: {
      slug: "ai-architecture",
      title: "AI & LLM Architecture Roadmap",
      shortCode: "AI",
      description: "Comprehensive blueprint for LLM applications, RAG pipelines, evaluations, and production serving.",
      icon: "Cpu",
      order: 1,
    },
  });

  // Seed AI Roadmap Layers, Groups and Items
  for (const layerData of INITIAL_ROADMAP_DATA) {
    const layer = await prisma.roadmapLayer.upsert({
      where: { id: layerData.id },
      update: {
        roadmapId: aiRoadmap.id,
        order: layerData.order,
        shortTag: layerData.shortTag,
        title: layerData.title,
        subtitle: layerData.subtitle,
      },
      create: {
        id: layerData.id,
        roadmapId: aiRoadmap.id,
        order: layerData.order,
        shortTag: layerData.shortTag,
        title: layerData.title,
        subtitle: layerData.subtitle,
      },
    });

    for (let gIdx = 0; gIdx < layerData.groups.length; gIdx++) {
      const groupData = layerData.groups[gIdx];
      const groupId = `${layer.id}-${groupData.level}`;

      const group = await prisma.roadmapGroup.upsert({
        where: { id: groupId },
        update: {
          layerId: layer.id,
          level: groupData.level,
          title: groupData.title,
          order: gIdx + 1,
        },
        create: {
          id: groupId,
          layerId: layer.id,
          level: groupData.level,
          title: groupData.title,
          order: gIdx + 1,
        },
      });

      for (let iIdx = 0; iIdx < groupData.items.length; iIdx++) {
        const itemData = groupData.items[iIdx];
        await prisma.roadmapItem.upsert({
          where: { id: itemData.id },
          update: {
            groupId: group.id,
            title: itemData.title,
            description: itemData.description,
            content: itemData.content || null,
            order: iIdx + 1,
          },
          create: {
            id: itemData.id,
            groupId: group.id,
            title: itemData.title,
            description: itemData.description,
            content: itemData.content || null,
            order: iIdx + 1,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded AI Architecture Roadmap with ${INITIAL_ROADMAP_DATA.length} layers`);

  // 3. Seed Demo Roadmap 2: Backend Engineering Roadmap
  const beRoadmap = await prisma.roadmap.upsert({
    where: { slug: "backend-roadmap" },
    update: {
      title: "Backend Engineering Roadmap",
      shortCode: "BE",
      description: "Core architectural foundations, APIs, caching, databases, and microservices patterns.",
      icon: "Server",
      order: 2,
    },
    create: {
      slug: "backend-roadmap",
      title: "Backend Engineering Roadmap",
      shortCode: "BE",
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
          level: "core",
          title: "🟢 Core",
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
          level: "intermediate",
          title: "🟡 Intermediate",
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
          level: "core",
          title: "🟢 Core",
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

  for (const layerData of beLayers) {
    const layer = await prisma.roadmapLayer.upsert({
      where: { id: layerData.id },
      update: {
        roadmapId: beRoadmap.id,
        order: layerData.order,
        shortTag: layerData.shortTag,
        title: layerData.title,
        subtitle: layerData.subtitle,
      },
      create: {
        id: layerData.id,
        roadmapId: beRoadmap.id,
        order: layerData.order,
        shortTag: layerData.shortTag,
        title: layerData.title,
        subtitle: layerData.subtitle,
      },
    });

    for (let gIdx = 0; gIdx < layerData.groups.length; gIdx++) {
      const groupData = layerData.groups[gIdx];
      const groupId = `${layer.id}-${groupData.level}`;

      const group = await prisma.roadmapGroup.upsert({
        where: { id: groupId },
        update: {
          layerId: layer.id,
          level: groupData.level,
          title: groupData.title,
          order: gIdx + 1,
        },
        create: {
          id: groupId,
          layerId: layer.id,
          level: groupData.level,
          title: groupData.title,
          order: gIdx + 1,
        },
      });

      for (let iIdx = 0; iIdx < groupData.items.length; iIdx++) {
        const itemData = groupData.items[iIdx];
        await prisma.roadmapItem.upsert({
          where: { id: itemData.id },
          update: {
            groupId: group.id,
            title: itemData.title,
            description: itemData.description,
            order: iIdx + 1,
          },
          create: {
            id: itemData.id,
            groupId: group.id,
            title: itemData.title,
            description: itemData.description,
            order: iIdx + 1,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded Backend Roadmap with ${beLayers.length} layers`);
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
