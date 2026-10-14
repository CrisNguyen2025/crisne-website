import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

// Mock Gemini provider for embeddings during route ingestion
vi.mock("@/lib/ai/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/gemini")>();
  return {
    ...actual,
    geminiProvider: {
      ...actual.geminiProvider,
      embed: vi.fn(async () => new Array(768).fill(0.01)),
    },
  };
});

import {
  GET as getDocumentsRoute,
  POST as uploadDocumentRoute,
} from "@/app/api/workflows/projects/[projectId]/documents/route";
import { DELETE as deleteDocumentRoute } from "@/app/api/workflows/projects/[projectId]/documents/[documentId]/route";
import { prisma } from "@/lib/prisma";
import { MAX_DOCUMENT_FILE_SIZE } from "@/lib/workflow/kb/parser";

const KB_OWNER_1 = "kb-owner1@example.com";
const KB_OWNER_2 = "kb-owner2@example.com";

beforeAll(() => {
  vi.stubEnv("AUTH_OWNER_EMAILS", `${KB_OWNER_1},${KB_OWNER_2}`);
});

describe("Workflow Knowledge Base Route Handlers", () => {
  let project1Id: string;
  let project2Id: string;

  beforeEach(async () => {
    authMock.mockReset();

    await prisma.workflowQuotaUsage.deleteMany({});
    await prisma.projectChunk.deleteMany({
      where: { project: { ownerId: { in: [KB_OWNER_1, KB_OWNER_2] } } },
    });
    await prisma.projectDocument.deleteMany({
      where: { ownerId: { in: [KB_OWNER_1, KB_OWNER_2] } },
    });
    await prisma.workflowProject.deleteMany({
      where: { ownerId: { in: [KB_OWNER_1, KB_OWNER_2] } },
    });

    const p1 = await prisma.workflowProject.create({
      data: { name: "Project One", ownerId: KB_OWNER_1 },
    });
    const p2 = await prisma.workflowProject.create({
      data: { name: "Project Two", ownerId: KB_OWNER_2 },
    });

    project1Id = p1.id;
    project2Id = p2.id;
  });

  describe("GET /api/workflows/projects/[projectId]/documents", () => {
    it("returns 401 when no session is present", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost/api/workflows/projects/p1/documents");
      const res = await getDocumentsRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 404 when project belongs to another owner", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project2Id}/documents`);
      const res = await getDocumentsRoute(req, {
        params: Promise.resolve({ projectId: project2Id }),
      });
      expect(res.status).toBe(404);
    });

    it("returns empty document list when project has no documents", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`);
      const res = await getDocumentsRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.documents).toEqual([]);
    });
  });

  describe("POST /api/workflows/projects/[projectId]/documents", () => {
    it("returns 401 when no session is present", async () => {
      authMock.mockResolvedValue(null);
      const formData = new FormData();
      formData.append("file", new Blob(["# Text"], { type: "text/markdown" }), "doc.md");
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when file is missing from form data", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const formData = new FormData();
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("file is required");
    });

    it("returns 400 when file type is unsupported (e.g. .pdf)", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const formData = new FormData();
      formData.append("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }), "document.pdf");
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Only Markdown (.md) and plain text (.txt)");
    });

    it("returns 400 when file size exceeds 1 MB limit", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const bigBuffer = new Uint8Array(MAX_DOCUMENT_FILE_SIZE + 20);
      const formData = new FormData();
      formData.append("file", new Blob([bigBuffer], { type: "text/plain" }), "big.txt");
      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("exceeds the 1 MB limit");
    });

    it("successfully uploads and chunks a markdown file", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const mdContent = "# Introduction\n\nThis is sample project documentation.\n\n## Architecture\n\nDetails here.";
      const formData = new FormData();
      formData.append("file", new Blob([mdContent], { type: "text/markdown" }), "guide.md");

      const req = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });

      const res = await uploadDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.document.filename).toBe("guide.md");
      expect(data.document.status).toBe("READY");
      expect(data.document.chunksCount).toBe(2);

      // Verify list returns this document
      const listReq = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`);
      const listRes = await getDocumentsRoute(listReq, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      const listData = await listRes.json();
      expect(listData.documents).toHaveLength(1);
      expect(listData.documents[0].chunksCount).toBe(2);
    });
  });

  describe("DELETE /api/workflows/projects/[projectId]/documents/[documentId]", () => {
    it("returns 404 if document does not exist or belongs to another owner", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });
      const req = new NextRequest(
        `http://localhost/api/workflows/projects/${project1Id}/documents/non-existent-doc`,
        { method: "DELETE" }
      );
      const res = await deleteDocumentRoute(req, {
        params: Promise.resolve({ projectId: project1Id, documentId: "non-existent-doc" }),
      });
      expect(res.status).toBe(404);
    });

    it("deletes document and associated chunks", async () => {
      authMock.mockResolvedValue({ user: { email: KB_OWNER_1 } });

      // First upload
      const formData = new FormData();
      formData.append("file", new Blob(["# Section\n\nBody"], { type: "text/markdown" }), "delete-me.md");
      const postReq = new NextRequest(`http://localhost/api/workflows/projects/${project1Id}/documents`, {
        method: "POST",
        body: formData,
      });
      const postRes = await uploadDocumentRoute(postReq, {
        params: Promise.resolve({ projectId: project1Id }),
      });
      const postData = await postRes.json();
      const docId = postData.document.id;

      // Ensure chunks exist
      const chunkCountBefore = await prisma.projectChunk.count({ where: { documentId: docId } });
      expect(chunkCountBefore).toBeGreaterThan(0);

      // Delete
      const deleteReq = new NextRequest(
        `http://localhost/api/workflows/projects/${project1Id}/documents/${docId}`,
        { method: "DELETE" }
      );
      const deleteRes = await deleteDocumentRoute(deleteReq, {
        params: Promise.resolve({ projectId: project1Id, documentId: docId }),
      });
      expect(deleteRes.status).toBe(200);

      // Verify chunks were cascade deleted
      const chunkCountAfter = await prisma.projectChunk.count({ where: { documentId: docId } });
      expect(chunkCountAfter).toBe(0);
    });
  });
});
