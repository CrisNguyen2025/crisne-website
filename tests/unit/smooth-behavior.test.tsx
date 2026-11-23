// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { NewsItemDto } from "@/lib/news/schemas";
import { getScrollBehavior } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { ActionMenu } from "@/components/ui/action-menu";
import { ImagePreview } from "@/components/ui/image-preview";
import { ToastProvider } from "@/components/ui/toast";
import { CreateTopicModal } from "@/components/roadmap/CreateTopicModal";
import { LectureShell } from "@/components/roadmap/LectureShell";
import { MobileTocDropdown } from "@/components/roadmap/LectureToc";
import { NewsDecisionBar } from "@/components/news/NewsDecisionBar";
import { NewsFeedClient } from "@/components/news/NewsFeedClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => {
    const props = { ...rest };
    delete props.prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

function makeNewsItem(overrides: Partial<NewsItemDto> = {}): NewsItemDto {
  return {
    id: "news-1",
    sourceUrl: "https://youtube.com/watch?v=abc",
    canonicalUrl: "https://youtube.com/watch?v=abc",
    domain: "youtube.com",
    platform: "youtube",
    origin: "share",
    sourceId: null,
    title: "Kiến trúc AI Agent đơn giản",
    author: "Anthropic",
    thumbnailUrl: null,
    tldr: "Tóm tắt ngắn gọn.",
    takeaways: ["Ý 1"],
    tags: ["ai"],
    personalNote: null,
    slug: null,
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

describe("Behavior Smooth enhancements", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    document.body.style.overflow = "";
  });

  it("respects prefers-reduced-motion in getScrollBehavior", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(getScrollBehavior()).toBe("auto");

    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(getScrollBehavior()).toBe("smooth");
  });

  it("animates Dialog exit smoothly while immediately dropping dialog role and locking pointer events", () => {
    vi.useFakeTimers();
    const onAfterClose = vi.fn();

    const { rerender } = render(
      <Dialog open={true} onClose={vi.fn()} onAfterClose={onAfterClose} title="Tiêu đề">
        <p>Nội dung modal</p>
      </Dialog>
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Nội dung modal")).toBeTruthy();

    rerender(
      <Dialog open={false} onClose={vi.fn()} onAfterClose={onAfterClose} title="Tiêu đề">
        <p>Nội dung modal</p>
      </Dialog>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Nội dung modal")).toBeTruthy();
    expect(onAfterClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(onAfterClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Nội dung modal")).toBeNull();
  });

  it("keeps CreateTopicModal mounted during exit animation and resets inputs on reopen", () => {
    vi.useFakeTimers();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <CreateTopicModal
            isOpen={open}
            onClose={() => setOpen(false)}
            onSubmit={vi.fn(async () => {})}
          />
        </>
      );
    }

    render(<Harness />);
    const input = screen.getByPlaceholderText("ví dụ: AI Engineering") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Topic nháp" } });
    expect(input.value).toBe("Topic nháp");

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByDisplayValue("Topic nháp")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.queryByDisplayValue("Topic nháp")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    const freshInput = screen.getByPlaceholderText("ví dụ: AI Engineering") as HTMLInputElement;
    expect(freshInput.value).toBe("");
  });

  it("animates ActionMenu exit from trigger origin and clears danger confirm after closing", () => {
    vi.useFakeTimers();

    render(
      <ActionMenu
        align="end"
        items={[
          {
            label: "Xoá mục",
            danger: true,
            confirm: { title: "Chắc chắn xoá?", confirmLabel: "Xoá" },
            onSelect: vi.fn(),
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("origin-top-right");

    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá mục" }));
    expect(screen.getByText("Chắc chắn xoá?")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Chắc chắn xoá?")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByText("Chắc chắn xoá?")).toBeNull();
  });

  it("locks scroll in ImagePreview without mutating body overflow and fades out smoothly", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <ImagePreview src="/img.png" alt="Minh hoạ" visible={true} onClose={vi.fn()} />
    );

    expect(document.body.style.overflow).toBe("");
    expect(screen.getByAltText("Minh hoạ")).toBeTruthy();

    rerender(
      <ImagePreview src="/img.png" alt="Minh hoạ" visible={false} onClose={vi.fn()} />
    );
    expect(screen.getByAltText("Minh hoạ")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.queryByAltText("Minh hoạ")).toBeNull();
  });

  it("keeps MobileTocDropdown mounted for exit transition and uses getScrollBehavior", () => {
    vi.useFakeTimers();
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    render(
      <MobileTocDropdown
        headings={[{ id: "h-1", text: "Mục đầu", level: 2 }]}
        activeHeadingId="h-1"
        onJump={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "On this page" }));
    expect(screen.getByText("Lên đầu trang ↑")).toBeTruthy();

    fireEvent.click(screen.getByText("Lên đầu trang ↑"));
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(screen.getByText("Lên đầu trang ↑")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("Lên đầu trang ↑")).toBeNull();
  });

  it("frames the active lesson in LectureShell mobile drawer when opened", () => {
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(
      <LectureShell
        topic={{ id: "t-1", slug: "ai", title: "AI", order: 0 }}
        siblingGroups={[
          {
            section: null,
            items: [
              {
                id: "l-1",
                slug: "lesson-1",
                title: "Bài 1",
                description: "",
                section: null,
                order: 0,
                createdAt: "2026-11-22T00:00:00.000Z",
                updatedAt: "2026-11-22T00:00:00.000Z",
              },
            ],
          },
        ]}
        activeView="lesson"
        activeLessonId="l-1"
        defaultOpenSectionKey="__none__"
        canWrite={false}
        ownerStatusById={{}}
        headings={[]}
      >
        <p>Body</p>
      </LectureShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Mở danh sách bài học" }));
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
    rafSpy.mockRestore();
  });

  it("shows spinner only on the triggered NewsDecisionBar action while busy", () => {
    const item = makeNewsItem();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <NewsDecisionBar
        item={item}
        isBusy={false}
        onToggleSave={vi.fn()}
        onDismiss={onDismiss}
        onReopen={vi.fn()}
      />
    );

    const dismissBtn = screen.getByRole("button", { name: "Bỏ qua" });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith(item);

    rerender(
      <NewsDecisionBar
        item={item}
        isBusy={true}
        onToggleSave={vi.fn()}
        onDismiss={onDismiss}
        onReopen={vi.fn()}
      />
    );

    const saveBtn = screen.getByRole("button", { name: "Lưu" });
    expect(dismissBtn.querySelector(".animate-spin")).toBeTruthy();
    expect(saveBtn.querySelector(".animate-spin")).toBeNull();
  });

  it("restores narrow list scroll position when returning from News reader and clears search with X", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const item1 = makeNewsItem({ id: "news-1", title: "Bài một" });
    const item2 = makeNewsItem({ id: "news-2", title: "Bài hai" });
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

    const { container } = render(
      <NuqsTestingAdapter>
        <ToastProvider>
          <NewsFeedClient
            initialData={{ items: [item1, item2], counts, tags: [], duplicateTitles: {} }}
            initialParams={{ view: "inbox", sort: "latest" }}
          />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    const searchInput = screen.getByLabelText("Tìm kiếm bài tin") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "agent" } });
    const clearBtn = screen.getByRole("button", { name: "Xoá từ khoá" });
    fireEvent.click(clearBtn);
    expect(searchInput.value).toBe("");

    const listEl = container.querySelector('section[aria-label="Danh sách tin"] div.overflow-y-auto') as HTMLDivElement;
    expect(listEl).toBeTruthy();
    listEl.scrollTop = 320;

    fireEvent.click(screen.getByRole("button", { name: "Bài một" }));
    expect(screen.getByRole("button", { name: /Danh sách/ })).toBeTruthy();

    listEl.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: /Danh sách/ }));
    expect(listEl.scrollTop).toBe(320);

    fireEvent.keyDown(window, { key: "j" });
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});
