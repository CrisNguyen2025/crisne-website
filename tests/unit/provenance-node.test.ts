// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { $getRoot, createEditor } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { MentionNode } from "@/components/ui/editor/nodes/MentionNode";
import { $isProvenanceNode, ProvenanceNode } from "@/components/ui/editor/nodes/ProvenanceNode";
import { buildProvenanceMarker, createClaimRefKey, extractProvenanceKeys } from "@/lib/provenance/markers";
import { contentStats, plainTextExcerpt } from "@/lib/roadmap/content-utils";

function roundTrip(inputHtml: string) {
  const editor = createEditor({
    namespace: "ProvenanceNodeTest",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, AutoLinkNode, LinkNode, MentionNode, ProvenanceNode],
    onError: (err) => {
      throw err;
    },
  });
  editor.update(
    () => {
      const dom = new DOMParser().parseFromString(inputHtml, "text/html");
      const root = $getRoot();
      root.clear();
      root.append(...$generateNodesFromDOM(editor, dom));
    },
    { discrete: true }
  );
  let html = "";
  let text = "";
  const nodeTypes: string[] = [];
  editor.getEditorState().read(() => {
    html = $generateHtmlFromNodes(editor);
    text = $getRoot().getTextContent();
    const walk = (node: ReturnType<typeof $getRoot>) => {
      for (const child of node.getChildren()) {
        nodeTypes.push(child.getType());
        if ("getChildren" in child) walk(child as unknown as ReturnType<typeof $getRoot>);
        if ($isProvenanceNode(child)) expect(child.getTextContent()).toBe("");
      }
    };
    walk($getRoot());
  });
  return { html, text, nodeTypes };
}

describe("ProvenanceNode (ADR-0017)", () => {
  it("keeps every marker and key through an editor round-trip", () => {
    const k1 = createClaimRefKey();
    const k2 = createClaimRefKey();
    const input = `<p>Câu một.${buildProvenanceMarker(k1)}</p><p>Câu hai.${buildProvenanceMarker(k2)}</p>`;
    const { html, nodeTypes } = roundTrip(input);
    expect(extractProvenanceKeys(html)).toEqual([k1, k2]);
    expect(nodeTypes.filter((t) => t === "provenance")).toHaveLength(2);
    expect(html).toContain(`<span data-provenance-ref="${k1}"></span>`);
  });

  it("keeps the text around a marker in the middle of a paragraph", () => {
    const key = createClaimRefKey();
    const { html, text } = roundTrip(`<p>Trước ${buildProvenanceMarker(key)} sau.</p>`);
    // Lexical collapses the whitespace on import; the words on both sides stay
    expect(text).toMatch(/^Trước\s+sau\.$/);
    expect(extractProvenanceKeys(html)).toEqual([key]);
  });

  it("leaves mentions to MentionNode and ignores spans without a valid key", () => {
    const { nodeTypes, html } = roundTrip(
      `<p><span data-lexical-mention="true">@cris</span> và <span data-provenance-ref="not-a-uuid">x</span></p>`
    );
    expect(nodeTypes).toContain("mention");
    expect(nodeTypes).not.toContain("provenance");
    expect(extractProvenanceKeys(html)).toEqual([]);
  });

  it("adds no text to excerpts or word counts after export", () => {
    const { html } = roundTrip(`<p>Một câu có nguồn.${buildProvenanceMarker(createClaimRefKey())}</p>`);
    expect(plainTextExcerpt(html)).toBe("Một câu có nguồn.");
    expect(contentStats(html).words).toBe(4);
  });
});
