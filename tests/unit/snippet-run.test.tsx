import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";
import {
  findExecutedPromptTargets,
  isRunnableSnippet,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/snippets";
import type { ChatMessage } from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

describe("isRunnableSnippet", () => {
  it.each(["tìm bài học về Docker", "liệt kê topic", "tạo topic AI Engineering", "hủy", "nhóm Fundamentals"])(
    "%s can be sent as it is",
    (snippet) => expect(isRunnableSnippet(snippet)).toBe(true)
  );

  it.each([
    "tạo topic <tên topic>",
    "thêm bài … vào layer …",
    "thêm bài Kafka vào layer ...",
    "xóa bài Kafka",
    "xoá layer mock 1 trong topic fe",
    "delete item Redis",
  ])("%s is copy only: a blank to fill in, or a delete", (snippet) => expect(isRunnableSnippet(snippet)).toBe(false));
});

describe("CodeBlock one-line text snippet", () => {
  const render = (code: string) => renderToStaticMarkup(<CodeBlock lang="text" code={code} onRun={vi.fn()} />);

  it("offers send and copy for a complete command", () => {
    const html = render("liệt kê topic");
    expect(html).toContain('aria-label="Gửi"');
    expect(html).toContain('aria-label="Sao chép"');
  });

  it("offers copy only for a template or a delete", () => {
    for (const code of ["tạo topic <tên topic>", "xóa bài Kafka"]) {
      const html = render(code);
      expect(html).not.toContain('aria-label="Gửi"');
      expect(html).toContain('aria-label="Sao chép"');
    }
  });

  it("shows jump-to-executed icon button instead of play when an executed message id is provided", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        lang="text"
        code="Guardrails cho LLM hoạt động thế nào"
        onRun={vi.fn()}
        executedMessageId="user-42"
        onJumpToMessage={vi.fn()}
      />
    );
    expect(html).not.toContain('aria-label="Gửi"');
    expect(html).toContain('aria-label="Đã gửi — Đi tới câu hỏi"');
    expect(html).not.toContain("<span>Đã gửi</span>");
    expect(html).toContain('aria-label="Sao chép"');
  });

  it("disables play when another turn is busy", () => {
    const html = renderToStaticMarkup(
      <CodeBlock lang="text" code="liệt kê topic" onRun={vi.fn()} isBusy />
    );
    expect(html).toContain('aria-label="Gửi"');
    expect(html).toContain("disabled");
  });

  it("keeps template and delete snippets copy-only even when executedMessageId is set", () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        lang="text"
        code="xóa bài Kafka"
        onRun={vi.fn()}
        executedMessageId="user-99"
        onJumpToMessage={vi.fn()}
      />
    );
    expect(html).not.toContain("Đã gửi");
    expect(html).not.toContain('aria-label="Gửi"');
    expect(html).toContain('aria-label="Sao chép"');
  });
});

describe("findExecutedPromptTargets", () => {
  const msg = (
    id: string,
    role: ChatMessage["role"],
    content: string,
    extra: Partial<ChatMessage> = {}
  ): ChatMessage => ({
    id,
    role,
    content,
    timestamp: new Date("2026-11-18T00:00:00Z"),
    ...extra,
  });

  it("maps prompts completed after an assistant message and ignores earlier runs", () => {
    const messages: ChatMessage[] = [
      msg("u0", "user", "liệt kê topic"),
      msg("a0", "assistant", "Topic A", { status: "complete" }),
      msg("u1", "user", "gợi ý prompt"),
      msg("a1", "assistant", "```text\nGuardrails cho LLM hoạt động thế nào\n```", {
        status: "complete",
      }),
      msg("u2", "user", "  Guardrails cho LLM hoạt động thế nào  "),
      msg("a2", "assistant", "Guardrails là...", { status: "complete" }),
      msg("u3", "user", "bạn làm được gì?"),
      msg("a3", "assistant", "```text\nliệt kê topic\n```", { status: "complete" }),
    ];

    const map = findExecutedPromptTargets(messages);
    expect(map.get("a1")).toEqual({
      "Guardrails cho LLM hoạt động thế nào": "u2",
      "bạn làm được gì?": "u3",
    });
    // Fresh suggestion card in a3 stays runnable despite u0 earlier in the thread
    expect(map.get("a3")).toBeUndefined();
  });

  it("ignores streaming, failed, or stopped turns and keeps latest successful run", () => {
    const messages: ChatMessage[] = [
      msg("a0", "assistant", "```text\nliệt kê topic\n```", { status: "complete" }),
      msg("u-err", "user", "lỗi"),
      msg("a-err", "assistant", "error", { status: "error" }),
      msg("u-stop", "user", "dừng"),
      msg("a-stop", "assistant", "partial", { status: "complete", stopped: true }),
      msg("u-live", "user", "đang chạy"),
      msg("a-live", "assistant", "...", { status: "streaming" }),
      msg("u-ok-1", "user", "liệt kê topic"),
      msg("a-ok-1", "assistant", "A", { status: "complete" }),
      msg("u-ok-2", "user", "liệt kê topic"),
      msg("a-ok-2", "assistant", "A, B", { status: "complete" }),
    ];

    const map = findExecutedPromptTargets(messages);
    expect(map.get("a0")).toEqual({
      "liệt kê topic": "u-ok-2",
    });
  });
});
