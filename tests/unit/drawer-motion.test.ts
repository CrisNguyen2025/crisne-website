// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDrawerMotion } from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/useDrawerMotion";

describe("useDrawerMotion Mobile Gesture & Animation", () => {
  let panel: HTMLDivElement;
  let scrim: HTMLDivElement;
  let panelRef: { current: HTMLDivElement | null };
  let scrimRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    // Mock mobile viewport (< 768px)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    panel = document.createElement("div");
    scrim = document.createElement("div");
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    // Mock bounding rect width = 375px
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      width: 375,
      height: 812,
      top: 0,
      left: 0,
      bottom: 812,
      right: 375,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    panelRef = { current: panel };
    scrimRef = { current: scrim };
  });

  afterEach(() => {
    document.body.removeChild(panel);
    document.body.removeChild(scrim);
    vi.restoreAllMocks();
  });

  const createTouchEvent = (
    type: string,
    clientX: number,
    clientY: number,
    target: EventTarget = panel
  ) => {
    const touch = { clientX, clientY, identifier: 1, target } as unknown as Touch;
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;
    event.touches = type === "touchend" || type === "touchcancel" ? [] : [touch];
    event.changedTouches = [touch];
    return event;
  };

  it("decreases scrim opacity proportionally as drawer is dragged right", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    // Touch start at (10, 100)
    panel.dispatchEvent(createTouchEvent("touchstart", 10, 100));

    // Drag right by 100px: dx = 90px (past COMMIT_PX of 10)
    panel.dispatchEvent(createTouchEvent("touchmove", 100, 100));

    expect(panel.style.transform).toBe("translateX(80px)");
    // Opacity = 1 - 80 / 375 ≈ 0.786
    const opacity = parseFloat(scrim.style.opacity);
    expect(opacity).toBeLessThan(1);
    expect(opacity).toBeGreaterThan(0.7);
  });

  it("snaps back to 0px and restores scrim opacity to 1 on small release", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 100));
    panel.dispatchEvent(createTouchEvent("touchmove", 40, 100)); // dragX = 20px (< 30% of 375 = 112px)
    panel.dispatchEvent(createTouchEvent("touchend", 40, 100));

    expect(panel.style.transform).toBe("translateX(0px)");
    expect(scrim.style.opacity).toBe("1");
    expect(onSwipeClose).not.toHaveBeenCalled();
  });

  it("closes drawer when dragged beyond 30% width", () => {
    vi.useFakeTimers();
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 100));
    // Drag by 150px (dragX = 140px > 375 * 0.3 = 112.5px)
    panel.dispatchEvent(createTouchEvent("touchmove", 150, 100));
    panel.dispatchEvent(createTouchEvent("touchend", 150, 100));

    expect(panel.style.transform).toBe("translateX(100%)");
    expect(scrim.style.opacity).toBe("0");

    vi.advanceTimersByTime(250);
    expect(onSwipeClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("closes drawer on quick flick (> 0.5 px/ms and > 40px) even below 30% ratio", () => {
    vi.useFakeTimers();
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 100));

    // Rapid flick: moves 60px in 30ms (velocity = 50 / 30 ≈ 1.6 px/ms > 0.5)
    now += 30;
    panel.dispatchEvent(createTouchEvent("touchmove", 70, 100));
    panel.dispatchEvent(createTouchEvent("touchend", 70, 100));

    expect(panel.style.transform).toBe("translateX(100%)");
    vi.advanceTimersByTime(250);
    expect(onSwipeClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores gesture when touch starts inside a textarea or input field", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    const textarea = document.createElement("textarea");
    panel.appendChild(textarea);

    textarea.dispatchEvent(createTouchEvent("touchstart", 10, 100, textarea));
    textarea.dispatchEvent(createTouchEvent("touchmove", 100, 100, textarea));

    expect(panel.style.transform).toBe("");
  });

  it("ignores gesture when movement is predominantly vertical (user scrolling messages)", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useDrawerMotion(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 100, 100));
    // Vertical scroll: dy = 60, dx = 15
    panel.dispatchEvent(createTouchEvent("touchmove", 115, 160));

    expect(panel.style.transform).toBe("");
  });
});
