// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import {
  CLAIM_RE,
  claimIndex,
  markClaims,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/utils/citations";
import type { ChatCitation, ChatSource } from "../../roadmap-rag-assistant/sdk/typescript/src/types";

/** A citation for `text` where it first occurs in `content`, as the server sends it. */
function cite(content: string, text: string, ids: string[]): ChatCitation {
  const start = content.indexOf(text);
  return { start, end: start + text.length, text, source_ids: ids };
}

/** The claims of a marked text, in order, with their source ids. */
function claimsOf(marked: { content: string; claims: string[][] }) {
  return [...marked.content.matchAll(CLAIM_RE)].map((m) => [m[1], marked.claims[claimIndex(m[2])]]);
}

const SOURCES: ChatSource[] = [
  { id: "d1", title: "Docker cơ bản", href: "/?topic=ops&item=d1", cited: true },
  { id: "d2", title: "Kubernetes", href: "/?topic=ops&item=d2", cited: true },
  { id: "d3", title: "Ghi chú nội bộ", href: null, cited: false },
];

describe("markClaims", () => {
  it("marks each claim at its range", () => {
    const content = "- **Docker** đóng gói 📦. Còn lại.\n- K8s điều phối.";
    const marked = markClaims(content, [
      cite(content, "**Docker** đóng gói 📦.", ["d1"]),
      cite(content, "K8s điều phối.", ["d1", "d2"]),
    ]);
    expect(claimsOf(marked)).toEqual([
      ["**Docker** đóng gói 📦.", ["d1"]],
      ["K8s điều phối.", ["d1", "d2"]],
    ]);
  });

  it("finds a claim by its text when the range drifted", () => {
    const content = "Mở đầu. Docker đóng gói.";
    const marked = markClaims(content, [{ start: 0, end: 5, text: "Docker đóng gói.", source_ids: ["d1"] }]);
    expect(claimsOf(marked)).toEqual([["Docker đóng gói.", ["d1"]]]);
  });

  it("leaves out claims that are missing or overlap", () => {
    const content = "Docker đóng gói.";
    const marked = markClaims(content, [
      cite(content, "Docker đóng gói.", ["d1"]),
      cite(content, "đóng gói.", ["d2"]),
      { start: 0, end: 3, text: "không có", source_ids: ["d2"] },
    ]);
    expect(claimsOf(marked)).toEqual([["Docker đóng gói.", ["d1"]]]);
  });

  it("returns the text untouched without citations", () => {
    expect(markClaims("Xin chào", undefined)).toEqual({ content: "Xin chào", claims: [] });
  });
});

describe("ChatMarkdown citations", () => {
  afterEach(cleanup);

  it("shows no chip after a claim; one chip per source sits at the end of the answer", () => {
    const content = "## Container\n- Docker đóng gói ứng dụng. Câu không nguồn.\n- K8s điều phối.";
    const { container } = render(
      <ChatMarkdown
        content={content}
        sources={[...SOURCES, SOURCES[0]]}
        citations={[cite(content, "Docker đóng gói ứng dụng.", ["d1"]), cite(content, "K8s điều phối.", ["d2", "d1"])]}
      />
    );
    const claims = [...container.querySelectorAll("[data-claim]")];
    expect(claims.map((c) => c.textContent)).toEqual(["Docker đóng gói ứng dụng.", "K8s điều phối."]);
    claims.forEach((c) => expect(c.nextElementSibling?.querySelector("button")).toBeUndefined());
    // Duplicate sources collapse to one chip each, labelled by the article title (also without a link)
    const chips = [...container.querySelectorAll("button[aria-controls]")];
    expect(chips.map((c) => c.textContent)).toEqual(["Docker cơ bản", "Kubernetes", "Ghi chú nội bộ"]);
    expect(container.textContent).toContain("Câu không nguồn.");
    expect(container.textContent).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it("drops the marks of a claim placed where chips are not rendered", () => {
    const content = "| A | B |\n|---|---|\n| Docker đóng gói. | x |";
    const { container } = render(
      <ChatMarkdown content={content} sources={SOURCES} citations={[cite(content, "Docker đóng gói.", ["d1"])]} />
    );
    expect(container.textContent).toContain("Docker đóng gói.");
    expect(container.textContent).not.toMatch(/[-]/);
  });

  it("hovering a source chip highlights every claim citing that source, and leaving clears it", async () => {
    const content = "Docker đóng gói. K8s điều phối. Helm đóng gói chart.";
    const { container } = render(
      <ChatMarkdown
        content={content}
        sources={SOURCES}
        citations={[
          cite(content, "Docker đóng gói.", ["d1"]),
          cite(content, "K8s điều phối.", ["d2"]),
          cite(content, "Helm đóng gói chart.", ["d1", "d2"]),
        ]}
      />
    );
    const highlighted = () =>
      [...container.querySelectorAll("[data-claim][data-highlighted]")].map((c) => c.textContent);
    const [docker, k8s] = container.querySelectorAll("button[aria-controls]");

    fireEvent.mouseEnter(docker);
    expect(highlighted()).toEqual(["Docker đóng gói.", "Helm đóng gói chart."]);

    // Moving straight to the other source hands the highlight over; the first chip's close keeps it
    fireEvent.mouseLeave(docker);
    fireEvent.mouseEnter(k8s);
    await waitFor(() => expect(docker.getAttribute("aria-expanded")).toBe("false"));
    expect(highlighted()).toEqual(["K8s điều phối.", "Helm đóng gói chart."]);

    fireEvent.mouseLeave(k8s);
    await waitFor(() => expect(highlighted()).toEqual([]));
  });

  it("keyboard focus on a chip highlights its claim too", () => {
    const content = "Docker đóng gói.";
    const { container } = render(
      <ChatMarkdown content={content} sources={SOURCES} citations={[cite(content, content, ["d1"])]} />
    );
    fireEvent.focus(container.querySelector("button[aria-controls]") as HTMLElement);
    expect(container.querySelector("[data-claim]")?.hasAttribute("data-highlighted")).toBe(true);
  });

  it("Escape closes an open panel without reaching other Escape handlers", () => {
    const content = "Docker đóng gói.";
    const { container } = render(
      <ChatMarkdown content={content} sources={SOURCES} citations={[cite(content, content, ["d1"])]} />
    );
    const chip = container.querySelector("button[aria-controls]") as HTMLElement;
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    try {
      fireEvent.mouseEnter(chip);
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(chip.getAttribute("aria-expanded")).toBe("false");
      expect(outer).not.toHaveBeenCalled();
      // With no panel open, Escape goes through as before
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(outer).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", outer);
    }
  });

  it("lists a source with an unsafe link as text instead of linking it", () => {
    const content = "Docker đóng gói.";
    const unsafe: ChatSource[] = [{ id: "d1", title: "Docker cơ bản", href: "javascript:alert(1)", cited: true }];
    const { container } = render(
      <ChatMarkdown content={content} sources={unsafe} citations={[cite(content, content, ["d1"])]} />
    );
    fireEvent.mouseEnter(container.querySelector("button[aria-controls]") as HTMLElement);
    expect(container.textContent).toContain("Docker cơ bản");
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders links as links again: only citations make chips", () => {
    const { container } = render(<ChatMarkdown content="Xem [Backend](/?topic=be) nhé." />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/?topic=be");
    expect(container.querySelector("button")).toBeNull();
  });
});
