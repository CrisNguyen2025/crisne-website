import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { publishVersion, listVersions, createProject, createWorkflow, saveDraft } from "@/lib/workflow/repository";
import { runWorkflow } from "@/lib/workflow/run-service";
import { GET as getVersionsRoute, POST as publishVersionRoute } from "@/app/api/workflows/[id]/versions/route";
import type { WorkflowGraph, WorkflowUi } from "@/lib/workflow/dsl-types";

const VERSION_OWNER = "version-owner@example.com";

beforeAll(() => {
  vi.stubEnv("AUTH_OWNER_EMAILS", VERSION_OWNER);
});

describe("Workflow Versioning & Publishing (M4)", () => {
  let projectId: string;
  let workflowId: string;

  const validGraph: WorkflowGraph = {
    schemaVersion: 1,
    nodes: [
      { id: "input-1", type: "input", config: {} },
      { id: "output-1", type: "output", config: {} },
    ],
    edges: [
      { id: "e1", sourceNodeId: "input-1", sourcePort: "query", targetNodeId: "output-1", targetPort: "value" },
    ],
  };

  const validUi: WorkflowUi = {
    positions: { "input-1": { x: 0, y: 0 }, "output-1": { x: 300, y: 0 } },
    labels: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  beforeEach(async () => {
    authMock.mockReset();

    await prisma.workflowRun.deleteMany({
      where: { project: { ownerId: VERSION_OWNER } },
    });
    await prisma.workflowVersion.deleteMany({
      where: { workflow: { ownerId: VERSION_OWNER } },
    });
    await prisma.workflow.deleteMany({
      where: { ownerId: VERSION_OWNER },
    });
    await prisma.workflowProject.deleteMany({
      where: { ownerId: VERSION_OWNER },
    });

    const project = await createProject(VERSION_OWNER, { name: "Versioning Test Project" });
    projectId = project.id;

    const wf = await createWorkflow(VERSION_OWNER, projectId, "Versionable Workflow");
    workflowId = wf.id;

    // Save valid draft
    await saveDraft(VERSION_OWNER, workflowId, { graph: validGraph, ui: validUi });
  });

  afterEach(async () => {
    await prisma.workflowProject.deleteMany({
      where: { ownerId: VERSION_OWNER },
    });
  });

  describe("Publishing Versions", () => {
    it("publishes sequential versions (v1, v2) and retains immutable snapshots", async () => {
      // 1. Publish v1
      const res1 = await publishVersion(VERSION_OWNER, workflowId);
      expect(res1.ok).toBe(true);
      if (!res1.ok) return;

      expect(res1.version.versionNumber).toBe(1);
      const v1Hash = res1.version.graphHash;
      expect(v1Hash).toBeDefined();

      // 2. Modify draft to add a description or change edge
      const modifiedGraph: WorkflowGraph = {
        ...validGraph,
        nodes: [
          { id: "input-1", type: "input", config: { description: "Modified input query" } },
          { id: "output-1", type: "output", config: {} },
        ],
      };
      await saveDraft(VERSION_OWNER, workflowId, { graph: modifiedGraph, ui: validUi });

      // 3. Publish v2
      const res2 = await publishVersion(VERSION_OWNER, workflowId);
      expect(res2.ok).toBe(true);
      if (!res2.ok) return;

      expect(res2.version.versionNumber).toBe(2);
      expect(res2.version.graphHash).not.toBe(v1Hash);

      // 4. Verify v1 in database is completely unchanged
      const versions = await listVersions(VERSION_OWNER, workflowId);
      expect(versions).toHaveLength(2);
      expect(versions?.[0].versionNumber).toBe(2);
      expect(versions?.[1].versionNumber).toBe(1);
      expect(versions?.[1].graphHash).toBe(v1Hash);
      expect(JSON.parse(versions![1].graph).nodes[0].config.description).toBeUndefined();
    });

    it("rejects publishing when draft graph has validation errors (422)", async () => {
      // Create invalid graph (missing edge to output)
      const invalidGraph: WorkflowGraph = {
        schemaVersion: 1,
        nodes: [
          { id: "input-1", type: "input", config: {} },
          { id: "output-1", type: "output", config: {} },
        ],
        edges: [], // No edge from input to output!
      };
      await saveDraft(VERSION_OWNER, workflowId, { graph: invalidGraph, ui: validUi });

      const res = await publishVersion(VERSION_OWNER, workflowId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.validationErrors).toBeDefined();
        expect(res.validationErrors!.length).toBeGreaterThan(0);
      }

      // No version should be created
      const versions = await listVersions(VERSION_OWNER, workflowId);
      expect(versions).toHaveLength(0);
    });
  });

  describe("Execution by versionId vs draft", () => {
    it("runs specific versionId using version graph even when working draft has changed", async () => {
      // 1. Publish v1
      const pubRes = await publishVersion(VERSION_OWNER, workflowId);
      expect(pubRes.ok).toBe(true);
      if (!pubRes.ok) return;
      const v1 = pubRes.version;

      // 2. Modify draft radically
      const draftGraph: WorkflowGraph = {
        schemaVersion: 1,
        nodes: [
          { id: "input-1", type: "input", config: { description: "Draft version" } },
          { id: "output-1", type: "output", config: {} },
        ],
        edges: [
          { id: "e1", sourceNodeId: "input-1", sourcePort: "query", targetNodeId: "output-1", targetPort: "value" },
        ],
      };
      await saveDraft(VERSION_OWNER, workflowId, { graph: draftGraph, ui: validUi });

      // 3. Execute with versionId
      const runRes = await runWorkflow({
        ownerId: VERSION_OWNER,
        workflowId,
        input: { query: "Test version execution" },
        dryRun: true,
        versionId: v1.id,
      });

      expect(runRes.ok).toBe(true);
      if (!runRes.ok) return;

      expect(runRes.run.status).toBe("SUCCEEDED");
      expect(runRes.run.graphHash).toBe(v1.graphHash);

      // Verify the run stored workflowVersionId in DB
      const dbRun = await prisma.workflowRun.findUnique({
        where: { id: runRes.run.id },
      });
      expect(dbRun?.workflowVersionId).toBe(v1.id);
    });
  });

  describe("Route Handlers: /api/workflows/[id]/versions", () => {
    it("POST /api/workflows/[id]/versions publishes version with 201", async () => {
      authMock.mockResolvedValue({ user: { email: VERSION_OWNER } });

      const req = new NextRequest(`http://localhost/api/workflows/${workflowId}/versions`, {
        method: "POST",
      });

      const res = await publishVersionRoute(req, {
        params: Promise.resolve({ id: workflowId }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.version.versionNumber).toBe(1);
    });

    it("POST /api/workflows/[id]/versions returns 422 on invalid draft graph", async () => {
      authMock.mockResolvedValue({ user: { email: VERSION_OWNER } });

      // Make draft invalid
      await saveDraft(VERSION_OWNER, workflowId, {
        graph: { schemaVersion: 1, nodes: [{ id: "input-1", type: "input", config: {} }], edges: [] },
        ui: validUi,
      });

      const req = new NextRequest(`http://localhost/api/workflows/${workflowId}/versions`, {
        method: "POST",
      });

      const res = await publishVersionRoute(req, {
        params: Promise.resolve({ id: workflowId }),
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.errors).toBeDefined();
    });

    it("GET /api/workflows/[id]/versions returns published versions list", async () => {
      authMock.mockResolvedValue({ user: { email: VERSION_OWNER } });

      await publishVersion(VERSION_OWNER, workflowId);

      const req = new NextRequest(`http://localhost/api/workflows/${workflowId}/versions`);
      const res = await getVersionsRoute(req, {
        params: Promise.resolve({ id: workflowId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.versions).toHaveLength(1);
      expect(data.versions[0].versionNumber).toBe(1);
    });
  });
});
