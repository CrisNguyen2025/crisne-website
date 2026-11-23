// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MobileNewsDrawer } from "@/components/news/MobileNewsDrawer";
import { NewsFeedClient } from "@/components/news/NewsFeedClient";
import { ToastProvider } from "@/components/ui/toast";
import { useSwipeDrawer } from "@/hooks/use-swipe-drawer";
import type { NewsItemDto } from "@/lib/news/schemas";

function createTouchEvent(
  type: string,
  clientX: number,
  clientY: number,
  target: EventTarget
): Event {
  const touch = { clientX, clientY, identifier: 1, target } as unknown as Touch;
  const event = new Event(type, { bubbles: true, cancelable: true });
  return Object.assign(event, {
    touches: type === "touchend" || type === "touchcancel" ? [] : [touch],
    changedTouches: [touch],
  });
}

function makeItem(overrides: Partial<NewsItemDto> = {}): NewsItemDto {
  return {
    id: "news-1",
    slug: null,
    sourceUrl: "https://youtube.com/watch?v=abc",
    canonicalUrl: "https://youtube.com/watch?v=abc",
    domain: "youtube.com",
    platform: "youtube",
    origin: "share",
    sourceId: null,
    title: "Bài đọc mobile swipe drawer",
    author: "Cris",
    thumbnailUrl: null,
    tldr: "Tóm tắt ngắn gọn cho giao diện đọc trên điện thoại.",
    takeaways: ["Vuốt sang phải để đóng bài."],
    tags: ["mobile", "ux"],
    personalNote: null,
    ingestStatus: "ready",
    reviewStatus: "published",
    readState: "unread",
    isSaved: false,
    isPublic: false,
    publicAt: null,
    extractionMethod: "captions",
    extractionError: null,
    possibleDuplicateOfId: null,
    publishedAt: "2026-11-22T07:00:00.000Z",
    createdAt: "2026-11-22T07:00:00.000Z",
    updatedAt: "2026-11-22T07:00:00.000Z",
    ...overrides,
  };
}

function mockMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe("useSwipeDrawer", () => {
  let panel: HTMLDivElement;
  let scrim: HTMLDivElement;
  let panelRef: { current: HTMLDivElement | null };
  let scrimRef: { current: HTMLDivElement | null };

  beforeEach(() => {
    mockMobileViewport();
    panel = document.createElement("div");
    scrim = document.createElement("div");
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

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
    vi.useRealTimers();
    panel.remove();
    scrim.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tracks horizontal right drag on panel transform and scrim opacity", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useSwipeDrawer(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchmove", 100, 120, panel));

    expect(panel.style.transform).toBe("translateX(80px)");
    const opacity = parseFloat(scrim.style.opacity);
    expect(opacity).toBeCloseTo(1 - 80 / 375, 3);
  });

  it("snaps back on short slow release and clears inline transform after snap settles", () => {
    vi.useFakeTimers();
    const onSwipeClose = vi.fn();
    renderHook(() => useSwipeDrawer(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchmove", 50, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchend", 50, 120, panel));

    expect(panel.style.transform).toBe("translateX(0px)");
    expect(scrim.style.opacity).toBe("1");
    expect(onSwipeClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(panel.style.transform).toBe("");
    expect(scrim.style.opacity).toBe("");
  });

  it("slides out and triggers close when dragged past 30% width", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useSwipeDrawer(panelRef, scrimRef, true, onSwipeClose));

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchmove", 150, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchend", 150, 120, panel));

    expect(panel.style.transform).toBe("translateX(100%)");
    expect(scrim.style.opacity).toBe("0");
    expect(onSwipeClose).toHaveBeenCalledTimes(1);
  });

  it("triggers close on quick flick even below 30% width", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useSwipeDrawer(panelRef, scrimRef, true, onSwipeClose));

    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    panel.dispatchEvent(createTouchEvent("touchstart", 10, 120, panel));
    now += 30;
    panel.dispatchEvent(createTouchEvent("touchmove", 70, 120, panel));
    panel.dispatchEvent(createTouchEvent("touchend", 70, 120, panel));

    expect(panel.style.transform).toBe("translateX(100%)");
    expect(onSwipeClose).toHaveBeenCalledTimes(1);
  });

  it("ignores swipe starts in form inputs, no-swipe zones, horizontal scrollers, and vertical scrolls", () => {
    const onSwipeClose = vi.fn();
    renderHook(() => useSwipeDrawer(panelRef, scrimRef, true, onSwipeClose));

    const textarea = document.createElement("textarea");
    panel.appendChild(textarea);
    textarea.dispatchEvent(createTouchEvent("touchstart", 10, 100, textarea));
    textarea.dispatchEvent(createTouchEvent("touchmove", 140, 100, textarea));
    expect(panel.style.transform).toBe("");

    const lockedZone = document.createElement("div");
    lockedZone.setAttribute("data-no-swipe", "true");
    panel.appendChild(lockedZone);
    lockedZone.dispatchEvent(createTouchEvent("touchstart", 10, 100, lockedZone));
    lockedZone.dispatchEvent(createTouchEvent("touchmove", 140, 100, lockedZone));
    expect(panel.style.transform).toBe("");

    const scroller = document.createElement("pre");
    scroller.style.overflowX = "auto";
    Object.defineProperty(scroller, "scrollWidth", { value: 600 });
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    panel.appendChild(scroller);
    scroller.dispatchEvent(createTouchEvent("touchstart", 10, 100, scroller));
    scroller.dispatchEvent(createTouchEvent("touchmove", 140, 100, scroller));
    expect(panel.style.transform).toBe("");

    panel.dispatchEvent(createTouchEvent("touchstart", 100, 100, panel));
    panel.dispatchEvent(createTouchEvent("touchmove", 115, 160, panel));
    expect(panel.style.transform).toBe("");
    expect(onSwipeClose).not.toHaveBeenCalled();
  });
});

describe("MobileNewsDrawer & NewsFeedClient mobile swipe UX", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps drawer content mounted during exit animation and drops dialog role right away", () => {
    vi.useFakeTimers();
    mockMobileViewport();
    const item = makeItem();
    const onClose = vi.fn();

    const { rerender } = render(
      <MobileNewsDrawer open={true} item={item} label={(row) => row.title} onClose={onClose}>
        {(row) => <article>{row.title}</article>}
      </MobileNewsDrawer>
    );

    const dialog = screen.getByRole("dialog", { name: item.title });
    expect(dialog.className).toContain("touch-pan-y");
    expect(screen.getByText(item.title)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <MobileNewsDrawer open={false} item={item} label={(row) => row.title} onClose={onClose}>
        {(row) => <article>{row.title}</article>}
      </MobileNewsDrawer>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(item.title)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByText(item.title)).toBeNull();
  });

  it("opens News post in a swipe-to-close drawer on mobile and preserves list scroll position", () => {
    vi.useFakeTimers();
    mockMobileViewport();

    const first = makeItem({ id: "news-1", title: "Bài mở bằng drawer" });
    const second = makeItem({ id: "news-2", title: "Bài thứ hai trong danh sách" });
    const counts = {
      total: 2,
      queued: 0,
      processing: 0,
      ready: 2,
      partial: 0,
      failed: 0,
      draft: 0,
      unread: 2,
      saved: 0,
      dismissed: 0,
      queue: 0,
      inbox: 2,
      done: 0,
    };

    render(
      <NuqsTestingAdapter hasMemory>
        <ToastProvider>
          <NewsFeedClient
            initialData={{
              items: [first, second],
              counts,
              tags: [],
              duplicateTitles: {},
              hasMore: false,
            }}
            initialParams={{ view: "inbox", sort: "latest" }}
          />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    const listSection = screen.getByLabelText("Danh sách tin");
    const scroller = listSection.querySelector("div.overflow-y-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    scroller.scrollTop = 260;

    fireEvent.click(screen.getByRole("button", { name: first.title }));

    const dialog = screen.getByRole("dialog", { name: first.title });
    expect(dialog).toBeTruthy();
    expect(listSection.getAttribute("aria-hidden")).toBe("true");
    expect(listSection.hasAttribute("inert")).toBe(true);
    expect(scroller.scrollTop).toBe(260);

    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      width: 390,
      height: 844,
      top: 0,
      left: 0,
      bottom: 844,
      right: 390,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    act(() => {
      dialog.dispatchEvent(createTouchEvent("touchstart", 12, 200, dialog));
      dialog.dispatchEvent(createTouchEvent("touchmove", 190, 204, dialog));
      dialog.dispatchEvent(createTouchEvent("touchend", 190, 204, dialog));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(listSection.getAttribute("aria-hidden")).toBeNull();
    expect(listSection.hasAttribute("inert")).toBe(false);
    expect(scroller.scrollTop).toBe(260);

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(screen.queryByRole("button", { name: "Danh sách" })).toBeNull();
  });
});
