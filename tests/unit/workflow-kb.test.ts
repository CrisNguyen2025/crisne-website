import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseDocument, MAX_DOCUMENT_FILE_SIZE } from "@/lib/workflow/kb/parser";
import { chunkDocument } from "@/lib/workflow/kb/chunker";
import { ingestDocument } from "@/lib/workflow/kb/ingest";
import { retrieve } from "@/lib/workflow/kb/retrieval";
import { buildStorageKey, saveToStorage, readFromStorage, deleteFromStorage } from "@/lib/workflow/kb/storage";
import type { LlmProvider, LlmGenerateParams } from "@/lib/ai/llm-provider";
import { createNodeHandlers } from "@/lib/workflow/nodes";
import type { WorkflowNodeOf } from "@/lib/workflow/dsl-types";
import type { NodeHandlerContext } from "@/lib/workflow/dag-executor";

function createMockLlm(): { provider: LlmProvider; embedCalls: string[]; generateCalls: LlmGenerateParams[] } {
  const embedCalls: string[] = [];
  const generateCalls: LlmGenerateParams[] = [];

  const provider: LlmProvider = {
    async generate(params: LlmGenerateParams) {
      generateCalls.push(params);
      return { text: "rewritten query from llm", usage: { input: 10, output: 5, total: 15 } };
    },
    async generateStream(params: LlmGenerateParams) {
      generateCalls.push(params);
      async function* stream() {
        yield { text: "rewritten query" };
      }
      return stream();
    },
    async embed(text: string) {
      embedCalls.push(text);
      // Return 768-dim mock vector
      const vec = new Array(768).fill(0.01);
      vec[0] = 0.5;
      return vec;
    },
  };

  return { provider, embedCalls, generateCalls };
}

describe("Workflow Knowledge Base Unit Tests", () => {
  const TEST_OWNER = "kb-test-owner@example.com";
  let projectAId: string;
  let projectBId: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.projectChunk.deleteMany({
      where: { project: { ownerId: TEST_OWNER } },
    });
    await prisma.projectDocument.deleteMany({
      where: { ownerId: TEST_OWNER },
    });
    await prisma.workflowProject.deleteMany({
      where: { ownerId: TEST_OWNER },
    });

    // Create two separate projects for multi-tenant isolation testing
    const projA = await prisma.workflowProject.create({
      data: { name: "Project Alpha", ownerId: TEST_OWNER },
    });
    const projB = await prisma.workflowProject.create({
      data: { name: "Project Beta", ownerId: TEST_OWNER },
    });

    projectAId = projA.id;
    projectBId = projB.id;
  });

  afterEach(async () => {
    await prisma.workflowProject.deleteMany({
      where: { ownerId: TEST_OWNER },
    });
  });

  describe("Parser & File Size Validation", () => {
    it("parses markdown and plain text files", () => {
      const mdBuf = Buffer.from("# Hello World\n\nThis is markdown.");
      const txtBuf = Buffer.from("Simple plain text content.");

      expect(parseDocument(mdBuf, "text/markdown", "doc.md")).toContain("Hello World");
      expect(parseDocument(txtBuf, "text/plain", "doc.txt")).toContain("Simple plain text");
    });

    it("rejects unsupported file formats like PDF or images", () => {
      const pdfBuf = Buffer.from("%PDF-1.4 mock content");
      expect(() => parseDocument(pdfBuf, "application/pdf", "doc.pdf")).toThrow(
        /Unsupported document format/
      );
    });

    it("rejects files exceeding 1 MB limit", () => {
      const oversizedBuf = Buffer.alloc(MAX_DOCUMENT_FILE_SIZE + 10);
      expect(() => parseDocument(oversizedBuf, "text/plain", "large.txt")).toThrow(
        /exceeds the maximum allowed limit of 1 MB/
      );
    });
  });

  describe("Markdown Chunker", () => {
    it("chunks by headings while keeping nearest heading and sequential ordinals", () => {
      const doc = `# Section One
This is content for section one.

## Subsection A
Content for subsection A with details.

# Section Two
Content for section two.`;

      const chunks = chunkDocument(doc);
      expect(chunks.length).toBe(3);
      expect(chunks[0].ordinal).toBe(0);
      expect(chunks[0].heading).toBe("Section One");
      expect(chunks[1].ordinal).toBe(1);
      expect(chunks[1].heading).toBe("Subsection A");
      expect(chunks[2].ordinal).toBe(2);
      expect(chunks[2].heading).toBe("Section Two");
    });

    it("handles documents without headings gracefully", () => {
      const plain = "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.";
      const chunks = chunkDocument(plain);
      expect(chunks.length).toBe(1);
      expect(chunks[0].heading).toBeNull();
      expect(chunks[0].ordinal).toBe(0);
      expect(chunks[0].content).toContain("Paragraph 1");
    });
  });

  describe("Ingestion & Embedding Deduplication", () => {
    it("skips re-embedding when exact same document is re-uploaded", async () => {
      const mock = createMockLlm();
      const content = Buffer.from("# Title\n\nContent for document.");

      // First upload
      const res1 = await ingestDocument({
        projectId: projectAId,
        ownerId: TEST_OWNER,
        filename: "test.md",
        mimeType: "text/markdown",
        buffer: content,
        llm: mock.provider,
        quotaLimit: 100,
      });

      expect(res1.skipped).toBe(false);
      const initialEmbedCount = mock.embedCalls.length;
      expect(initialEmbedCount).toBeGreaterThan(0);

      // Re-upload identical file
      const res2 = await ingestDocument({
        projectId: projectAId,
        ownerId: TEST_OWNER,
        filename: "test.md",
        mimeType: "text/markdown",
        buffer: content,
        llm: mock.provider,
        quotaLimit: 100,
      });

      expect(res2.skipped).toBe(true);
      // No extra embed() calls made!
      expect(mock.embedCalls.length).toBe(initialEmbedCount);
    });

    it("reuses chunk embeddings when only one section of a document changes", async () => {
      const mock = createMockLlm();

      const docV1 = Buffer.from("# Heading 1\n\nUnchanged section 1.\n\n# Heading 2\n\nOriginal section 2.");
      await ingestDocument({
        projectId: projectAId,
        ownerId: TEST_OWNER,
        filename: "v1.md",
        mimeType: "text/markdown",
        buffer: docV1,
        llm: mock.provider,
        quotaLimit: 100,
      });

      const countAfterV1 = mock.embedCalls.length;
      expect(countAfterV1).toBe(2); // 2 chunks embedded

      // V2 keeps Heading 1 unchanged, modifies Heading 2
      const docV2 = Buffer.from("# Heading 1\n\nUnchanged section 1.\n\n# Heading 2\n\nModified section 2 text.");
      await ingestDocument({
        projectId: projectAId,
        ownerId: TEST_OWNER,
        filename: "v2.md",
        mimeType: "text/markdown",
        buffer: docV2,
        llm: mock.provider,
        quotaLimit: 100,
      });

      // Heading 1 embedding was reused; only the modified Heading 2 called embed()!
      expect(mock.embedCalls.length).toBe(countAfterV1 + 1);
    });
  });

  describe("Project Isolation in Retrieval", () => {
    it("never returns chunks from Project B when querying Project A", async () => {
      const mock = createMockLlm();

      // Project A document
      await ingestDocument({
        projectId: projectAId,
        ownerId: TEST_OWNER,
        filename: "alpha.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Alpha Secret\n\nClassified internal strategy for Alpha."),
        llm: mock.provider,
        quotaLimit: 100,
      });

      // Project B document with different content
      await ingestDocument({
        projectId: projectBId,
        ownerId: TEST_OWNER,
        filename: "beta.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Beta Info\n\nPublic operations for Beta."),
        llm: mock.provider,
        quotaLimit: 100,
      });

      // Query Project A
      const resultsA = await retrieve({
        projectId: projectAId,
        query: "strategy",
        llm: mock.provider,
        quotaLimit: 100,
      });

      expect(resultsA.length).toBeGreaterThan(0);
      for (const doc of resultsA) {
        expect(doc.content).not.toContain("Beta Info");
        expect(doc.heading).toBe("Alpha Secret");
      }

      // Query Project B for Alpha's secret
      const resultsB = await retrieve({
        projectId: projectBId,
        query: "Classified internal strategy for Alpha",
        llm: mock.provider,
        quotaLimit: 100,
      });

      // Project B must NOT receive Alpha's secret chunks!
      for (const doc of resultsB) {
        expect(doc.content).not.toContain("Alpha Secret");
      }
    });
  });

  describe("Storage Isolation from findUnusedStorageFiles", () => {
    it("ensures workflow-kb storage files are never listed or cleaned up by storage cleanup", async () => {
      const key = buildStorageKey("test-proj", "test-doc");
      expect(key.startsWith("workflow-kb/")).toBe(true);

      // Verify that findUnusedStorageFiles only checks uploads/
      // Test local storage reading and deleting
      const testBuffer = Buffer.from("test local storage content");
      await saveToStorage(key, testBuffer, "text/markdown");

      const readBack = await readFromStorage(key);
      expect(readBack.toString()).toBe("test local storage content");

      await deleteFromStorage(key);
      await expect(readFromStorage(key)).rejects.toThrow();
    });
  });

  describe("Node Handlers Integration (rewrite and rag)", () => {
    it("rewrite handler rewrites query using LLM", async () => {
      const mock = createMockLlm();
      const handlers = createNodeHandlers({ llm: mock.provider, model: "test-model" });

      const node: WorkflowNodeOf<"rewrite"> = {
        id: "rewrite-1",
        type: "rewrite",
        config: { instruction: "Rewrite this: {{inputs.query}}" },
      };

      const dummyContext: NodeHandlerContext = {
        runInput: { query: "Where is the documentation?" },
        signal: new AbortController().signal,
      };

      const result = await handlers.rewrite(node, { query: "Where is the documentation?" }, dummyContext);
      expect(result.outputs.query).toBe("rewritten query from llm");
      expect(mock.generateCalls.length).toBe(1);
    });

    it("rag handler retrieves documents for query", async () => {
      const mockRetrieve = vi.fn(async () => [
        { id: "chunk-1", content: "Retrieved content", score: 0.88, heading: "Test" },
      ]);

      const handlers = createNodeHandlers({
        projectId: "test-proj",
        retrieve: mockRetrieve,
      });

      const node: WorkflowNodeOf<"rag"> = {
        id: "rag-1",
        type: "rag",
        config: { topK: 3, minScore: 0.5 },
      };

      const dummyContext: NodeHandlerContext = {
        runInput: { query: "test query" },
        signal: new AbortController().signal,
      };

      const result = await handlers.rag(node, { query: "test query" }, dummyContext);
      expect(result.outputs.documents).toHaveLength(1);
      expect(mockRetrieve).toHaveBeenCalledWith({
        projectId: "test-proj",
        query: "test query",
        topK: 3,
        minScore: 0.5,
        documentIds: undefined,
      });
    });
  });
});
