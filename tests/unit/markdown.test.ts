import { describe, expect, it } from "vitest";
import { markdownToPlainText, markdownToSafeHtml } from "@/lib/roadmap/markdown";

describe("markdownToSafeHtml", () => {
  it("renders headings, lists, emphasis and links", () => {
    const html = markdownToSafeHtml("## Tổng quan\n\n- **RAG** với [docs](https://example.com)\n- *reranker*");

    expect(html).toContain("<h2>Tổng quan</h2>");
    expect(html).toContain("<strong>RAG</strong>");
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">docs</a>');
    expect(html).toContain("<em>reranker</em>");
  });

  it("escapes markup inside code blocks and keeps the language label", () => {
    const html = markdownToSafeHtml("```cpp\nstd::vector<int> v;\n```");

    expect(html).toContain('<pre><code class="language-cpp">');
    expect(html).toContain("std::vector&lt;int&gt; v;");
  });

  it("drops script, style, iframe and event handlers from raw HTML", () => {
    const html = markdownToSafeHtml(
      [
        "<script>alert(1)</script>",
        "<style>body{display:none}</style>",
        '<iframe src="https://evil.example"></iframe>',
        '<img src=x onerror="alert(1)">',
        "Văn bản an toàn",
      ].join("\n\n")
    );

    expect(html).not.toMatch(/<script|alert\(1\)|<style|display:none|<iframe|<img|onerror/i);
    expect(html).toContain("Văn bản an toàn");
  });

  it("removes javascript: links, quoted or not", () => {
    const html = markdownToSafeHtml(
      '[a](javascript:alert(1))\n\n<a href=javascript:alert(2)>b</a>\n\n<a href="JaVaScRiPt:alert(3)">c</a>'
    );

    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain(">b</a>");
  });
});

describe("markdownToPlainText", () => {
  it("returns the first paragraph as plain text, skipping headings and inline HTML", () => {
    expect(
      markdownToPlainText("## Tổng quan\n\nDùng **reranker** với `bge` <b>ngay</b> [docs](https://x.io).\n\nĐoạn hai", 200)
    ).toBe("Dùng reranker với bge ngay docs.");
  });

  it("cuts long text with an ellipsis, counting characters not bytes", () => {
    const text = markdownToPlainText(`${"á".repeat(30)}`, 10);
    expect(Array.from(text)).toHaveLength(10);
    expect(text.endsWith("…")).toBe(true);
  });

  it("returns an empty string when there is no paragraph", () => {
    expect(markdownToPlainText("## Chỉ có tiêu đề", 200)).toBe("");
    expect(markdownToPlainText("", 200)).toBe("");
  });
});
