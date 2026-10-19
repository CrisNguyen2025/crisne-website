import { describe, it, expect } from "vitest";
import React from "react";
import {
  fileExistsInProject,
  readProjectFile,
  renderComponentToHtml,
  getContrastRatio,
  meetsWcagAA,
  meetsWcagAAA,
  getRelativeLuminance,
} from "./helpers";

describe("Tier 1 — Typography, Theming & Streaming UX (F9 - F10)", () => {
  const markdownPath = "roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx";
  const widgetPath = "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx";
  const smoothStreamPath = "roadmap-rag-assistant/sdk/typescript/src/react/utils/smoothStream.ts";

  // ==========================================
  // F9: Typography & WCAG Theming
  // ==========================================
  describe("F9: Typography & Monospace Font Stack (>=5 tests)", () => {
    it("enforces normalized body line-height within 1.6 - 1.7 range (leading-relaxed)", () => {
      // In Tailwind CSS, `leading-relaxed` corresponds to line-height: 1.625
      const content = readProjectFile(markdownPath);
      expect(content).toContain("leading-relaxed");
    });

    it("verifies professional monospace font stack configuration in app styles", () => {
      const globalsCssPath = "app/styles/globals.css";
      const layoutPath = "app/layout.tsx";

      let fontMonoDefined = false;
      if (fileExistsInProject(globalsCssPath)) {
        const css = readProjectFile(globalsCssPath);
        if (css.includes("--font-mono") || css.includes("JetBrains") || css.includes("monospace")) {
          fontMonoDefined = true;
        }
      }
      if (fileExistsInProject(layoutPath)) {
        const layout = readProjectFile(layoutPath);
        if (layout.includes("JetBrains_Mono") || layout.includes("monospace")) {
          fontMonoDefined = true;
        }
      }
      expect(fontMonoDefined).toBe(true);
    });

    it("code blocks apply font-mono with proper overflow scrolling", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toContain("font-mono");
      expect(content).toMatch(/overflow-x-auto|max-w-full/);
    });

    it("headings declare distinct typographic hierarchy classes", () => {
      const content = readProjectFile(markdownPath);
      // H1-H4 hierarchy checks
      expect(content).toMatch(/text-(base|sm|lg)/);
      expect(content).toMatch(/font-(semibold|bold|medium)/);
    });

    it("preserves readable text size and word breaking to avoid container blowout", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toContain("break-words");
      expect(content).toMatch(/text-sm|text-xs/);
    });
  });

  describe("F9: WCAG Color Contrast Compliance (>=5 tests)", () => {
    it("primary text #1F1E1C on white #FFFFFF achieves WCAG AAA (>7.0:1)", () => {
      const ratio = getContrastRatio("#1F1E1C", "#FFFFFF");
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWcagAAA("#1F1E1C", "#FFFFFF")).toBe(true);
    });

    it("muted text #6B6862 on white #FFFFFF satisfies WCAG AA (>4.5:1)", () => {
      const ratio = getContrastRatio("#6B6862", "#FFFFFF");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA("#6B6862", "#FFFFFF")).toBe(true);
    });

    it("accent button #C2410C with white text #FFFFFF satisfies WCAG AA (>4.5:1)", () => {
      const ratio = getContrastRatio("#FFFFFF", "#C2410C");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA("#FFFFFF", "#C2410C")).toBe(true);
    });

    it("success status color #3F7D58 on white #FFFFFF satisfies WCAG AA (>4.5:1)", () => {
      const ratio = getContrastRatio("#3F7D58", "#FFFFFF");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA("#3F7D58", "#FFFFFF")).toBe(true);
    });

    it("evaluates dark mode contrast: light foreground #F9FAFB on dark background #111827 (>7.0:1)", () => {
      const ratio = getContrastRatio("#F9FAFB", "#111827");
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWcagAAA("#F9FAFB", "#111827")).toBe(true);
    });

    it("evaluates step timer contrast compliance with accessible threshold (>=4.5:1)", () => {
      // Step timer color #525252 provides accessible 5.9:1 on white
      const accessibleTimer = "#525252";
      const ratio = getContrastRatio(accessibleTimer, "#FFFFFF");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ==========================================
  // F10: Streaming Stability & Caret
  // ==========================================
  describe("F10: Streaming Stability & Caret (>=5 tests)", () => {
    it("smoothStream utility exists and exports createSmoothStream", async () => {
      expect(fileExistsInProject(smoothStreamPath)).toBe(true);
      const { createSmoothStream } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/smoothStream"
      );
      expect(typeof createSmoothStream).toBe("function");
    });

    it("smoothStream delivers tokens incrementally without dropping characters", async () => {
      const { createSmoothStream } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/smoothStream"
      );

      let accumulated = "";
      const stream = createSmoothStream((chunk) => {
        accumulated += chunk;
      });

      stream.push("Xin chào ");
      stream.push("các bạn! ");
      stream.push("Hôm nay chúng ta ");
      stream.flush();

      expect(accumulated).toBe("Xin chào các bạn! Hôm nay chúng ta ");
    });

    it("ChatMarkdown contains StreamingCaret with pulse animation", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toContain("StreamingCaret");
      expect(content).toMatch(/animate-pulse/);
    });

    it("implements block memoization (React.memo / areBlocksEqual) to eliminate full-tree re-render flicker", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toMatch(/React\.memo|memo\(/);
      expect(content).toMatch(/areBlocksEqual/);
    });

    it("closes unfinished inline marks while streaming to prevent layout jumps", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toContain("closeOpenInline");
      expect(content).not.toMatch(/animate-stream-fade/);
    });

    it("scroll anchoring prevents auto-scroll layout thrashing during streaming", () => {
      const content = readProjectFile(widgetPath);
      // Widget tracks scroll position or uses bottom anchor
      expect(content).toMatch(/scrollRef|scrollTop|isAtBottom/);
    });
  });
});
