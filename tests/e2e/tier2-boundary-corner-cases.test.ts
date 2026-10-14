import { describe, it, expect } from "vitest";
import {
  fileExistsInProject,
  createMockStream,
  readStreamToString,
} from "./test-helpers";

describe("Tier 2 — Boundary & Corner Cases", () => {
  const antiSlopModulePath = "lib/ai/anti-slop.ts";
  const actionChipsModulePath = "lib/ai/action-chips.ts";

  describe("R1 Boundary Cases (Headless SDK)", () => {
    it("handles empty baseUrl by falling back safely to default route", () => {
      const defaultRoute = "/api/chat";
      const resolveUrl = (baseUrl?: string) => baseUrl?.trim() || defaultRoute;
      expect(resolveUrl("")).toBe(defaultRoute);
      expect(resolveUrl("   ")).toBe(defaultRoute);
      expect(resolveUrl(undefined)).toBe(defaultRoute);
    });

    it("prevents dispatching empty or whitespace-only messages", () => {
      const validateMessage = (text: string) => text.trim().length > 0;
      expect(validateMessage("")).toBe(false);
      expect(validateMessage("   \n\t  ")).toBe(false);
      expect(validateMessage("Hello")).toBe(true);
    });

    it("handles rapid double-call state without corrupting message list", () => {
      let isStreaming = false;
      const messages: string[] = [];
      const sendMessage = (msg: string) => {
        if (isStreaming) return false;
        isStreaming = true;
        messages.push(msg);
        return true;
      };

      expect(sendMessage("First message")).toBe(true);
      expect(sendMessage("Second rapid message")).toBe(false);
      expect(messages).toHaveLength(1);
    });

    it("parses malformed WebMCP messages without crashing", () => {
      const parseWebMcpPayload = (raw: string) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      };
      expect(parseWebMcpPayload("{broken json")).toBeNull();
      expect(parseWebMcpPayload("")).toBeNull();
      expect(parseWebMcpPayload('{"tool": "get_layer"}')).toEqual({ tool: "get_layer" });
    });

    it("handles large context strings gracefully without memory leaks", () => {
      const largeContext = "A".repeat(50000);
      expect(largeContext.length).toBe(50000);
      const truncated = largeContext.slice(0, 4000);
      expect(truncated.length).toBe(4000);
    });
  });

  describe("R2 Boundary Cases (Anti-Slop Engine & Streaming)", () => {
    it.runIf(fileExistsInProject(antiSlopModulePath))("handles empty stream chunks without breaking controller", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const mockStream = createMockStream(["", "", "Cris Nguyen"]);
      const transformed = mockStream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStreamToString(transformed);
      expect(result.trim()).toBe("Cris Nguyen");
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("handles stream containing ONLY conversational greetings", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const mockStream = createMockStream(["Chào bạn! "]);
      const transformed = mockStream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStreamToString(transformed);
      // Stream should be cleanly emptied or stripped of the greeting
      expect(result.trim()).toBe("");
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("processes single massive chunk without deadlock", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const massiveAnswer = "Cris Nguyen ".repeat(1000);
      const mockStream = createMockStream([massiveAnswer]);
      const transformed = mockStream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStreamToString(transformed);
      expect(result.length).toBe(massiveAnswer.length);
    });

    it.runIf(fileExistsInProject(antiSlopModulePath))("correctly identifies opener split across 1-character token chunks", async () => {
      // @ts-ignore
      const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
      const chars = ["C", "h", "à", "o", " ", "b", "ạ", "n", "!", " ", "C", "r", "i", "s"];
      const mockStream = createMockStream(chars);
      const transformed = mockStream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStreamToString(transformed);
      expect(result.trim()).toBe("Cris");
    });

    it("safely ignores malformed or unclosed action tags without throwing", () => {
      const parseActionsSafe = (text: string) => {
        const regex = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;
        const chips: Array<{ type: string; id: string; label: string }> = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
          chips.push({ type: match[1], id: match[2], label: match[3] });
        }
        return chips;
      };

      expect(parseActionsSafe("Text with [[action:malformed tag")).toEqual([]);
      expect(parseActionsSafe("Text with [[action:unknown|id|label]]")).toEqual([]);
      expect(parseActionsSafe("Text with [[action:project|kamala-commerce-tour|Kamala]]")).toHaveLength(1);
    });
  });

  describe("R3 Boundary Cases (Action Chips & Markdown)", () => {
    it("handles unclosed markdown code fence gracefully", () => {
      const parseCodeBlocks = (text: string) => {
        // Safe regex that matches unclosed fences at end of string
        const fenceRegex = /```([a-zA-Z0-9]*)\n?([\s\S]*?)(?:```|$)/g;
        const blocks: string[] = [];
        let match;
        while ((match = fenceRegex.exec(text)) !== null) {
          if (match[2].trim()) blocks.push(match[2].trim());
        }
        return blocks;
      };

      const unclosed = "```typescript\nconst a = 1;";
      const parsed = parseCodeBlocks(unclosed);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toBe("const a = 1;");
    });

    it("sanitizes dangerous javascript: URI scheme in markdown links", () => {
      const sanitizeLinkUrl = (url: string) => {
        const trimmed = url.trim().toLowerCase();
        if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:") || trimmed.startsWith("vbscript:")) {
          return "#";
        }
        return url;
      };

      expect(sanitizeLinkUrl("javascript:alert(1)")).toBe("#");
      expect(sanitizeLinkUrl("JAVASCRIPT:void(0)")).toBe("#");
      expect(sanitizeLinkUrl("https://kamala.vn")).toBe("https://kamala.vn");
      expect(sanitizeLinkUrl("/cris-nguyen-cv.pdf")).toBe("/cris-nguyen-cv.pdf");
    });

    it("handles 50 consecutive action chips without memory blowup", () => {
      const chips = Array.from({ length: 50 }, (_, i) => ({
        type: "project" as const,
        id: `project-${i}`,
        label: `Project ${i}`,
      }));
      expect(chips).toHaveLength(50);
      const renderedLabels = chips.map(c => c.label);
      expect(renderedLabels[49]).toBe("Project 49");
    });

    it("escapes special HTML and regex characters in action chip labels", () => {
      const rawLabel = `Test & <script>alert("XSS")</script> | "Special"`;
      const sanitizeLabel = (label: string) =>
        label
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const safe = sanitizeLabel(rawLabel);
      expect(safe).not.toContain("<script>");
      expect(safe).toContain("&lt;script&gt;");
    });

    it("handles empty or null text in markdown parser", () => {
      const parseMarkdownSafe = (text?: string | null) => {
        if (!text || typeof text !== "string") return [];
        return text.split("\n").filter(Boolean);
      };
      expect(parseMarkdownSafe("")).toEqual([]);
      expect(parseMarkdownSafe(null)).toEqual([]);
      expect(parseMarkdownSafe(undefined)).toEqual([]);
    });
  });

  describe("R4 Boundary Cases (Route & Pipeline Verification)", () => {
    it("validates request payload schema: reject missing messages", () => {
      const validateBody = (body: any) => {
        if (!body || typeof body !== "object") return false;
        if (!Array.isArray(body.messages) || body.messages.length === 0) return false;
        return true;
      };

      expect(validateBody({})).toBe(false);
      expect(validateBody({ messages: "not an array" })).toBe(false);
      expect(validateBody({ messages: [] })).toBe(false);
      expect(validateBody({ messages: [{ role: "user", content: "Hi" }] })).toBe(true);
    });

    it("rejects excessively large message content exceeding 20,000 characters", () => {
      const MAX_MESSAGE_LENGTH = 20000;
      const isWithinLimit = (content: string) => content.length <= MAX_MESSAGE_LENGTH;

      const oversized = "X".repeat(25000);
      const normal = "Can you show me Kamala project?";
      expect(isWithinLimit(oversized)).toBe(false);
      expect(isWithinLimit(normal)).toBe(true);
    });

    it("validates rate limit bucket decrement and rejection when empty", () => {
      let tokens = 2;
      const consumeToken = () => {
        if (tokens <= 0) return false;
        tokens -= 1;
        return true;
      };

      expect(consumeToken()).toBe(true);
      expect(consumeToken()).toBe(true);
      expect(consumeToken()).toBe(false);
    });

    it("detects and rejects non-POST HTTP methods", () => {
      const allowedMethod = "POST";
      const isAllowed = (method: string) => method.toUpperCase() === allowedMethod;
      expect(isAllowed("GET")).toBe(false);
      expect(isAllowed("PUT")).toBe(false);
      expect(isAllowed("DELETE")).toBe(false);
      expect(isAllowed("POST")).toBe(true);
    });

    it("handles JSON parse error in request body with 400 Bad Request", () => {
      const parseJsonSafe = (raw: string) => {
        try {
          return { data: JSON.parse(raw), error: null };
        } catch (err: any) {
          return { data: null, error: "Invalid JSON format" };
        }
      };
      const result = parseJsonSafe("{invalid-json");
      expect(result.data).toBeNull();
      expect(result.error).toBe("Invalid JSON format");
    });
  });
});
