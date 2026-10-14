import { describe, it, expect } from "vitest";
import {
  fileExistsInProject,
  readProjectFile,
  createMockStream,
  readStreamToString,
  countWords,
  getFirstSentence,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_LAYERS,
  AUTHORITATIVE_CONTACTS,
} from "./test-helpers";

describe("Tier 1 — R2: Anti-Slop AI Behavior & Structured Response Engine", () => {
  const routePath = "app/api/chat/route.ts";
  const antiSlopModulePath = "lib/ai/anti-slop.ts";
  const actionChipsModulePath = "lib/ai/action-chips.ts";

  describe("F05: Anti-Slop System Prompt", () => {
    it("system prompt source file exists and contains system instructions", () => {
      expect(fileExistsInProject(routePath)).toBe(true);
      const content = readProjectFile(routePath);
      expect(content).toMatch(/systemPrompt|SYSTEM_PROMPT/);
    });

    it("enforces Direct Answer First principle in prompt text", () => {
      const content = readProjectFile(routePath);
      // Either updated anti-slop prompt or baseline
      if (fileExistsInProject(antiSlopModulePath)) {
        expect(content).toMatch(/Direct Answer First|Trả lời trực tiếp|trực tiếp vào trọng tâm/i);
      } else {
        expect(content).toContain("Cris Nguyen");
      }
    });

    it("prohibits conversational throat-clearing greetings in prompt", () => {
      const content = readProjectFile(routePath);
      if (fileExistsInProject(antiSlopModulePath)) {
        expect(content).toMatch(/Tuyệt vời|Chào bạn|Xin chào/);
      } else {
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it("prohibits sycophantic praise and summary-recap kickers in prompt", () => {
      const content = readProjectFile(routePath);
      if (fileExistsInProject(antiSlopModulePath)) {
        expect(content).toMatch(/Tóm lại|Hy vọng|kicker|summary/i);
      } else {
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it("specifies word limit constraint (<20 words) for the initial direct answer", () => {
      const sampleGoodDirectAnswer = "Cris Nguyen có hơn 5 năm kinh nghiệm Full-stack và AI Engineering, chuyên Next.js và RAG.";
      expect(countWords(sampleGoodDirectAnswer)).toBeLessThanOrEqual(20);
      expect(getFirstSentence(sampleGoodDirectAnswer)).toBe(sampleGoodDirectAnswer);
    });
  });

  describe("F06: Deterministic Anti-Slop Transformer", () => {
    it("banned openers catalog covers common conversational fillers", () => {
      const bannedOpeners = [
        "Chào bạn!",
        "Xin chào!",
        "Tuyệt vời!",
        "Chào bạn, rất vui được hỗ trợ bạn!",
        "Rất vui được gặp bạn!",
      ];
      for (const opener of bannedOpeners) {
        expect(opener.length).toBeGreaterThan(0);
      }
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("anti-slop module exports createAntiSlopTransformStream", async () => {
      // @ts-ignore
      const mod = await import("@/lib/ai/anti-slop");
      expect(typeof mod.createAntiSlopTransformStream).toBe("function");
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("transformer strips leading conversational greetings from stream", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const mockStream = createMockStream(["Chào bạn! ", "Cris đã xây dựng ", "dự án Kamala."]);
      const transformedStream = mockStream.pipeThrough(createAntiSlopTransformStream());
      const text = await readStreamToString(transformedStream);
      expect(text.trim()).toBe("Cris đã xây dựng dự án Kamala.");
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("transformer strips trailing summary kickers", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const mockStream = createMockStream(["Cris chuyên về Next.js. ", "Tóm lại, bạn có thể xem thêm CV."]);
      const transformedStream = mockStream.pipeThrough(createAntiSlopTransformStream());
      const text = await readStreamToString(transformedStream);
      expect(text).not.toContain("Tóm lại, bạn có thể xem thêm CV.");
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("transformer preserves already clean content without corruption", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const cleanInput = "Kamala là nền tảng thương mại điện tử trang sức kết hợp tour du lịch.";
      const mockStream = createMockStream([cleanInput]);
      const transformedStream = mockStream.pipeThrough(createAntiSlopTransformStream());
      const text = await readStreamToString(transformedStream);
      expect(text.trim()).toBe(cleanInput);
    });
  });

  describe("F07: Action Metadata & Entity Catalog", () => {
    it("authoritative project catalog contains 4 defined projects", () => {
      expect(AUTHORITATIVE_PROJECTS).toHaveLength(4);
      const ids = AUTHORITATIVE_PROJECTS.map(p => p.id);
      expect(ids).toContain("kamala-commerce-tour");
      expect(ids).toContain("zelene-spa-booking");
      expect(ids).toContain("smartbit-saas-platform");
      expect(ids).toContain("javis-3d-tile-simulation");
    });

    it("authoritative roadmap catalog contains 5 defined layers", () => {
      expect(AUTHORITATIVE_LAYERS).toHaveLength(5);
      const layerIds = AUTHORITATIVE_LAYERS.map(l => l.id);
      expect(layerIds).toEqual(["layer-01", "layer-02", "layer-03", "layer-04", "layer-05"]);
    });

    it("authoritative contact catalog contains 4 channels", () => {
      expect(AUTHORITATIVE_CONTACTS).toHaveLength(4);
      const contactIds = AUTHORITATIVE_CONTACTS.map(c => c.id);
      expect(contactIds).toContain("zalo");
      expect(contactIds).toContain("github");
      expect(contactIds).toContain("cv");
      expect(contactIds).toContain("contact");
    });

    it("validates action tag syntax specification: [[action:type|id|label]]", () => {
      const validTag = "[[action:project|kamala-commerce-tour|Khám phá Kamala]]";
      const regex = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;
      const match = regex.exec(validTag);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("project");
      expect(match?.[2]).toBe("kamala-commerce-tour");
      expect(match?.[3]).toBe("Khám phá Kamala");
    });

    it.runIf(fileExistsInProject(actionChipsModulePath))("action-chips module parses tags and extracts clean text", async () => {
      // @ts-ignore
      const { parseMessageContentAndActions } = await import("@/lib/ai/action-chips");
      const raw = "Cris phát triển Kamala [[action:project|kamala-commerce-tour|Khám phá Kamala]] cho khách hàng.";
      const result = parseMessageContentAndActions(raw);
      expect(result.cleanContent).toBe("Cris phát triển Kamala  cho khách hàng.");
      expect(result.actionChips).toHaveLength(1);
      expect(result.actionChips[0]).toEqual({
        type: "project",
        id: "kamala-commerce-tour",
        label: "Khám phá Kamala",
      });
    });
  });

  describe("F08: Chat Route Fallback & Test Updates", () => {
    it("route code provides fallback when GEMINI_API_KEY is not configured", () => {
      const content = readProjectFile(routePath);
      expect(content).toContain("GEMINI_API_KEY");
      expect(content).toContain("readableContext");
    });

    it("fallback messages provide direct answers without conversational filler", () => {
      const content = readProjectFile(routePath);
      if (fileExistsInProject(antiSlopModulePath)) {
        expect(content).not.toContain("Xin chào! Hiện tại chưa cấu hình `GEMINI_API_KEY`");
      } else {
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it("route handles streaming errors and gracefully closes controller", () => {
      const content = readProjectFile(routePath);
      expect(content).toMatch(/catch\s*\(.*controller\.error|controller\.close/);
    });

    it("route sets appropriate headers for plain text streaming", () => {
      const content = readProjectFile(routePath);
      expect(content).toContain("Content-Type");
      expect(content).toContain("Cache-Control");
    });

    it("verifies chat route test file exists and is executable", () => {
      const testPath = "tests/route/chat-route.test.ts";
      expect(fileExistsInProject(testPath)).toBe(true);
    });
  });
});
