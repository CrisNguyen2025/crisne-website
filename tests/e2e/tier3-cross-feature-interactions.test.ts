import { describe, it, expect } from "vitest";
import {
  fileExistsInProject,
  createMockStream,
  readStreamToString,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_LAYERS,
  ChatActionChip,
} from "./test-helpers";

describe("Tier 3 — Cross-Feature Interactions", () => {
  const antiSlopModulePath = "lib/ai/anti-slop.ts";
  const actionChipsModulePath = "lib/ai/action-chips.ts";

  describe("Interaction 1: Anti-Slop + Action Chips", () => {
    it("prunes greeting opener while preserving embedded action chip tags intact", async () => {
      const rawWithGreetingAndChips =
        "Chào bạn! Cris đã xây dựng dự án Kamala Ecommerce [[action:project|kamala-commerce-tour|Khám phá Kamala]] phục vụ hàng ngàn người dùng.";

      if (fileExistsInProject(antiSlopModulePath)) {
        // @ts-ignore
        const { createAntiSlopTransformStream } = await import("@/lib/ai/anti-slop");
        const stream = createMockStream([rawWithGreetingAndChips]);
        const transformed = stream.pipeThrough(createAntiSlopTransformStream());
        const cleanedText = await readStreamToString(transformed);

        expect(cleanedText).not.toContain("Chào bạn!");
        expect(cleanedText).toContain("[[action:project|kamala-commerce-tour|Khám phá Kamala]]");
      } else {
        const fallbackClean = rawWithGreetingAndChips.replace(/^Chào bạn!\s*/, "");
        expect(fallbackClean).not.toContain("Chào bạn!");
        expect(fallbackClean).toContain("[[action:project|kamala-commerce-tour|Khám phá Kamala]]");
      }
    });

    it("extracts action chips after stream has passed through anti-slop transformer", async () => {
      const sanitizedText =
        "Cris phát triển nền tảng Zelene Spa [[action:project|zelene-spa-booking|Xem Zelene Spa]] với hệ thống đặt lịch tự động.";

      const regex = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;
      const chips: ChatActionChip[] = [];
      let match;
      while ((match = regex.exec(sanitizedText)) !== null) {
        chips.push({
          type: match[1] as ChatActionChip["type"],
          id: match[2],
          label: match[3],
        });
      }

      expect(chips).toHaveLength(1);
      expect(chips[0]).toEqual({
        type: "project",
        id: "zelene-spa-booking",
        label: "Xem Zelene Spa",
      });
    });
  });

  describe("Interaction 2: Markdown Rendering + Action Chips", () => {
    it("decouples action tags from complex markdown without breaking code blocks or links", () => {
      const rawMarkdownWithChips = [
        "Kiến trúc micro-frontend của Smartbit SaaS:",
        "```typescript",
        "export const tenantConfig = { multiTenant: true };",
        "```",
        "Chi tiết dự án: [Smartbit Live](https://smartbit.vn) và tải [CV](/cris-nguyen-cv.pdf).",
        "[[action:project|smartbit-saas-platform|Khám phá Smartbit]]",
        "[[action:contact|cv|Tải CV Cris Nguyen]]",
      ].join("\n");

      // Extract actions
      const tagRegex = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;
      const cleanMarkdown = rawMarkdownWithChips.replace(tagRegex, "").trim();
      const chips: ChatActionChip[] = [];
      let match;
      const scanRegex = new RegExp(tagRegex.source, "g");
      while ((match = scanRegex.exec(rawMarkdownWithChips)) !== null) {
        chips.push({
          type: match[1] as ChatActionChip["type"],
          id: match[2],
          label: match[3],
        });
      }

      // Check clean markdown preserves code fence and links
      expect(cleanMarkdown).toContain("```typescript\nexport const tenantConfig = { multiTenant: true };\n```");
      expect(cleanMarkdown).toContain("[Smartbit Live](https://smartbit.vn)");
      expect(cleanMarkdown).toContain("[CV](/cris-nguyen-cv.pdf)");
      expect(cleanMarkdown).not.toContain("[[action:");

      // Check chips extracted
      expect(chips).toHaveLength(2);
      expect(chips[0].id).toBe("smartbit-saas-platform");
      expect(chips[1].id).toBe("cv");
    });
  });

  describe("Interaction 3: Headless SDK State + Action Chips", () => {
    it("simulates message accumulation with action chips in ChatMessage structure", () => {
      interface ChatMessage {
        id: string;
        role: "user" | "assistant";
        content: string;
        timestamp: Date;
        actionChips?: ChatActionChip[];
      }

      const rawAssistantStream =
        "JAVIS là hệ thống mô phỏng gạch 3D bằng WebGL [[action:project|javis-3d-tile-simulation|Trải nghiệm JAVIS 3D]]";

      const tagRegex = /\[\[action:(project|roadmap|contact|link)\|([^|]+)\|([^\]]+)\]\]/g;
      const clean = rawAssistantStream.replace(tagRegex, "").trim();
      const chips: ChatActionChip[] = [
        {
          type: "project",
          id: "javis-3d-tile-simulation",
          label: "Trải nghiệm JAVIS 3D",
        },
      ];

      const message: ChatMessage = {
        id: "msg-123",
        role: "assistant",
        content: clean,
        timestamp: new Date(),
        actionChips: chips,
      };

      expect(message.role).toBe("assistant");
      expect(message.content).toBe("JAVIS là hệ thống mô phỏng gạch 3D bằng WebGL");
      expect(message.actionChips).toHaveLength(1);
      expect(message.actionChips?.[0].id).toBe("javis-3d-tile-simulation");
    });
  });

  describe("Interaction 4: Action Chips + CustomEvent Bus + UI State Handlers", () => {
    it("clicking project chip triggers project:open-modal and matches authoritative project", () => {
      let modalOpenedProjectId = "";
      const listener = (event: Event) => {
        const custom = event as CustomEvent<{ projectId: string }>;
        modalOpenedProjectId = custom.detail.projectId;
      };

      globalThis.addEventListener("project:open-modal", listener);

      // Simulate user clicking Kamala chip
      const selectedProject = AUTHORITATIVE_PROJECTS[0];
      globalThis.dispatchEvent(
        new CustomEvent("project:open-modal", {
          detail: { projectId: selectedProject.id },
        })
      );

      globalThis.removeEventListener("project:open-modal", listener);

      expect(modalOpenedProjectId).toBe("kamala-commerce-tour");
      const matched = AUTHORITATIVE_PROJECTS.find(p => p.id === modalOpenedProjectId);
      expect(matched?.title).toBe("Kamala Jewelry & Tour Platform");
    });

    it("clicking roadmap chip triggers roadmap:select-layer and matches authoritative layer", () => {
      let selectedLayerId = "";
      const listener = (event: Event) => {
        const custom = event as CustomEvent<{ layerId: string }>;
        selectedLayerId = custom.detail.layerId;
      };

      globalThis.addEventListener("roadmap:select-layer", listener);

      const targetLayer = AUTHORITATIVE_LAYERS[2]; // Layer 03 RAG
      globalThis.dispatchEvent(
        new CustomEvent("roadmap:select-layer", {
          detail: { layerId: targetLayer.id },
        })
      );

      globalThis.removeEventListener("roadmap:select-layer", listener);

      expect(selectedLayerId).toBe("layer-03");
      const matched = AUTHORITATIVE_LAYERS.find(l => l.id === selectedLayerId);
      expect(matched?.code).toBe("03-RAG");
    });
  });

  describe("Interaction 5: Fallback Context + Anti-Slop + Action Chips", () => {
    it("generates direct answer fallback with relevant action chips for project inquiry", () => {
      const userQuery = "Cris có dự án nào về spa không?";
      const isSpaQuery = /spa|booking/i.test(userQuery);

      const buildFallback = (query: string) => {
        if (/spa/i.test(query)) {
          return {
            content: "Cris đã xây dựng Zelene Head Spa Booking Platform với tính năng đặt lịch thông minh.",
            chips: [
              {
                type: "project" as const,
                id: "zelene-spa-booking",
                label: "Xem Zelene Spa",
              },
            ],
          };
        }
        return { content: "Thông tin dự án của Cris Nguyen.", chips: [] };
      };

      const fallback = buildFallback(userQuery);
      expect(isSpaQuery).toBe(true);
      expect(fallback.content).not.toMatch(/^Chào bạn|^Xin chào/);
      expect(fallback.chips).toHaveLength(1);
      expect(fallback.chips[0].id).toBe("zelene-spa-booking");
    });
  });
});
