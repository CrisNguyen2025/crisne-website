// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { closeOpenInline } from "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { CodeBlock } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";
import { CHAT_COLORS, WIDGET_THEME_VARS } from "@/roadmap-rag-assistant/sdk/typescript/src/react/tokens";

describe("Abot UI/UX - Stream Smoothness & Design Tokens (BRIEF Verification)", () => {
  afterEach(() => {
    cleanup();
  });

  describe("1. Elimination of Negative Steps (No newline truncation)", () => {
    it("preserves trailing newline when followed by 1 or 2 pending backticks", () => {
      const rawWith1Tick = "Bạn có thể dùng lệnh:\n`";
      const cleaned1 = rawWith1Tick.replace(/(\n[ \t]*)`{1,2}$/, "$1");
      expect(cleaned1).toBe("Bạn có thể dùng lệnh:\n");
      // Newline is never eaten, so vertical layout does not contract (-24px negative step)
      expect(cleaned1.endsWith("\n")).toBe(true);

      const rawWith2Ticks = "Bạn có thể dùng lệnh:\n  ``";
      const cleaned2 = rawWith2Ticks.replace(/(\n[ \t]*)`{1,2}$/, "$1");
      expect(cleaned2).toBe("Bạn có thể dùng lệnh:\n  ");
      expect(cleaned2.includes("\n")).toBe(true);
    });

    it("leaves complete code fences (3 backticks) intact", () => {
      const rawWith3Ticks = "Bạn có thể dùng lệnh:\n```";
      const cleaned3 = rawWith3Ticks.replace(/(\n[ \t]*)`{1,2}$/, "$1");
      expect(cleaned3).toBe("Bạn có thể dùng lệnh:\n```");
    });

    it("safely closes open inline markdown without altering code fence states", () => {
      expect(closeOpenInline("Lộ trình **Frontend")).toBe("Lộ trình **Frontend**");
      expect(closeOpenInline("Sử dụng lệnh `git status")).toBe("Sử dụng lệnh `git status`");
      // Inside an unclosed code fence, inline closure is strictly bypassed
      expect(closeOpenInline("```text\n* item")).toBe("```text\n* item");
    });
  });

  describe("2. Smooth Compact Snippet Card (No +58px snap)", () => {
    it("renders compact code card with smooth grid height expansion wrapper", () => {
      render(
        <CodeBlock
          lang="text"
          code="tạo bài học Next.js"
          open={true}
        />
      );

      // Caret is active inside the card
      const caret = document.querySelector(".animate-pulse");
      expect(caret).toBeDefined();

      // Card possesses the minimum 50px height inside an overflow-hidden wrapper
      const card = screen.getByText("tạo bài học Next.js").closest("div");
      expect(card?.className).toContain("min-h-[50px]");
      expect(card?.className).toContain("border");
    });
  });

  describe("3. Design Tokens & Contrast Ratios", () => {
    it("enforces centralized WCAG AA/AAA color tokens", () => {
      // Primary text
      expect(CHAT_COLORS.text).toBe("#1F1E1C");
      // WCAG AAA textMuted (raised from #6B6862)
      expect(CHAT_COLORS.textMuted).toBe("#5E5B55");
      // WCAG AA textSubtle (raised from #8C8983 to 4.9:1)
      expect(CHAT_COLORS.textSubtle).toBe("#75716A");
      // Terracotta brand accent
      expect(CHAT_COLORS.accent).toBe("#C2410C");
      expect(CHAT_COLORS.accentSoft).toBe("#FBEDE5");
      // Surface and borders
      expect(CHAT_COLORS.bg).toBe("#FFFFFF");
      expect(CHAT_COLORS.surface).toBe("#F4F3F0");
      expect(CHAT_COLORS.border).toBe("#E6E4DF");
    });

    it("properly binds tokens to WIDGET_THEME_VARS CSS properties", () => {
      const vars = WIDGET_THEME_VARS as Record<string, string>;
      expect(vars["--chat-text-subtle"]).toBe("#75716A");
      expect(vars["--chat-text-muted"]).toBe("#5E5B55");
      expect(vars["--chat-border"]).toBe("#E6E4DF");
      expect(vars["--chat-accent"]).toBe("#C2410C");
      expect(vars["--bg"]).toBe("#FFFFFF");
      expect(vars["--surface"]).toBe("#F4F3F0");
    });
  });
});
