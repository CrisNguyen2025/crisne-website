// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";

describe("Overlay scroll lock (zero layout shift)", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    vi.restoreAllMocks();
  });

  it("locks page wheel scrolling without mutating body overflow or paddingRight", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} label="Test drawer">
        <div
          data-testid="drawer-scroll"
          style={{ overflowY: "auto", height: "200px" }}
        >
          <div>Content</div>
        </div>
      </Sheet>
    );

    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("");

    const outsideWheel = new WheelEvent("wheel", {
      deltaY: 100,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(outsideWheel);
    expect(outsideWheel.defaultPrevented).toBe(true);

    const scrollEl = document.querySelector('[data-testid="drawer-scroll"]') as HTMLDivElement;
    Object.defineProperty(scrollEl, "scrollHeight", { value: 600, configurable: true });
    Object.defineProperty(scrollEl, "clientHeight", { value: 200, configurable: true });
    scrollEl.scrollTop = 50;

    const insideWheel = new WheelEvent("wheel", {
      deltaY: 40,
      bubbles: true,
      cancelable: true,
    });
    scrollEl.dispatchEvent(insideWheel);
    expect(insideWheel.defaultPrevented).toBe(false);

    scrollEl.scrollTop = 0;
    const atTopWheel = new WheelEvent("wheel", {
      deltaY: -40,
      bubbles: true,
      cancelable: true,
    });
    scrollEl.dispatchEvent(atTopWheel);
    expect(atTopWheel.defaultPrevented).toBe(true);
  });
});
