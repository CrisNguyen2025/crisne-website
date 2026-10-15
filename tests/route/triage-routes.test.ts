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
    create: vi.fn(),
  },
  roadmapItem: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET as getTriage, POST as createTriage } from "@/app/api/v1/roadmaps/triage/route";
import { POST as generateDraft } from "@/app/api/v1/roadmaps/triage/[id]/generate/route";
import { POST as approveDraft } from "@/app/api/v1/roadmaps/triage/[id]/approve/route";
import { POST as dismissTriage } from "@/app/api/v1/roadmaps/triage/[id]/dismiss/route";
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

  it("GET /api/v1/roadmaps/triage returns triage items list", async () => {
    prismaMock.knowledgeTriage.findMany.mockResolvedValueOnce([mockTriageItem]);

    const res = await getTriage();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("triage-123");
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

  it("POST /api/v1/roadmaps/triage/[id]/approve creates RoadmapItem and updates status to APPROVED", async () => {
    prismaMock.knowledgeTriage.findUnique.mockResolvedValueOnce({
      ...mockTriageItem,
      draftTitle: "Tối ưu hóa pipeline RAG với Reranker",
      draftContent: "Nội dung bài học chuẩn...",
    });
    prismaMock.roadmap.findFirst.mockResolvedValueOnce({
      id: "rm-1",
      layers: [{ id: "l1", order: 1 }],
    });
    prismaMock.roadmapGroup.findFirst.mockResolvedValueOnce({
      id: "group-1",
      layerId: "l1",
      _count: { items: 2 },
    });
    prismaMock.roadmapItem.create.mockResolvedValueOnce({
      id: "item-new",
      title: "Tối ưu hóa pipeline RAG với Reranker",
    });
    prismaMock.knowledgeTriage.update.mockResolvedValueOnce({
      ...mockTriageItem,
      status: "APPROVED",
    });

    const req = new NextRequest("http://localhost/api/v1/roadmaps/triage/triage-123/approve", {
      method: "POST",
      headers: ADMIN_HEADER,
    });

    const res = await approveDraft(req, { params: Promise.resolve({ id: "triage-123" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.triage.status).toBe("APPROVED");
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
});
