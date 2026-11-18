// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import {
  DESKTOP_MIN_HEIGHT,
  useDesktopGrowHeight,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/useDesktopGrowHeight";

const BASE = "/api/roadmap-assistant";

function mockMatchMedia(desktop: boolean, reducedMotion = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches:
        query === "(min-width: 768px)"
          ? desktop
          : query === "(prefers-reduced-motion: reduce)"
            ? reducedMotion
            : query === "(max-width: 767px)"
              ? !desktop
              : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function Harness({
  isOpen = true,
  isInitStage = false,
  isStreaming = false,
  offsetY = 24,
  onReachCeiling,
}: {
  isOpen?: boolean;
  isInitStage?: boolean;
  isStreaming?: boolean;
  offsetY?: number;
  onReachCeiling?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { contentRef } = useDesktopGrowHeight({
    isOpen,
    isInitStage,
    isStreaming,
    offsetY,
    containerRef,
    scrollRef,
    onReachCeiling,
  });

  return (
    <div ref={containerRef} data-testid="panel">
      <div ref={scrollRef} data-testid="scroller">
        {!isInitStage && <div ref={contentRef} data-testid="content" />}
      </div>
    </div>
  );
}

describe("Desktop progressive height & smooth scroll handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens at fixed 480px on desktop init stage and enables scrollbar-gutter: stable in chat stage", async () => {
    mockMatchMedia(true, true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  'event: done\ndata: {"message":"Trả lời ngắn"}\n\n'
                )
              );
              c.close();
            },
          }),
          { status: 200 }
        )
      )
    );

    const { container } = render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen offsetY={24} />
    );

    const panel = container.querySelector(
      "[data-abot-overlay-root]"
    ) as HTMLDivElement;
    expect(panel.style.height).toBe(`${DESKTOP_MIN_HEIGHT}px`);
    expect(panel.style.maxHeight).toBe("852px");

    fireEvent.click(screen.getByRole("button", { name: "Xem lộ trình" }));
    await screen.findByText("Trả lời ngắn");

    const scroller = container.querySelector(
      "[data-abot-scroll-root]"
    ) as HTMLDivElement;
    expect(scroller.className).toContain("[scrollbar-gutter:stable]");
    expect(scroller.dataset.subCeiling).toBe("true");
    expect(panel.style.height).toBe("480px");
  });

  it("grows progressively with monotonic streaming ratchet and hands off cleanly at full-screen ceiling", () => {
    mockMatchMedia(true, true);
    const onReachCeiling = vi.fn();

    const chromeOffsetH = 480;
    const scrollClientH = 360; // chrome = 120px
    let contentOffsetH = 200; // total = 320px -> clamped to 480px

    const { rerender } = render(
      <Harness isInitStage={false} isStreaming={true} onReachCeiling={onReachCeiling} />
    );

    const panel = screen.getByTestId("panel");
    const scroller = screen.getByTestId("scroller");
    const content = screen.getByTestId("content");

    Object.defineProperty(panel, "offsetHeight", {
      get: () => chromeOffsetH,
      configurable: true,
    });
    Object.defineProperty(scroller, "clientHeight", {
      get: () => scrollClientH,
      configurable: true,
    });
    Object.defineProperty(content, "offsetHeight", {
      get: () => contentOffsetH,
      configurable: true,
    });

    // 1. Medium content (120 chrome + 500 content + 1 sentinel = 621px < 852px ceiling)
    contentOffsetH = 500;
    scroller.scrollTop = 18;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe("621px");
    expect(scroller.dataset.subCeiling).toBe("true");
    // Sub-ceiling phase locks scrollTop at 0 to eliminate double-motion bounce
    expect(scroller.scrollTop).toBe(0);
    expect(onReachCeiling).not.toHaveBeenCalled();

    // 2. Monotonic ratchet while streaming: temporary dip in content height does not shrink panel
    contentOffsetH = 460;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe("621px");

    // 3. Content crosses full-screen ceiling (120 + 820 + 1 = 941px -> clamped to 852px)
    contentOffsetH = 820;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe("852px");
    expect(scroller.dataset.subCeiling).toBe("false");
    expect(onReachCeiling).toHaveBeenCalledTimes(1);

    // 4. Resetting to init stage returns height to 480px immediately
    rerender(
      <Harness isInitStage={true} isStreaming={false} onReachCeiling={onReachCeiling} />
    );
    expect(panel.style.height).toBe("480px");
  });

  it("snaps height immediately to 480px and replays init entrance on new conversation without shrink rAF", () => {
    mockMatchMedia(true, false);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    const { rerender } = render(<Harness isInitStage={false} />);
    const panel = screen.getByTestId("panel") as HTMLDivElement;
    const scroller = screen.getByTestId("scroller") as HTMLDivElement;
    const content = screen.getByTestId("content") as HTMLDivElement;

    Object.defineProperty(panel, "offsetHeight", {
      get: () => 480,
      configurable: true,
    });
    Object.defineProperty(scroller, "clientHeight", {
      get: () => 360,
      configurable: true,
    });
    Object.defineProperty(content, "offsetHeight", {
      get: () => 820,
      configurable: true,
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    const animateMock = vi.fn();
    panel.animate = animateMock;
    rafSpy.mockClear();

    rerender(<Harness isInitStage={true} />);

    // Snaps straight to 480px with no shrink rAF loop, and plays the crisp init fade+zoom entrance
    expect(panel.style.height).toBe("480px");
    expect(rafSpy).not.toHaveBeenCalled();
    expect(animateMock).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "scale(0.95)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      expect.objectContaining({ duration: 200 })
    );
  });

  it("leaves inline height untouched on mobile viewports (< 768px)", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    mockMatchMedia(false);

    render(<Harness isInitStage={false} />);
    const panel = screen.getByTestId("panel");
    expect(panel.style.height).toBe("");
    expect(panel.style.maxHeight).toBe("");
  });
});
