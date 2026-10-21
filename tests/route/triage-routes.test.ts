import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

// Prisma mock
const mockTriageItem = {
  id: "triage-123",
  query: "Cách tối ưu hóa pipeline RAG với reranker?",
  assistantMsg: "Bạn chỉ cần thêm cross-encoder...",
  reason: "Ảo giác / Sai kiến thức",
  comment: "Thiếu hướng dẫn Cohere / BGE reranker",
  status: "PENDING",
  roadmapSlug: "ai-architecture",
  layerId: "layer-1",
  layerTag: "01-CORE",
  level: "core",
  draftTitle: null,
  draftContent: null,
  verifyScore: null,
  verifyNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const prismaMock = vi.hoisted(() => ({
  knowledgeTriage: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  roadmap: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  roadmapLayer: {
    findFirst: vi.fn(),
  },
  roadmapGroup: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  roadmapItem: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  // Interactive transaction: run the callback against the same mock
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// Langfuse holds the 👎 votes the import reads; no network in tests
const langfuseMock = vi.hoisted(() => ({ listDownvotedTraces: vi.fn(), getReviewStatus: vi.fn() }));
vi.mock("@/lib/ai/langfuse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/langfuse")>()),
  ...langfuseMock,
}));
prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));

import { GET as getTriage, POST as createTriage } from "@/app/api/v1/roadmaps/triage/route";
import { POST as generateDraft } from "@/app/api/v1/roadmaps/triage/[id]/generate/route";
import { POST as approveDraft } from "@/app/api/v1/roadmaps/triage/[id]/approve/route";
import { POST as dismissTriage } from "@/app/api/v1/roadmaps/triage/[id]/dismiss/route";
import { DELETE as deleteTriage } from "@/app/api/v1/roadmaps/triage/[id]/route";
import { POST as importTriage } from "@/app/api/v1/roadmaps/triage/import/route";
import { GET as getGoldenSet } from "@/app/api/v1/roadmaps/triage/golden-set/route";
import { setLlmProvider, type LlmProvider } from "@/lib/ai/llm-provider";
import { DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from "@/lib/ai/gemini";
import { resetLlmCircuitBreaker } from "@/lib/ai/llm-circuit-breaker";

// Scripted LLM for every provider; no network, no quota
const llm = {
  generate: vi.fn<LlmProvider["generate"]>(),
  generateStream: vi.fn(),
  embed: vi.fn(),
} satisfies LlmProvider;
const quotaError = () => Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });

const ADMIN_HEADER = {
  "Content-Type": "application/json",
  "x-admin-key": "machine-key",
};

describe("Knowledge Triage API Routes", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_API_KEY", "machine-key");
    authMock.mockResolvedValue(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const listRequest = (headers: HeadersInit = ADMIN_HEADER) =>
    new NextRequest("http://localhost/api/v1/roadmaps/triage", { headers });

  it("GET /api/v1/roadmaps/triage returns triage items list", async () => {
    prismaMock.knowledgeTriage.findMany.mockResolvedValueOnce([mockTriageItem]);

    const res = await getTriage(listRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("triage-123");
  });

  it("GET /api/v1/roadmaps/triage rejects visitors: items hold their questions and comments", async () => {
    const res = await getTriage(listRequest({}));

    expect(res.status).toBe(401);
    expect(prismaMock.knowledgeTriage.findMany).not.toHaveBeenCalled();
  });

  it("GET /api/v1/roadmaps/triage never writes, even when the list is empty", async () => {
    prismaMock.knowledgeTriage.findMany.mockResolvedValueOnce([]);

    const res = await getTriage(listRequest());
    expect((await res.json()).items).toEqual([]);
    expect(prismaMock.knowledgeTriage.create).not.toHaveBeenCalled();
  });

  it("POST /api/v1/roadmaps/triage masks emails and phone numbers before saving", async () => {
    prismaMock.knowledgeTriage.create.mockResolvedValueOnce({ ...mockTriageItem, id: "triage-pii" });

    await createTriage(
      new NextRequest("http://localhost/api/v1/roadmaps/triage", {
        method: "POST",
        headers: ADMIN_HEADER,
        body: JSON.stringify({ query: "Liên hệ a.b@gmail.com", comment: "Gọi 0912 345 678 nhé" }),
      })
    );

    expect(prismaMock.knowledgeTriage.create.mock.calls[0][0].data).toMatchObject({
      query: "Liên hệ [email]",
      comment: "Gọi [phone] nhé",
    });
  });

  it("POST /api/v1/roadmaps/triage creates a new triage record", async () => {
    prismaMock.knowledgeTriage.create.mockResolvedValueOnce({
      ...mockTriageItem,
      id: "triage-new",
    });

    const req = new NextRequest("http://localhost/api/v1/roadmaps/triage", {
      method: "POST",
      headers: ADMIN_HEADER,
      body: JSON.stringify({
        query: "Làm sao cấu hình GPU cluster cho Ray?",
        reason: "Lỗi cú pháp / Lộ trình hỏng",
        comment: "Thiếu ray-operator yaml",
      }),
    });

    const res = await createTriage(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.item.id).toBe("triage-new");
  });

  it("POST /api/v1/roadmaps/triage/[id]/generate generates draft and verify score", async () => {
    prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce(mockTriageItem);
    prismaMock.roadmap.findMany.mockResolvedValueOnce([
      {
        slug: "ai-architecture",
        layers: [{ id: "l1", shortTag: "01-CORE", order: 1 }],
      },
    ]);
    prismaMock.knowledgeTriage.update.mockResolvedValueOnce({
      ...mockTriageItem,
      status: "DRAFTED",
      draftTitle: "Thực hành: Cách tối ưu hóa pipeline RAG với reranker",
      draftContent: "## Tổng quan...",
      verifyScore: 95,
      verifyNote: "✓ Agent Admin xác nhận...",
    });

    const req = new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123/generate", {
      method: "POST",
      headers: ADMIN_HEADER,
    });

    const res = await generateDraft(req, { params: Promise.resolve({ id: "triage-123" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.item.status).toBe("DRAFTED");
    expect(data.item.verifyScore).toBe(95);
  });

  // The LLM path only runs when the active provider has an API key
  describe("generate — LLM draft", () => {
    const generateRequest = () =>
      generateDraft(
        new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123/generate", {
          method: "POST",
          headers: ADMIN_HEADER,
        }),
        { params: Promise.resolve({ id: "triage-123" }) }
      );

    const savedData = () => prismaMock.knowledgeTriage.update.mock.calls[0][0].data;
    const BUILT_IN_TITLE = "Thực hành: Cách tối ưu hóa pipeline RAG với reranker";

    beforeEach(() => {
      vi.stubEnv("LLM_PROVIDER", "");
      vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
      resetLlmCircuitBreaker();
      llm.generate.mockReset();
      setLlmProvider(llm);
      prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce(mockTriageItem);
      prismaMock.roadmap.findMany.mockResolvedValueOnce([
        { slug: "ai-architecture", layers: [{ id: "l1", shortTag: "01-CORE", order: 1 }] },
      ]);
      prismaMock.knowledgeTriage.update.mockImplementationOnce(async ({ data }) => ({ ...mockTriageItem, ...data }));
    });

    afterEach(() => setLlmProvider(null));

    it("returns 409 for an approved item instead of moving it back to DRAFTED", async () => {
      prismaMock.knowledgeTriage.findUnique.mockReset();
      prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce({ ...mockTriageItem, status: "APPROVED" });

      const res = await generateRequest();

      expect(res.status).toBe(409);
      expect(llm.generate).not.toHaveBeenCalled();
      expect(prismaMock.knowledgeTriage.update).not.toHaveBeenCalled();
    });

    it("asks the primary chat model for JSON and saves the parsed draft", async () => {
      llm.generate.mockResolvedValueOnce({
        text: '```json\n{"title":"Reranker cho RAG","content":"## Nội dung LLM"}\n```',
      });

      const res = await generateRequest();
      expect(res.status).toBe(200);

      expect(llm.generate).toHaveBeenCalledTimes(1);
      expect(llm.generate.mock.calls[0][0]).toMatchObject({
        model: DEFAULT_CHAT_MODEL,
        temperature: 0.3,
        maxOutputTokens: 1200,
        responseFormat: "json",
        contents: [{ role: "user", parts: [{ text: expect.stringContaining(mockTriageItem.query) }] }],
      });
      expect(savedData()).toMatchObject({
        status: "DRAFTED",
        draftTitle: "Reranker cho RAG",
        draftContent: "## Nội dung LLM",
        verifyNote: expect.stringMatching(/^✓ Agent Admin xác nhận/),
      });
    });

    it("falls back to the next model when the primary is out of quota", async () => {
      llm.generate
        .mockRejectedValueOnce(quotaError())
        .mockResolvedValueOnce({ text: JSON.stringify({ title: "Reranker", content: "## Từ model dự phòng" }) });

      await generateRequest();

      expect(llm.generate.mock.calls.map(([p]) => p.model)).toEqual([DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL]);
      expect(savedData().draftContent).toBe("## Từ model dự phòng");
    });

    it("keeps code fences inside the generated lesson content", async () => {
      const content = "## Cấu hình\n```yaml\nkey: value\n```";
      llm.generate.mockResolvedValueOnce({ text: JSON.stringify({ title: "Reranker cho RAG", content }) });

      await generateRequest();
      expect(savedData().draftContent).toBe(content);
    });

    it("uses the built-in draft and says so when the JSON has the wrong shape", async () => {
      llm.generate.mockResolvedValueOnce({ text: '{"title":5,"content":["x"]}' });

      await generateRequest();
      // Invalid JSON is not retried on another model
      expect(llm.generate).toHaveBeenCalledTimes(1);
      expect(savedData()).toMatchObject({
        draftTitle: BUILT_IN_TITLE,
        draftContent: expect.stringMatching(/^## Tổng quan/),
        verifyNote: expect.stringContaining("LLM trả về JSON không hợp lệ"),
      });
    });

    it("uses the built-in draft and says so when the answer is not JSON", async () => {
      llm.generate.mockResolvedValueOnce({ text: "không phải JSON" });

      const res = await generateRequest();
      expect(res.status).toBe(200);
      expect(savedData()).toMatchObject({
        draftTitle: BUILT_IN_TITLE,
        draftContent: expect.stringMatching(/^## Tổng quan/),
        verifyNote: expect.stringMatching(/^⚠ Bản nháp dựng sẵn \(LLM trả về JSON không hợp lệ\)/),
      });
    });

    it("uses the built-in draft and names the error when every model fails", async () => {
      llm.generate.mockRejectedValue(quotaError());

      const res = await generateRequest();
      expect(res.status).toBe(200);
      expect(llm.generate).toHaveBeenCalledTimes(2);
      expect(savedData()).toMatchObject({
        draftContent: expect.stringMatching(/^## Tổng quan/),
        verifyNote: expect.stringContaining("LLM lỗi: quota"),
      });
    });

    it("skips the LLM and says why when no API key is configured", async () => {
      vi.stubEnv("GEMINI_API_KEY", "");

      await generateRequest();
      expect(llm.generate).not.toHaveBeenCalled();
      expect(savedData().verifyNote).toContain("chưa cấu hình LLM API key");
    });
  });

  describe("approve", () => {
    const approveRequest = () =>
      approveDraft(
        new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123/approve", {
          method: "POST",
          headers: ADMIN_HEADER,
        }),
        { params: Promise.resolve({ id: "triage-123" }) }
      );

    const draftedItem = (draftContent: string) => ({
      ...mockTriageItem,
      status: "DRAFTED",
      draftTitle: "Tối ưu hóa pipeline RAG với Reranker",
      draftContent,
    });

    beforeEach(() => {
      prismaMock.roadmapGroup.findMany.mockResolvedValueOnce([
        { id: "group-1", layerId: "l1", level: "core", _count: { items: 2 } },
      ]);
      prismaMock.roadmapItem.create.mockImplementationOnce(async ({ data }) => ({ id: "item-new", ...data }));
    });

    it("claims the drafted item and creates the RoadmapItem in one transaction", async () => {
      prismaMock.knowledgeTriage.findUnique
        .mockResolvedValueOnce(draftedItem("Nội dung bài học chuẩn..."))
        .mockResolvedValueOnce({ ...mockTriageItem, status: "APPROVED" });
      prismaMock.knowledgeTriage.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await approveRequest();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.triage.status).toBe("APPROVED");

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.knowledgeTriage.updateMany).toHaveBeenCalledWith({
        where: { id: "triage-123", status: "DRAFTED" },
        data: { status: "APPROVED" },
      });
      expect(prismaMock.roadmapItem.create.mock.calls[0][0].data).toMatchObject({ groupId: "group-1", order: 3 });
    });

    it("returns 409 and keeps the draft when the layer already has a lesson with that title", async () => {
      prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce(draftedItem("Nội dung"));
      prismaMock.roadmapItem.findMany.mockResolvedValueOnce([
        { id: "item-old", title: "  tối ưu hóa pipeline RAG với reranker " },
      ]);

      const res = await approveRequest();

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "DUPLICATE", kind: "item", existing: { id: "item-old" } });
      expect(prismaMock.knowledgeTriage.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.roadmapItem.create).not.toHaveBeenCalled();
    });

    it("returns 409 and creates nothing when the item was already approved (double click, retry)", async () => {
      prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce(draftedItem("Nội dung"));
      prismaMock.knowledgeTriage.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await approveRequest();

      expect(res.status).toBe(409);
      expect(prismaMock.roadmapItem.create).not.toHaveBeenCalled();
    });

    it("publishes a description from the draft, never the visitor's comment", async () => {
      prismaMock.knowledgeTriage.findUnique
        .mockResolvedValueOnce(draftItemWithComment())
        .mockResolvedValueOnce({ ...mockTriageItem, status: "APPROVED" });
      prismaMock.knowledgeTriage.updateMany.mockResolvedValueOnce({ count: 1 });

      await approveRequest();

      const { description } = prismaMock.roadmapItem.create.mock.calls[0][0].data;
      expect(description).toBe("Reranker sắp xếp lại các chunk đã truy xuất.");
      expect(description).not.toContain(mockTriageItem.comment);
    });

    it("stores the draft as sanitized HTML: Markdown rendered, scripts and javascript: links dropped", async () => {
      prismaMock.knowledgeTriage.findUnique
        .mockResolvedValueOnce(
          draftedItem(
            "## Cấu hình\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n```cpp\nstd::vector<int> v;\n```"
          )
        )
        .mockResolvedValueOnce({ ...mockTriageItem, status: "APPROVED" });
      prismaMock.knowledgeTriage.updateMany.mockResolvedValueOnce({ count: 1 });

      await approveRequest();

      const { content } = prismaMock.roadmapItem.create.mock.calls[0][0].data;
      expect(content).toContain("<h2>Cấu hình</h2>");
      expect(content).toContain("std::vector&lt;int&gt; v;");
      expect(content).not.toMatch(/<script|alert\(1\)|javascript:/i);
    });

    function draftItemWithComment() {
      return {
        ...draftedItem("## Tổng quan\n\nReranker sắp xếp lại các chunk đã truy xuất.\n\nĐoạn hai"),
        comment: "Email tôi là a.b@gmail.com",
      };
    }
  });

  it("POST /api/v1/roadmaps/triage/[id]/dismiss marks item as DISMISSED", async () => {
    prismaMock.knowledgeTriage.update.mockResolvedValueOnce({
      ...mockTriageItem,
      status: "DISMISSED",
    });

    const req = new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123/dismiss", {
      method: "POST",
      headers: ADMIN_HEADER,
    });

    const res = await dismissTriage(req, { params: Promise.resolve({ id: "triage-123" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.item.status).toBe("DISMISSED");
  });

  describe("DELETE /api/v1/roadmaps/triage/[id]", () => {
    const deleteRequest = (headers: HeadersInit = ADMIN_HEADER) =>
      new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123", {
        method: "DELETE",
        headers,
      });
    const params = { params: Promise.resolve({ id: "triage-123" }) };

    it("deletes only items still in process", async () => {
      prismaMock.knowledgeTriage.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await deleteTriage(deleteRequest(), params);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, id: "triage-123" });
      expect(prismaMock.knowledgeTriage.deleteMany).toHaveBeenCalledWith({
        where: { id: "triage-123", status: { in: ["PENDING", "DRAFTED"] } },
      });
    });

    it("returns 404 for an approved or missing item", async () => {
      prismaMock.knowledgeTriage.deleteMany.mockResolvedValueOnce({ count: 0 });

      const res = await deleteTriage(deleteRequest(), params);
      expect(res.status).toBe(404);
    });

    it("rejects visitors", async () => {
      const res = await deleteTriage(deleteRequest({}), params);
      expect(res.status).toBe(401);
      expect(prismaMock.knowledgeTriage.deleteMany).not.toHaveBeenCalled();
    });
  });
  describe("POST /api/v1/roadmaps/triage/import", () => {
    const importRequest = (headers: HeadersInit = ADMIN_HEADER) =>
      new NextRequest("http://localhost/api/v1/roadmaps/triage/import", { method: "POST", headers });

    it("creates a PENDING item per new 👎, skipping traces already imported", async () => {
      prismaMock.knowledgeTriage.findMany.mockResolvedValueOnce([{ traceId: "trace-old" }]);
      langfuseMock.listDownvotedTraces.mockResolvedValueOnce({
        traces: [
          {
            traceId: "trace-new",
            input: { message: "Reranker là gì? mail a.b@gmail.com", page_context: { roadmapSlug: "llm-ops" } },
            output: "Reranker sắp xếp lại kết quả.",
            reason: "Lạc đề / Chưa đúng trọng tâm",
            comment: "Thiếu ví dụ",
          },
          // No question to turn into a lesson
          { traceId: "trace-empty", input: { page_context: null }, output: "" },
        ],
        remaining: 3,
      });

      const res = await importTriage(importRequest());

      expect(await res.json()).toEqual({ imported: 1, remaining: 3 });
      expect(langfuseMock.listDownvotedTraces.mock.calls[0][0]).toMatchObject({
        source: "roadmap-assistant",
        skip: new Set(["trace-old"]),
      });
      expect(prismaMock.knowledgeTriage.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.knowledgeTriage.create.mock.calls[0][0].data).toMatchObject({
        traceId: "trace-new",
        query: "Reranker là gì? mail [email]",
        assistantMsg: "Reranker sắp xếp lại kết quả.",
        reason: "Lạc đề / Chưa đúng trọng tâm",
        comment: "Thiếu ví dụ",
        roadmapSlug: "llm-ops",
        status: "PENDING",
      });
    });

    it("rejects visitors before reading Langfuse", async () => {
      const res = await importTriage(importRequest({}));

      expect(res.status).toBe(401);
      expect(langfuseMock.listDownvotedTraces).not.toHaveBeenCalled();
    });

    it("reports a Langfuse failure without creating items", async () => {
      prismaMock.knowledgeTriage.findMany.mockResolvedValueOnce([]);
      langfuseMock.listDownvotedTraces.mockRejectedValueOnce(new Error("Langfuse is not configured"));

      const res = await importTriage(importRequest());

      expect(res.status).toBe(500);
      expect(prismaMock.knowledgeTriage.create).not.toHaveBeenCalled();
    });
  });
  describe("GET /api/v1/roadmaps/triage/golden-set", () => {
    const statusRequest = (headers: HeadersInit = ADMIN_HEADER) =>
      new NextRequest("http://localhost/api/v1/roadmaps/triage/golden-set", { headers });

    it("returns the committed golden set next to the live Langfuse numbers", async () => {
      langfuseMock.getReviewStatus.mockResolvedValueOnce({ datasetItems: 3, queuePending: 2, queueUrl: "https://lf/q" });

      const data = await (await getGoldenSet(statusRequest())).json();

      expect(langfuseMock.getReviewStatus).toHaveBeenCalledWith("cris-ai-golden-set");
      expect(data).toMatchObject({ dataset: "cris-ai-golden-set", datasetItems: 3, queuePending: 2, queueUrl: "https://lf/q" });
      expect(data).toHaveProperty("sync");
    });

    it("still answers with the committed part when Langfuse fails", async () => {
      langfuseMock.getReviewStatus.mockRejectedValueOnce(new Error("Langfuse is not configured"));

      const res = await getGoldenSet(statusRequest());

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ dataset: "cris-ai-golden-set", error: "Langfuse is not configured" });
    });

    it("rejects visitors", async () => {
      expect((await getGoldenSet(statusRequest({}))).status).toBe(401);
      expect(langfuseMock.getReviewStatus).not.toHaveBeenCalled();
    });
  });
});
