// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMarkdown } from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { MessageList } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList";
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

  it("portals tooltip outside scroll root, clamps horizontal bounds, flips up near bottom, and closes on scroll out", () => {
    const content = "Docker đóng gói.";
    const { container } = render(
      <div data-abot-overlay-root="">
        <div data-abot-scroll-root="">
          <ChatMarkdown content={content} sources={SOURCES} citations={[cite(content, content, ["d1"])]} />
        </div>
      </div>
    );

    const overlayRoot = container.querySelector("[data-abot-overlay-root]") as HTMLElement;
    const scrollRoot = container.querySelector("[data-abot-scroll-root]") as HTMLElement;
    const chip = container.querySelector("button[aria-controls]") as HTMLElement;
    const chipRoot = chip.parentElement as HTMLElement;

    let chipTop = 605;
    let chipBottom = 625;

    vi.spyOn(overlayRoot, "getBoundingClientRect").mockImplementation(() => ({
      left: 600,
      top: 40,
      right: 1000,
      bottom: 760,
      width: 400,
      height: 720,
      x: 600,
      y: 40,
      toJSON: () => ({}),
    }));
    vi.spyOn(scrollRoot, "getBoundingClientRect").mockImplementation(() => ({
      left: 600,
      top: 88,
      right: 1000,
      bottom: 648,
      width: 400,
      height: 560,
      x: 600,
      y: 88,
      toJSON: () => ({}),
    }));
    vi.spyOn(chipRoot, "getBoundingClientRect").mockImplementation(() => ({
      left: 860,
      top: chipTop,
      right: 980,
      bottom: chipBottom,
      width: 120,
      height: 20,
      x: 860,
      y: chipTop,
      toJSON: () => ({}),
    }));

    fireEvent.mouseEnter(chip);

    const panelId = chip.getAttribute("aria-controls") ?? "";
    const panel = document.getElementById(panelId) as HTMLElement;
    expect(panel).toBeTruthy();
    expect(overlayRoot.contains(panel)).toBe(true);
    expect(scrollRoot.contains(panel)).toBe(false);
    expect(panel.dataset.side).toBe("top");
    expect(Number.parseInt(panel.style.left, 10)).toBeLessThanOrEqual(400 - 192 - 12);

    const link = panel.querySelector("a") as HTMLElement;
    fireEvent.mouseDown(link);
    expect(chip.getAttribute("aria-expanded")).toBe("true");

    chipTop = 680;
    chipBottom = 700;
    fireEvent.scroll(scrollRoot);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps ScrollBottomButton suppressed during auto-follow settle and reveals on manual wheel-up", () => {
    const io: { trigger: ((entries: IntersectionObserverEntry[]) => void) | null } = { trigger: null };
    const OriginalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        io.trigger = (entries) => cb(entries, this as unknown as IntersectionObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    } as unknown as typeof globalThis.IntersectionObserver;

    try {
      const scrollRef = React.createRef<HTMLDivElement>();
      const bottomSentinelRef = React.createRef<HTMLDivElement>();
      const autoFollowRef = { current: true };
      const scrollToBottom = vi.fn();

      const { container } = render(
        <MessageList
          messages={[
            {
              id: "m1",
              role: "assistant",
              content: "Docker đóng gói.",
              timestamp: new Date(),
              sources: SOURCES,
              citations: [cite("Docker đóng gói.", "Docker đóng gói.", ["d1"])],
            },
          ]}
          isLoading={false}
          isStreaming={false}
          runningCode={null}
          expandedTools={{}}
          feedback={{}}
          copiedId={null}
          sendMessage={vi.fn()}
          retry={vi.fn()}
          copyMessage={vi.fn()}
          handleFeedback={vi.fn()}
          handleRunCode={vi.fn()}
          toggleToolExpand={vi.fn()}
          scrollRef={scrollRef}
          bottomSentinelRef={bottomSentinelRef}
          autoFollowRef={autoFollowRef}
          scrollToBottom={scrollToBottom}
        />
      );

      const scrollButton = container.querySelector('button[aria-label="Cuộn xuống cuối"]') as HTMLElement;
      expect(scrollButton.getAttribute("aria-hidden")).toBe("true");

      io.trigger?.([{ isIntersecting: false } as IntersectionObserverEntry]);
      expect(scrollButton.getAttribute("aria-hidden")).toBe("true");

      autoFollowRef.current = false;
      fireEvent.wheel(scrollRef.current as HTMLElement, { deltaY: -40 });
      expect(scrollButton.getAttribute("aria-hidden")).toBe("false");

      fireEvent.click(scrollButton);
      expect(scrollButton.getAttribute("aria-hidden")).toBe("true");
      expect(scrollToBottom).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.IntersectionObserver = OriginalIO;
    }
  });

  it("prevents sibling hijack when pointer crosses stacked row into tooltip, aligns cluster flip, and supports direct click", () => {
    const content = "Docker đóng gói. K8s điều phối.";
    const { container } = render(
      <div data-abot-overlay-root="">
        <div data-abot-scroll-root="">
          <ChatMarkdown
            content={content}
            sources={SOURCES.slice(0, 2)}
            citations={[
              cite(content, "Docker đóng gói.", ["d1"]),
              cite(content, "K8s điều phối.", ["d2"]),
            ]}
          />
        </div>
      </div>
    );

    const overlayRoot = container.querySelector("[data-abot-overlay-root]") as HTMLElement;
    const scrollRoot = container.querySelector("[data-abot-scroll-root]") as HTMLElement;
    const cluster = container.querySelector("[data-source-chips]") as HTMLElement;
    const [row1Chip, row2Chip] = container.querySelectorAll("button[aria-controls]");

    vi.spyOn(overlayRoot, "getBoundingClientRect").mockReturnValue({
      left: 600, top: 40, right: 1000, bottom: 760, width: 400, height: 720, x: 600, y: 40, toJSON: () => ({}),
    });
    vi.spyOn(scrollRoot, "getBoundingClientRect").mockReturnValue({
      left: 600, top: 88, right: 1000, bottom: 648, width: 400, height: 560, x: 600, y: 88, toJSON: () => ({}),
    });
    vi.spyOn(cluster, "getBoundingClientRect").mockReturnValue({
      left: 616, top: 556, right: 980, bottom: 604, width: 364, height: 48, x: 616, y: 556, toJSON: () => ({}),
    });
    vi.spyOn(row1Chip.parentElement as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: 720, top: 556, right: 940, bottom: 576, width: 220, height: 20, x: 720, y: 556, toJSON: () => ({}),
    });
    vi.spyOn(row2Chip.parentElement as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: 616, top: 584, right: 860, bottom: 604, width: 244, height: 20, x: 616, y: 584, toJSON: () => ({}),
    });

    fireEvent.mouseEnter(row1Chip);
    const row1Panel = document.getElementById(row1Chip.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(row1Panel.dataset.side).toBe("top");

    fireEvent.mouseLeave(row1Chip);
    fireEvent.mouseEnter(row2Chip);
    expect(row1Chip.getAttribute("aria-expanded")).toBe("true");
    expect(row2Chip.getAttribute("aria-expanded")).toBe("false");

    fireEvent.mouseLeave(row2Chip);
    fireEvent.mouseEnter(row1Panel);
    expect(row1Chip.getAttribute("aria-expanded")).toBe("true");
    expect(row2Chip.getAttribute("aria-expanded")).toBe("false");

    const anchor = row1Panel.querySelector("a[href]") as HTMLAnchorElement;
    const onAnchorClick = vi.fn((e: MouseEvent) => e.preventDefault());
    anchor.addEventListener("click", onAnchorClick);
    fireEvent.click(row1Chip);
    expect(onAnchorClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(row1Chip.getAttribute("aria-expanded")).toBe("false");

    fireEvent.touchStart(row1Chip);
    fireEvent.mouseEnter(row1Chip);
    fireEvent.click(row1Chip);
    expect(row1Chip.getAttribute("aria-expanded")).toBe("true");
    expect(onAnchorClick).toHaveBeenCalledTimes(1);
  });
});
