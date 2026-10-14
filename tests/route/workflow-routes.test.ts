import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET as getProjects, POST as createProjectRoute } from "@/app/api/workflows/projects/route";
import { GET as getWorkflows, POST as createWorkflowRoute } from "@/app/api/workflows/route";
import { GET as getWorkflowRoute, PUT as updateWorkflowRoute } from "@/app/api/workflows/[id]/route";
import { GET as getRunsRoute, POST as createRunRoute } from "@/app/api/workflows/[id]/runs/route";
import { GET as getRunDetailRoute } from "@/app/api/workflows/[id]/runs/[runId]/route";
import { createProject, createWorkflow, saveDraft } from "@/lib/workflow/repository";
import { SAMPLE_WORKFLOW_GRAPH, SAMPLE_WORKFLOW_UI } from "@/scripts/seed-sample-workflow";

const OWNER_1 = "owner1@example.com";
const OWNER_2 = "owner2@example.com";

beforeAll(() => {
  vi.stubEnv("AUTH_OWNER_EMAILS", `${OWNER_1},${OWNER_2}`);
});

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Workflow API Routes", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  describe("Authentication and Authorization", () => {
    it("returns 401 when no session is present", async () => {
      authMock.mockResolvedValue(null);

      const resGetProjects = await getProjects(jsonRequest("/api/workflows/projects", "GET"));
      expect(resGetProjects.status).toBe(401);

      const resPostProjects = await createProjectRoute(
        jsonRequest("/api/workflows/projects", "POST", { name: "P" })
      );
      expect(resPostProjects.status).toBe(401);

      const resGetWf = await getWorkflowRoute(
        jsonRequest("/api/workflows/wf-1", "GET"),
        { params: Promise.resolve({ id: "wf-1" }) }
      );
      expect(resGetWf.status).toBe(401);

      const resPutWf = await updateWorkflowRoute(
        jsonRequest("/api/workflows/wf-1", "PUT", { graph: {}, ui: {} }),
        { params: Promise.resolve({ id: "wf-1" }) }
      );
      expect(resPutWf.status).toBe(401);

      const resPostRuns = await createRunRoute(
        jsonRequest("/api/workflows/wf-1/runs", "POST", { input: { query: "hi" } }),
        { params: Promise.resolve({ id: "wf-1" }) }
      );
      expect(resPostRuns.status).toBe(401);
    });

    it("returns 404 when accessing another owner's resources", async () => {
      // Create project and workflow under OWNER_1
      const p1 = await createProject(OWNER_1, { name: "Owner 1 Project" });
      const wf1 = await createWorkflow(OWNER_1, p1.id, "Owner 1 Workflow");

      // Switch session to OWNER_2
      authMock.mockResolvedValue({ user: { email: OWNER_2 } });

      // OWNER_2 tries to create workflow in OWNER_1's project -> 404
      const resPostWf = await createWorkflowRoute(
        jsonRequest("/api/workflows", "POST", { projectId: p1.id, name: "Intruder WF" })
      );
      expect(resPostWf.status).toBe(404);

      // OWNER_2 tries to get OWNER_1's workflow -> 404
      const resGetWf = await getWorkflowRoute(
        jsonRequest(`/api/workflows/${wf1.id}`, "GET"),
        { params: Promise.resolve({ id: wf1.id }) }
      );
      expect(resGetWf.status).toBe(404);

      // OWNER_2 tries to update OWNER_1's workflow -> 404
      const resPutWf = await updateWorkflowRoute(
        jsonRequest(`/api/workflows/${wf1.id}`, "PUT", {
          graph: SAMPLE_WORKFLOW_GRAPH,
          ui: SAMPLE_WORKFLOW_UI,
        }),
        { params: Promise.resolve({ id: wf1.id }) }
      );
      expect(resPutWf.status).toBe(404);

      // OWNER_2 tries to run OWNER_1's workflow -> 404
      const resRun = await createRunRoute(
        jsonRequest(`/api/workflows/${wf1.id}/runs`, "POST", { input: { query: "hello" } }),
        { params: Promise.resolve({ id: wf1.id }) }
      );
      expect(resRun.status).toBe(404);
    });
  });

  describe("Validation and Error Handling", () => {
    beforeEach(() => {
      authMock.mockResolvedValue({ user: { email: OWNER_1 } });
    });

    it("returns 400 for bad request payloads", async () => {
      // POST project without name
      const res1 = await createProjectRoute(jsonRequest("/api/workflows/projects", "POST", {}));
      expect(res1.status).toBe(400);

      // GET workflows without projectId query param
      const res2 = await getWorkflows(jsonRequest("/api/workflows", "GET"));
      expect(res2.status).toBe(400);

      // POST workflow without name
      const res3 = await createWorkflowRoute(
        jsonRequest("/api/workflows", "POST", { projectId: "some-p" })
      );
      expect(res3.status).toBe(400);

      // PUT workflow without ui positions / viewport
      const res4 = await updateWorkflowRoute(
        jsonRequest("/api/workflows/wf-1", "PUT", { graph: {} }),
        { params: Promise.resolve({ id: "wf-1" }) }
      );
      expect(res4.status).toBe(400);

      // POST run without input.query
      const res5 = await createRunRoute(
        jsonRequest("/api/workflows/wf-1/runs", "POST", { input: {} }),
        { params: Promise.resolve({ id: "wf-1" }) }
      );
      expect(res5.status).toBe(400);
    });

    it("PUT returns 200 + errors when graph is invalid (saves draft even with errors)", async () => {
      const p = await createProject(OWNER_1, { name: "SaveDraft Project" });
      const wf = await createWorkflow(OWNER_1, p.id, "SaveDraft WF");

      const invalidGraph = {
        schemaVersion: 1,
        nodes: [{ id: "n1", type: "condition", config: {} }],
        edges: [],
      };

      const res = await updateWorkflowRoute(
        jsonRequest(`/api/workflows/${wf.id}`, "PUT", {
          graph: invalidGraph,
          ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
        }),
        { params: Promise.resolve({ id: wf.id }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.draftGraphHash).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it("POST runs returns 422 when graph is invalid", async () => {
      const p = await createProject(OWNER_1, { name: "Run Project" });
      const wf = await createWorkflow(OWNER_1, p.id, "Run WF");

      // Save invalid graph
      const invalidGraph = {
        schemaVersion: 1,
        nodes: [{ id: "n1", type: "condition", config: {} }],
        edges: [],
      };
      await saveDraft(OWNER_1, wf.id, {
        graph: invalidGraph,
        ui: { positions: {}, labels: {}, viewport: { x: 0, y: 0, zoom: 1 } },
      });

      const res = await createRunRoute(
        jsonRequest(`/api/workflows/${wf.id}/runs`, "POST", {
          input: { query: "hello" },
        }),
        { params: Promise.resolve({ id: wf.id }) }
      );

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Happy Path CRUD & Execution", () => {
    beforeEach(() => {
      authMock.mockResolvedValue({ user: { email: OWNER_1 } });
    });

    it("creates project, creates workflow, saves valid draft, runs dry-run, and reads run details", async () => {
      // 1. Create project
      const projRes = await createProjectRoute(
        jsonRequest("/api/workflows/projects", "POST", { name: "Happy Path Project" })
      );
      expect(projRes.status).toBe(201);
      const { project } = await projRes.json();
      expect(project.id).toBeDefined();

      // 2. List projects
      const listProjRes = await getProjects(jsonRequest("/api/workflows/projects", "GET"));
      const listProjData = await listProjRes.json();
      expect(listProjData.projects.some((p: { id: string }) => p.id === project.id)).toBe(true);

      // 3. Create workflow
      const wfRes = await createWorkflowRoute(
        jsonRequest("/api/workflows", "POST", { projectId: project.id, name: "My Greeting Workflow" })
      );
      expect(wfRes.status).toBe(201);
      const { workflow } = await wfRes.json();
      expect(workflow.id).toBeDefined();

      // 4. Update workflow with sample greeting graph
      const putRes = await updateWorkflowRoute(
        jsonRequest(`/api/workflows/${workflow.id}`, "PUT", {
          graph: SAMPLE_WORKFLOW_GRAPH,
          ui: SAMPLE_WORKFLOW_UI,
        }),
        { params: Promise.resolve({ id: workflow.id }) }
      );
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.errors).toEqual([]);

      // 5. Run dry-run
      const runRes = await createRunRoute(
        jsonRequest(`/api/workflows/${workflow.id}/runs`, "POST", {
          input: { query: "Hello Cris" },
          dryRun: true,
        }),
        { params: Promise.resolve({ id: workflow.id }) }
      );
      expect(runRes.status).toBe(200);
      const { run } = await runRes.json();
      expect(run.status).toBe("SUCCEEDED");
      expect(run.dryRun).toBe(true);
      expect(run.nodes.length).toBe(5);

      // 6. List runs
      const listRunsRes = await getRunsRoute(
        jsonRequest(`/api/workflows/${workflow.id}/runs?limit=10`, "GET"),
        { params: Promise.resolve({ id: workflow.id }) }
      );
      expect(listRunsRes.status).toBe(200);
      const { runs } = await listRunsRes.json();
      expect(runs.length).toBeGreaterThan(0);
      expect(runs[0].id).toBe(run.id);

      // 7. Get run detail
      const detailRes = await getRunDetailRoute(
        jsonRequest(`/api/workflows/${workflow.id}/runs/${run.id}`, "GET"),
        { params: Promise.resolve({ id: workflow.id, runId: run.id }) }
      );
      expect(detailRes.status).toBe(200);
      const detailData = await detailRes.json();
      expect(detailData.run.id).toBe(run.id);
      expect(detailData.run.nodes.length).toBe(5);
    });
  });
});
