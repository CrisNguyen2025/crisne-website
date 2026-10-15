import path from "path";
import { PrismaClient } from "@prisma/client";
import type { WorkflowGraph, WorkflowUi } from "../lib/workflow/dsl-types";
import { graphHash } from "../lib/workflow/graph-hash";
import { validateWorkflowGraph } from "../lib/workflow/dsl-validator";

export const SAMPLE_WORKFLOW_GRAPH: WorkflowGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "input-1",
      type: "input",
      config: {
        description: "User input query",
      },
    },
    {
      id: "condition-1",
      type: "condition",
      config: {
        branches: [
          {
            name: "greeting",
            operator: "contains",
            value: "hello",
          },
        ],
      },
    },
    {
      id: "merge-1",
      type: "merge",
      config: {
        mode: "join_strings",
        separator: " ",
      },
    },
    {
      id: "llm-1",
      type: "llm",
      config: {
        prompt: "The user said: {{inputs.question}}. Respond courteously and briefly.",
        system: "You are a friendly assistant.",
        temperature: 0.3,
        maxOutputTokens: 256,
      },
    },
    {
      id: "output-1",
      type: "output",
      config: {},
    },
  ],
  edges: [
    {
      id: "e-input-condition",
      sourceNodeId: "input-1",
      sourcePort: "query",
      targetNodeId: "condition-1",
      targetPort: "value",
    },
    {
      id: "e-condition-greeting-merge",
      sourceNodeId: "condition-1",
      sourcePort: "greeting",
      targetNodeId: "merge-1",
      targetPort: "items",
    },
    {
      id: "e-condition-else-merge",
      sourceNodeId: "condition-1",
      sourcePort: "else",
      targetNodeId: "merge-1",
      targetPort: "items",
    },
    {
      id: "e-merge-llm",
      sourceNodeId: "merge-1",
      sourcePort: "value",
      targetNodeId: "llm-1",
      targetPort: "question",
    },
    {
      id: "e-llm-output",
      sourceNodeId: "llm-1",
      sourcePort: "text",
      targetNodeId: "output-1",
      targetPort: "value",
    },
  ],
};

export const SAMPLE_WORKFLOW_UI: WorkflowUi = {
  positions: {
    "input-1": { x: 80, y: 150 },
    "condition-1": { x: 280, y: 150 },
    "merge-1": { x: 500, y: 150 },
    "llm-1": { x: 720, y: 150 },
    "output-1": { x: 940, y: 150 },
  },
  labels: {
    "input-1": "Input",
    "condition-1": "Greeting Check",
    "merge-1": "Merge Branches",
    "llm-1": "LLM Reply",
    "output-1": "Output",
  },
  viewport: { x: 0, y: 0, zoom: 1 },
};

async function seed() {
  // Local SQLite dev.db client to avoid writing to Turso
  const dbPath = path.resolve(process.cwd(), "prisma/dev.db");
  const prisma = new PrismaClient({
    datasources: {
      db: { url: `file:${dbPath}` },
    },
  });

  const validation = validateWorkflowGraph(SAMPLE_WORKFLOW_GRAPH);
  if (!validation.ok) {
    throw new Error(`Sample workflow is invalid: ${JSON.stringify(validation.errors)}`);
  }

  const ownerEmail =
    process.env.AUTH_OWNER_EMAILS?.split(",")[0]?.trim() || "cris@bearabyte.io";

  // 1. Create or get Demo project
  let project = await prisma.workflowProject.findFirst({
    where: { ownerId: ownerEmail, name: "Demo" },
  });

  if (!project) {
    project = await prisma.workflowProject.create({
      data: {
        ownerId: ownerEmail,
        name: "Demo",
        description: "Demo project with sample greeting classifier workflow",
      },
    });
  }

  // 2. Create sample workflow
  const hash = graphHash(SAMPLE_WORKFLOW_GRAPH);
  const workflow = await prisma.workflow.create({
    data: {
      projectId: project.id,
      ownerId: ownerEmail,
      name: "Greeting Classifier & Reply",
      description: "Sample workflow: input → condition → merge → llm → output",
      draftGraph: JSON.stringify(SAMPLE_WORKFLOW_GRAPH),
      draftUi: JSON.stringify(SAMPLE_WORKFLOW_UI),
      draftGraphHash: hash,
    },
  });

  console.log(`Demo Project ID: ${project.id}`);
  console.log(`Workflow created with ID: ${workflow.id}`);
  console.log(`Workflow draftGraphHash: ${hash}`);

  await prisma.$disconnect();
}

// Seed only when run as a script (`npx tsx scripts/seed-sample-workflow.ts`): tests import
// the sample graph from this file and must not write to prisma/dev.db
if (/seed-sample-workflow\.ts$/.test(process.argv[1] ?? "")) {
  seed().catch((err) => {
    console.error("Failed to seed sample workflow:", err);
    process.exit(1);
  });
}
