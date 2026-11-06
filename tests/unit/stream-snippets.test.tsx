import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBlocks, isOneLineSnippet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { CodeBlock } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";

describe("parseBlocks code fence open/closed state", () => {
  it("marks a fully closed code fence with open: false", () => {
    const markdown = "```text\nliệt kê topic\n```";
    const blocks = parseBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "code",
      lang: "text",
      code: "liệt kê topic",
      open: false,
    });
  });

  it("marks an unclosed code fence while streaming with open: true", () => {
    const markdown = "```text\nliệt kê topic";
    const blocks = parseBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "code",
      lang: "text",
      code: "liệt kê topic",
      open: true,
    });
  });

  it("marks an unclosed code fence ending with a newline before closing fence as open: true", () => {
    const markdown = "```text\nliệt kê topic\n";
    const blocks = parseBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "code",
      lang: "text",
      code: "liệt kê topic\n",
      open: true,
    });
  });

  it("correctly identifies open state for an empty fence just started", () => {
    const markdown = "```text\n";
    const blocks = parseBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "code",
      lang: "text",
      code: "",
      open: true,
    });
  });

  it("handles a closed block followed by an open streaming block", () => {
    const markdown = "Dưới đây là các lệnh:\n\n```text\nlệnh 1\n```\n\n```text\nlệnh 2";
    const blocks = parseBlocks(markdown);

    expect(blocks).toHaveLength(3);
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[1]).toMatchObject({
      kind: "code",
      code: "lệnh 1",
      open: false,
    });
    expect(blocks[2]).toMatchObject({
      kind: "code",
      code: "lệnh 2",
      open: true,
    });
  });
});

describe("isOneLineSnippet", () => {
  it("accepts clean one-line text", () => {
    expect(isOneLineSnippet("liệt kê topic")).toBe(true);
    expect(isOneLineSnippet("tạo topic AI Engineering", "text")).toBe(true);
    expect(isOneLineSnippet("tìm bài học về Docker", "")).toBe(true);
  });

  it("accepts a one-line snippet ending with trailing newlines or whitespace (streaming before fence)", () => {
    expect(isOneLineSnippet("liệt kê topic\n")).toBe(true);
    expect(isOneLineSnippet("liệt kê topic\n\n   ")).toBe(true);
    expect(isOneLineSnippet("tạo topic AI Engineering\n", "text")).toBe(true);
  });

  it("rejects genuinely multi-line code", () => {
    expect(isOneLineSnippet("echo 1\necho 2")).toBe(false);
    expect(isOneLineSnippet("echo 1\necho 2\n")).toBe(false);
    expect(isOneLineSnippet("line1\nline2\nline3", "text")).toBe(false);
  });

  it("rejects code blocks with explicit programming language tags", () => {
    expect(isOneLineSnippet("const x = 1;", "ts")).toBe(false);
    expect(isOneLineSnippet("print('hello')", "python")).toBe(false);
    expect(isOneLineSnippet("echo hello", "bash")).toBe(false);
  });
});

describe("CodeBlock streaming & snippet stability", () => {
  it("renders compact snippet with live caret and hidden action buttons while open", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        lang="text"
        code="liệt kê topic"
        open={true}
        onRun={vi.fn()}
      />
    );

    // Main compact card with minimum 50px height
    expect(html).toContain("min-h-[50px]");
    expect(html).toContain("liệt kê topic");

    // Caret pulses during streaming
    expect(html).toContain("animate-pulse");

    // Action buttons are hidden while streaming (opacity-0 pointer-events-none)
    expect(html).toContain("pointer-events-none opacity-0");
  });

  it("renders compact snippet with visible action buttons once closed (open: false)", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        lang="text"
        code="liệt kê topic"
        open={false}
        onRun={vi.fn()}
      />
    );

    expect(html).toContain("min-h-[50px]");
    expect(html).toContain("liệt kê topic");
    expect(html).toContain("opacity-100");
    expect(html).toContain('aria-label="Gửi"');
    expect(html).toContain('aria-label="Sao chép"');
  });

  it("keeps one-line snippet compact even if code has a trailing newline (does not inflate to multiline pre)", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        lang="text"
        code={"tạo topic AI Engineering\n"}
        open={true}
        onRun={vi.fn()}
      />
    );

    // Still compact snippet card, NOT multiline <pre>
    expect(html).toContain("min-h-[50px]");
    expect(html).not.toContain("<pre");
  });
});
