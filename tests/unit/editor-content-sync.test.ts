// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEditor, $getRoot } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import {
  contentStats,
  contentToHtml,
  readingMinutes,
  sanitizeDangerousHtml,
} from "@/lib/roadmap/content-utils";
import {
  CalloutNode,
  $isCalloutNode,
} from "@/components/ui/editor/nodes/CalloutNode";
import { normalizeImportedDom } from "@/components/ui/editor/plugins/SetContentPlugin";

function createTestEditor() {
  return createEditor({
    namespace: "EditorContentSyncTest",
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
      CalloutNode,
    ],
    onError: (err) => {
      throw err;
    },
  });
}

function roundTripHtml(inputHtml: string) {
  const editor = createTestEditor();
  let exportedHtml = "";
  let nodeTypes: string[] = [];
  let calloutTypes: string[] = [];

  editor.update(
    () => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(inputHtml, "text/html");
      normalizeImportedDom(dom);
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    },
    { discrete: true }
  );

  editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    nodeTypes = children.map((n) => n.getType());
    calloutTypes = children
      .filter($isCalloutNode)
      .map((n) => n.getCalloutType());
    exportedHtml = $generateHtmlFromNodes(editor);
  });

  return { exportedHtml, nodeTypes, calloutTypes };
}

describe("contentStats & readingMinutes parity", () => {
  it("computes consistent stats with HTML entities and tags", () => {
    const html = `<p>${Array(210).fill("word").join(" ")}&nbsp;&amp;&nbsp;end</p>`;
    const stats = contentStats(html);
    expect(stats.words).toBe(212);
    expect(stats.characters).toBeGreaterThan(210 * 5);
    expect(stats.readingMinutes).toBe(1);
    expect(readingMinutes(html)).toBe(stats.readingMinutes);
  });

  it("returns zero stats for empty or tag-only HTML", () => {
    expect(contentStats("")).toEqual({
      words: 0,
      characters: 0,
      readingMinutes: 0,
    });
    expect(contentStats("<p><br></p>")).toEqual({
      words: 0,
      characters: 0,
      readingMinutes: 0,
    });
  });
});

describe("contentToHtml legacy normalization & callouts", () => {
  it("collapses nested <pre><pre>...</pre></pre> wrappers", () => {
    const raw =
      '<pre spellcheck="false"><pre spellcheck="false"><span>const x = 1;</span></pre></pre>';
    const out = contentToHtml(raw);
    expect(out).toBe('<pre spellcheck="false"><span>const x = 1;</span></pre>');
  });

  it("converts blockquote callouts cleanly without keeping [!type] marker", () => {
    const out = contentToHtml(
      '<blockquote data-callout-type="warning"><p>[!warning] Chú ý hiệu năng</p></blockquote>'
    );
    expect(out).toBe(
      '<div class="callout callout-warning"><div class="callout-content"><p>Chú ý hiệu năng</p></div></div>'
    );
  });

  it("strips slash-separated event handlers, SVG/math/style tags, and entity-obfuscated JS URIs while preserving safe HTML", () => {
    const dirty = [
      '<p>Safe text</p>',
      '<span data-provenance-ref="01937d99-0000-7000-8000-000000000001"></span>',
      '<img/src=x/onerror=alert(1)>',
      '<svg onload=alert(1)><circle/></svg>',
      '<a href="&#106;avascript:alert(1)">Click</a>',
      '<a href=javascript:alert(1)>Unquoted</a>',
      '<img src="data:image/svg+xml,<svg onload=alert(1)/>">',
      '<img src="data:image/png;base64,iVBORw0KGgo=">',
    ].join("");
    const clean = sanitizeDangerousHtml(dirty);
    expect(clean).toContain("<p>Safe text</p>");
    expect(clean).toContain('data-provenance-ref="01937d99-0000-7000-8000-000000000001"');
    expect(clean).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(clean).not.toMatch(/onerror|onload|<svg|javascript:|image\/svg\+xml/i);
  });
});

describe("Lexical Editor HTML round-trip sync", () => {
  it("does not nest <pre> or <code> on multi-line and single-line code blocks", () => {
    const multi = roundTripHtml(
      "<pre><code>const a = 1;\nconst b = 2;</code></pre>"
    );
    expect(multi.nodeTypes).toEqual(["code"]);
    expect(multi.exportedHtml.match(/<pre\b/g)?.length).toBe(1);
    expect(multi.exportedHtml).not.toContain("<code");
    expect(multi.exportedHtml).toContain("const a = 1;");
    expect(multi.exportedHtml).toContain("const b = 2;");

    const single = roundTripHtml("<pre><code>const a = 1;</code></pre>");
    expect(single.nodeTypes).toEqual(["code"]);
    expect(single.exportedHtml.match(/<pre\b/g)?.length).toBe(1);
    expect(single.exportedHtml).not.toContain("<code");
    expect(single.exportedHtml).toContain("const a = 1;");
  });

  it("preserves CalloutNode across blockquote, [!marker], and div.callout formats", () => {
    const fromAttr = roundTripHtml(
      '<blockquote data-callout-type="info" class="callout callout-info">Ghi chú info</blockquote>'
    );
    expect(fromAttr.nodeTypes).toEqual(["callout"]);
    expect(fromAttr.calloutTypes).toEqual(["info"]);
    expect(fromAttr.exportedHtml).toContain('data-callout-type="info"');

    const fromMarker = roundTripHtml(
      "<blockquote><p>[!warning] Lưu ý quan trọng</p></blockquote>"
    );
    expect(fromMarker.nodeTypes).toEqual(["callout"]);
    expect(fromMarker.calloutTypes).toEqual(["warning"]);
    expect(fromMarker.exportedHtml).not.toContain("[!warning]");
    expect(fromMarker.exportedHtml).toContain("Lưu ý quan trọng");

    const fromDiv = roundTripHtml(
      '<div class="callout callout-error"><div class="callout-content"><p>Lỗi hệ thống</p><p>Thử lại</p></div></div>'
    );
    expect(fromDiv.nodeTypes).toEqual(["callout"]);
    expect(fromDiv.calloutTypes).toEqual(["error"]);
    expect(fromDiv.exportedHtml).toContain('data-callout-type="error"');
    expect(fromDiv.exportedHtml).toContain("Lỗi hệ thống");
    expect(fromDiv.exportedHtml).toContain("Thử lại");

    const fromNestedList = roundTripHtml(
      '<div class="callout callout-success"><div class="callout-content"><p>Checklist</p><ul><li>Bước 1</li><li>Bước 2</li></ul></div></div>'
    );
    expect(fromNestedList.nodeTypes).toEqual(["callout"]);
    expect(fromNestedList.calloutTypes).toEqual(["success"]);
    expect(fromNestedList.exportedHtml).not.toContain("<li");
    expect(fromNestedList.exportedHtml).toContain("Checklist");
    expect(fromNestedList.exportedHtml).toContain("Bước 1");
    expect(fromNestedList.exportedHtml).toContain("Bước 2");
  });

  it("preserves text alignment across round-trip", () => {
    const res = roundTripHtml(
      '<p style="text-align: center;">Centered text</p><h2 style="text-align: right;">Right heading</h2>'
    );
    expect(res.exportedHtml).toContain("text-align: center");
    expect(res.exportedHtml).toContain("text-align: right");
  });
});
