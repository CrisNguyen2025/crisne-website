import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { WorkflowVersion } from "@prisma/client";
import type { WorkflowGraph, WorkflowUi } from "./dsl-types";
import { graphHash } from "./graph-hash";
import { validateWorkflowGraph, type ValidationError } from "./dsl-validator";

export const DEFAULT_WORKFLOW_GRAPH: WorkflowGraph = {
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
      id: "output-1",
      type: "output",
      config: {},
    },
  ],
  edges: [
    {
      id: "e-input-output",
      sourceNodeId: "input-1",
      sourcePort: "query",
      targetNodeId: "output-1",
      targetPort: "value",
    },
  ],
};

export const DEFAULT_WORKFLOW_UI: WorkflowUi = {
  positions: {
    "input-1": { x: 100, y: 150 },
    "output-1": { x: 500, y: 150 },
  },
  labels: {
    "input-1": "Input",
    "output-1": "Output",
  },
  viewport: { x: 0, y: 0, zoom: 1 },
};

export async function listProjects(ownerId: string) {
  return prisma.workflowProject.findMany({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createProject(ownerId: string, data: { name: string; description?: string }) {
  return prisma.workflowProject.create({
    data: {
      ownerId,
      name: data.name,
      description: data.description ?? null,
    },
  });
}

export async function listWorkflows(ownerId: string, projectId: string) {
  return prisma.workflow.findMany({
    where: { ownerId, projectId },
    select: {
      id: true,
      name: true,
      projectId: true,
      draftGraphHash: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createWorkflow(ownerId: string, projectId: string, name: string) {
  const project = await prisma.workflowProject.findFirst({
    where: { id: projectId, ownerId },
  });
  if (!project) {
    throw new Error(`Project "${projectId}" not found for owner.`);
  }

  const draftGraphStr = JSON.stringify(DEFAULT_WORKFLOW_GRAPH);
  const draftUiStr = JSON.stringify(DEFAULT_WORKFLOW_UI);
  const draftGraphHash = graphHash(DEFAULT_WORKFLOW_GRAPH);

  return prisma.workflow.create({
    data: {
      ownerId,
      projectId,
      name,
      draftGraph: draftGraphStr,
      draftUi: draftUiStr,
      draftGraphHash,
    },
  });
}

export async function getWorkflow(ownerId: string, id: string) {
  const workflow = await prisma.workflow.findFirst({
    where: { id, ownerId },
  });
  if (!workflow) return null;

  let graph: unknown = null;
  let ui: unknown = null;
  try {
    graph = JSON.parse(workflow.draftGraph);
  } catch {
    graph = null;
  }
  try {
    ui = JSON.parse(workflow.draftUi);
  } catch {
    ui = null;
  }

  const validation = validateWorkflowGraph(graph);

  return {
    workflow: {
      id: workflow.id,
      name: workflow.name,
      projectId: workflow.projectId,
      graph,
      ui,
      draftGraphHash: workflow.draftGraphHash,
      updatedAt: workflow.updatedAt,
      createdAt: workflow.createdAt,
    },
    errors: validation.ok ? [] : validation.errors,
  };
}

export interface SaveDraftData {
  graph: unknown;
  ui: unknown;
  name?: string;
}

export interface SaveDraftResult {
  draftGraphHash: string;
  errors: ValidationError[];
}

export async function saveDraft(
  ownerId: string,
  id: string,
  data: SaveDraftData
): Promise<SaveDraftResult | null> {
  const existing = await prisma.workflow.findFirst({
    where: { id, ownerId },
  });
  if (!existing) return null;

  const validation = validateWorkflowGraph(data.graph);

  let computedHash: string;
  try {
    if (data.graph && typeof data.graph === "object" && Array.isArray((data.graph as Record<string, unknown>).nodes)) {
      computedHash = graphHash(data.graph as WorkflowGraph);
    } else {
      computedHash = createHash("sha256").update(JSON.stringify(data.graph)).digest("hex");
    }
  } catch {
    computedHash = createHash("sha256").update(JSON.stringify(data.graph)).digest("hex");
  }

  await prisma.workflow.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name } : {}),
      draftGraph: JSON.stringify(data.graph),
      draftUi: JSON.stringify(data.ui),
      draftGraphHash: computedHash,
    },
  });

  return {
    draftGraphHash: computedHash,
    errors: validation.ok ? [] : validation.errors,
  };
}

export type PublishVersionResult =
  | { ok: true; version: WorkflowVersion }
  | { ok: false; notFound?: boolean; validationErrors?: ValidationError[]; message?: string };

export async function publishVersion(
  ownerId: string,
  workflowId: string
): Promise<PublishVersionResult> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ownerId },
  });
  if (!workflow) {
    return { ok: false, notFound: true, message: `Workflow "${workflowId}" not found for owner.` };
  }

  let rawGraph: unknown;
  try {
    rawGraph = JSON.parse(workflow.draftGraph);
  } catch {
    return {
      ok: false,
      validationErrors: [{ code: "INVALID_SHAPE", message: "Draft graph is not valid JSON." }],
    };
  }

  const validation = validateWorkflowGraph(rawGraph);
  if (!validation.ok) {
    return {
      ok: false,
      validationErrors: validation.errors,
    };
  }

  const version = await prisma.$transaction(async (tx) => {
    const latest = await tx.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    return tx.workflowVersion.create({
      data: {
        workflowId,
        versionNumber: nextVersionNumber,
        graph: workflow.draftGraph,
        graphHash: workflow.draftGraphHash,
        ui: workflow.draftUi,
      },
    });
  });

  return { ok: true, version };
}

export async function listVersions(
  ownerId: string,
  workflowId: string
): Promise<WorkflowVersion[] | null> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ownerId },
  });
  if (!workflow) return null;

  return prisma.workflowVersion.findMany({
    where: { workflowId },
    orderBy: { versionNumber: "desc" },
  });
}
