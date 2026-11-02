import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";
import { isRunnableSnippet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/snippets";

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
});
