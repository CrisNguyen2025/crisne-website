// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import { DesktopResizeHandle } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/DesktopResizeHandle";
import {
  DESKTOP_DEFAULT_HEIGHT,
  DESKTOP_MIN_HEIGHT,
  toRem,
  useDesktopPanelHeight,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/useDesktopPanelHeight";

const BASE = "/api/roadmap-assistant";

function mockMatchMedia(desktop: boolean, reducedMotion = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches:
        query === "(min-width: 48rem)" || query === "(min-width: 768px)"
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
  offsetY = 24,
  onResize,
}: {
  isOpen?: boolean;
  offsetY?: number;
  onResize?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeProps = useDesktopPanelHeight({
    isOpen,
    offsetY,
    containerRef,
    onResize,
  });

  return (
    <div ref={containerRef} data-testid="panel">
      <DesktopResizeHandle edge="top" {...resizeProps} />
    </div>
  );
}

describe("Desktop 400x650 default size & manual vertical resize", () => {
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

  it("opens at fixed 400x650 default on desktop and does not auto-grow when data fills in", async () => {
    mockMatchMedia(true, true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  `event: done\ndata: ${JSON.stringify({ message: "Nội dung dài\n\n".repeat(40) })}\n\n`
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
    expect(panel.className).toContain("md:w-[25rem]");
    expect(panel.className).toContain("md:h-[40.625rem]");
    expect(panel.style.height).toBe(toRem(DESKTOP_DEFAULT_HEIGHT));
    expect(panel.style.maxHeight).toBe(toRem(852));

    const handle = screen.getByRole("separator", {
      name: "Kéo để thay đổi chiều cao Abot",
    });
    expect(handle.getAttribute("aria-valuenow")).toBe("650");

    fireEvent.click(screen.getByRole("button", { name: "Xem lộ trình" }));
    await screen.findAllByText("Nội dung dài");

    const scroller = container.querySelector(
      "[data-abot-scroll-root]"
    ) as HTMLDivElement;
    expect(scroller.className).toContain("[scrollbar-gutter:stable]");
    expect(panel.style.height).toBe(toRem(DESKTOP_DEFAULT_HEIGHT));
  });

  it("resizes height upward and downward via top drag handle, clamps to bounds, and resets on double click", async () => {
    mockMatchMedia(true, true);
    const onResize = vi.fn();
    render(<Harness onResize={onResize} />);

    const panel = screen.getByTestId("panel");
    const handle = screen.getByRole("separator", {
      name: "Kéo để thay đổi chiều cao Abot",
    });

    expect(panel.style.height).toBe(toRem(650));

    fireEvent.mouseDown(handle, { button: 0, clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 170 });
    expect(panel.style.height).toBe(toRem(780));

    fireEvent.mouseMove(window, { clientY: 20 });
    expect(panel.style.height).toBe(toRem(852));
    fireEvent.mouseUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("852");

    fireEvent.mouseDown(handle, { button: 0, clientY: 100 });
    fireEvent.mouseMove(window, { clientY: 600 });
    expect(panel.style.height).toBe(toRem(DESKTOP_MIN_HEIGHT));
    fireEvent.mouseUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe(String(DESKTOP_MIN_HEIGHT));

    fireEvent.doubleClick(handle);
    expect(panel.style.height).toBe(toRem(DESKTOP_DEFAULT_HEIGHT));
    expect(handle.getAttribute("aria-valuenow")).toBe("650");
    await waitFor(() => expect(onResize).toHaveBeenCalled());
  });

  it("supports keyboard resize and clamps when viewport shrinks", () => {
    mockMatchMedia(true, false);
    render(<Harness />);

    const panel = screen.getByTestId("panel");
    const handle = screen.getByRole("separator", {
      name: "Kéo để thay đổi chiều cao Abot",
    });

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(panel.style.height).toBe(toRem(674));

    fireEvent.keyDown(handle, { key: "End" });
    expect(panel.style.height).toBe(toRem(852));

    Object.defineProperty(window, "innerHeight", { value: 640, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe(toRem(592));
    expect(panel.style.maxHeight).toBe(toRem(592));

    fireEvent.keyDown(handle, { key: "Home" });
    expect(panel.style.height).toBe(toRem(DESKTOP_MIN_HEIGHT));
  });

  it("leaves inline height untouched on mobile viewports (< 768)", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    mockMatchMedia(false);

    render(<Harness />);
    const panel = screen.getByTestId("panel");
    expect(panel.style.height).toBe("");
    expect(panel.style.maxHeight).toBe("");
  });
});
