// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NewsItemDto } from "@/lib/news/schemas";
import * as newsService from "@/logic/news/newsService";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { ToastProvider } from "@/components/ui/toast";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFeedClient } from "@/components/news/NewsFeedClient";
import { NewsReaderPanel } from "@/components/news/NewsReaderPanel";
import { QuickPasteDialog } from "@/components/news/QuickPasteDialog";
import { SourcesManagerSheet } from "@/components/news/SourcesManagerSheet";

function makeItem(overrides: Partial<NewsItemDto> = {}): NewsItemDto {
  return {
    id: "news-1",
    sourceUrl: "https://youtube.com/watch?v=abc",
    canonicalUrl: "https://youtube.com/watch?v=abc",
    domain: "youtube.com",
    platform: "youtube",
    origin: "share",
    sourceId: null,
    title: "Kiến trúc AI Agent đơn giản cho production",
    author: "Anthropic",
    thumbnailUrl: null,
    tldr: "Ưu tiên workflow đơn giản và structured JSON trước khi thêm agent phức tạp.",
    takeaways: ["Dùng schema rõ ràng.", "Chỉ leo thang chi phí khi cần."],
    tags: ["ai", "architecture"],
    personalNote: null,
    ingestStatus: "ready",
    reviewStatus: "published",
    readState: "unread",
    isSaved: false,
    extractionMethod: "captions",
    extractionError: null,
    possibleDuplicateOfId: null,
    publishedAt: "2026-11-22T07:00:00.000Z",
    createdAt: "2026-11-22T07:00:00.000Z",
    updatedAt: "2026-11-22T07:00:00.000Z",
    ...overrides,
  };
}

describe("news feed UI components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a NewsCard row with contentType label and has no quick actions", () => {
    const item = makeItem({ tags: ["tip", "ai", "architecture"] });
    const onSelect = vi.fn();

    render(<NewsCard item={item} onSelect={onSelect} />);

    expect(screen.getByText(item.title)).toBeTruthy();
    expect(screen.getByText(item.tldr!)).toBeTruthy();
    expect(screen.getByText("Mẹo")).toBeTruthy();
    expect(screen.getByLabelText("Chưa đọc")).toBeTruthy();
    // The title button stretches over the whole row, so it is the row's only control
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: item.title }));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("shows the URL and the error status for a failed item", () => {
    const failedItem = makeItem({
      title: "https://medium.com/@dev/postgres-indexing",
      ingestStatus: "failed",
      tldr: null,
      extractionError: "Trang yêu cầu đăng nhập",
    });

    render(<NewsCard item={failedItem} onSelect={vi.fn()} />);

    expect(screen.getByText("medium.com/@dev/postgres-indexing")).toBeTruthy();
    expect(screen.getByText("Lỗi")).toBeTruthy();
    expect(screen.getByText("Trang yêu cầu đăng nhập")).toBeTruthy();
  });

  function renderPanel(item: NewsItemDto, overrides: Partial<React.ComponentProps<typeof NewsReaderPanel>> = {}) {
    const props: React.ComponentProps<typeof NewsReaderPanel> = {
      item,
      onBack: vi.fn(),
      onToggleRead: vi.fn(),
      onToggleSave: vi.fn(),
      onDismiss: vi.fn(),
      onReopen: vi.fn(),
      onDelete: vi.fn(),
      onUpdateTags: vi.fn(async () => {}),
      onSaveNote: vi.fn(async () => {}),
      onOpenExternal: vi.fn(),
      ...overrides,
    };
    return { props, ...render(<NewsReaderPanel {...props} />) };
  }

  it("renders NewsReaderPanel details, thumbnail, 2-step delete, and tag/note editing", async () => {
    const item = makeItem({
      possibleDuplicateOfId: "news-0",
      personalNote: "Note cũ",
      thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      tags: ["tutorial", "ai", "architecture"],
    });
    const onUpdateTags = vi.fn(async () => {});
    const onSaveNote = vi.fn(async () => {});
    const onDelete = vi.fn();

    renderPanel(item, {
      duplicateTitle: "Bài viết tương tự trước đó",
      onUpdateTags,
      onSaveNote,
      onDelete,
    });

    expect(screen.getByText("via Captions")).toBeTruthy();
    expect(screen.getByText("Hướng dẫn")).toBeTruthy();
    expect(screen.getByAltText(item.title)).toBeTruthy();
    expect(screen.getByText("Bài viết tương tự trước đó")).toBeTruthy();
    expect(screen.getByText("Dùng schema rõ ràng.")).toBeTruthy();

    // Remove existing tag
    fireEvent.click(screen.getByRole("button", { name: "Xoá tag ai" }));
    expect(onUpdateTags).toHaveBeenCalledWith(item, ["tutorial", "architecture"]);

    // Add new tag
    const tagInput = screen.getByPlaceholderText("Thêm tag (vd: ai, nextjs)...");
    fireEvent.change(tagInput, { target: { value: "LLM" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    await waitFor(() => {
      expect(onUpdateTags).toHaveBeenCalledWith(item, ["tutorial", "ai", "architecture", "llm"]);
    });

    // Edit & save personalNote
    const noteBox = screen.getByLabelText("Ghi chú cá nhân");
    fireEvent.change(noteBox, { target: { value: "Áp dụng cho pipeline ingest" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledWith(item, "Áp dụng cho pipeline ingest");
    });

    // 2-step delete confirmation
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá" }));
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("offers Lưu + Bỏ qua for inbox items and Đưa lại Chờ xử lý for saved/dismissed items", () => {
    const inboxItem = makeItem();
    const { props: inboxProps } = renderPanel(inboxItem);
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(inboxProps.onToggleSave).toHaveBeenCalledWith(inboxItem);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    expect(inboxProps.onDismiss).toHaveBeenCalledWith(inboxItem);
    cleanup();

    const savedItem = makeItem({ isSaved: true });
    const { props: savedProps } = renderPanel(savedItem);
    fireEvent.click(screen.getByRole("button", { name: "Đã lưu" }));
    expect(savedProps.onToggleSave).toHaveBeenCalledWith(savedItem);
    fireEvent.click(screen.getByRole("button", { name: "Đưa lại Chờ xử lý" }));
    expect(savedProps.onReopen).toHaveBeenCalledWith(savedItem);
    cleanup();

    const dismissedItem = makeItem({ reviewStatus: "dismissed" });
    const { props: dismissedProps } = renderPanel(dismissedItem);
    expect(screen.queryByRole("button", { name: "Bỏ qua" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Đưa lại Chờ xử lý" }));
    expect(dismissedProps.onReopen).toHaveBeenCalledWith(dismissedItem);
  });

  it("auto-marks an item read after 3s even when polling re-renders it with new objects", () => {
    vi.useFakeTimers();
    try {
      const onToggleRead = vi.fn();
      const panelProps = (title: string): React.ComponentProps<typeof NewsReaderPanel> => ({
        item: makeItem({ title }),
        onBack: vi.fn(),
        onToggleRead: (item: NewsItemDto, next: "read" | "unread") => onToggleRead(item, next),
        onToggleSave: vi.fn(),
        onDismiss: vi.fn(),
        onReopen: vi.fn(),
        onDelete: vi.fn(),
        onUpdateTags: vi.fn(async () => {}),
        onSaveNote: vi.fn(async () => {}),
        onOpenExternal: vi.fn(),
      });

      const { rerender } = render(<NewsReaderPanel {...panelProps("Bản 1")} />);
      // A feed poll every 2s delivers a fresh item object and a fresh callback
      vi.advanceTimersByTime(2_000);
      rerender(<NewsReaderPanel {...panelProps("Bản 2")} />);
      vi.advanceTimersByTime(900);
      expect(onToggleRead).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);

      expect(onToggleRead).toHaveBeenCalledTimes(1);
      expect(onToggleRead).toHaveBeenCalledWith(
        expect.objectContaining({ id: "news-1", title: "Bản 2" }),
        "read"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismisses and saves items from the feed panel, moves on, and supports Tải thêm", async () => {
    const draft = makeItem({ id: "draft-1", title: "Bài RSS chờ duyệt", origin: "cron", reviewStatus: "draft" });
    const next = makeItem({ id: "news-2", title: "Bài kế tiếp" });
    const counts = {
      total: 3, queued: 0, processing: 0, ready: 3, partial: 0, failed: 0,
      draft: 1, unread: 2, saved: 0, dismissed: 0, queue: 0, inbox: 3, done: 0,
    };
    // jsdom has no matchMedia; report a wide screen so list and reader render side by side
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const updateSpy = vi
      .spyOn(newsService, "updateNewsItem")
      .mockImplementation(async (id) => ({ item: id === draft.id ? draft : next }));
    const fetchSpy = vi.spyOn(newsService, "fetchNewsFeed").mockResolvedValue({
      items: [draft, next], counts, tags: [], duplicateTitles: {}, hasMore: true,
    });

    render(
      <NuqsTestingAdapter>
        <ToastProvider>
          <NewsFeedClient
            initialData={{ items: [draft, next], counts, tags: [], duplicateTitles: {}, hasMore: true }}
            initialParams={{ view: "inbox", sort: "latest" }}
          />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Bài RSS chờ duyệt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("draft-1", { reviewStatus: "dismissed", isSaved: false });
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Bài kế tiếp" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("news-2", { isSaved: true });
    });

    fireEvent.click(screen.getByRole("button", { name: "Tải thêm" }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 120 }));
    });
  });

  it("keeps the new tab's list when a slow refresh of the old tab resolves later", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const pending = makeItem({ id: "pending-1", title: "Bài chờ xử lý" });
    const saved = makeItem({ id: "saved-1", title: "Bài đã lưu", isSaved: true });
    const counts = {
      total: 2, queued: 0, processing: 0, ready: 2, partial: 0, failed: 0,
      draft: 0, unread: 2, saved: 1, dismissed: 0, queue: 0, inbox: 1, done: 1,
    };
    const feedOf = (items: NewsItemDto[]) => ({ items, counts, tags: [], duplicateTitles: {}, hasMore: false });

    let resolveSlowInbox: (value: ReturnType<typeof feedOf>) => void = () => {};
    vi.spyOn(newsService, "updateNewsItem").mockResolvedValue({ item: pending });
    vi.spyOn(newsService, "fetchNewsFeed").mockImplementation((params) =>
      params?.view === "saved"
        ? Promise.resolve(feedOf([saved]))
        : new Promise((resolve) => {
            resolveSlowInbox = resolve;
          })
    );

    render(
      <NuqsTestingAdapter hasMemory>
        <ToastProvider>
          <NewsFeedClient initialData={feedOf([pending])} initialParams={{ view: "inbox", sort: "latest" }} />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    // Dismissing an item starts a refresh of the inbox that is still in flight...
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    await waitFor(() => expect(newsService.fetchNewsFeed).toHaveBeenCalledTimes(1));
    // ...when the Owner switches to the saved tab
    fireEvent.click(screen.getByRole("button", { name: /^Đã lưu\s*1$/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Bài đã lưu" })).toBeTruthy();

    resolveSlowInbox(feedOf([pending]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("heading", { level: 1, name: "Bài đã lưu" })).toBeTruthy();
    expect(screen.queryByText("Bài chờ xử lý")).toBeNull();
    // The stale inbox response was dropped, so the saved tab never had to be fetched again
    const savedFetches = vi
      .mocked(newsService.fetchNewsFeed)
      .mock.calls.filter(([params]) => params?.view === "saved");
    expect(savedFetches).toHaveLength(1);
  });

  it("shows error banner without skeleton when switching tabs fails", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const pending = makeItem({ id: "pending-1", title: "Bài chờ xử lý" });
    const counts = {
      total: 2, queued: 0, processing: 0, ready: 2, partial: 0, failed: 0,
      draft: 0, unread: 2, saved: 1, dismissed: 0, queue: 0, inbox: 1, done: 1,
    };
    vi.spyOn(newsService, "fetchNewsFeed").mockRejectedValue(new Error("Mạng gián đoạn"));

    render(
      <NuqsTestingAdapter hasMemory>
        <ToastProvider>
          <NewsFeedClient
            initialData={{ items: [pending], counts, tags: [], duplicateTitles: {}, hasMore: false }}
            initialParams={{ view: "inbox", sort: "latest" }}
          />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    fireEvent.click(screen.getByRole("button", { name: /^Đã lưu\s*1$/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Mạng gián đoạn")).toBeTruthy();
    expect(screen.queryByLabelText("Đang tải bài")).toBeNull();
  });

  it("submits pasted URLs in QuickPasteDialog and closes modal on success", async () => {
    const queuedItem = makeItem({ id: "news-new", domain: "github.com" });
    const ingestSpy = vi
      .spyOn(newsService, "ingestNewsUrl")
      .mockResolvedValue({ status: "queued", item: queuedItem, jobId: "job-1" });
    const onIngested = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickPasteDialog open={true} onClose={onClose} onIngested={onIngested} />
    );

    const textarea = screen.getByLabelText("Danh sách URL");
    fireEvent.change(textarea, {
      target: { value: "https://github.com/vercel/next.js" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đưa vào hàng đợi" }));

    await waitFor(() => {
      expect(ingestSpy).toHaveBeenCalledWith({
        url: "https://github.com/vercel/next.js",
        origin: "manual",
        forceDeep: false,
      });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(onIngested).toHaveBeenCalledTimes(1);
  });

  it("keeps QuickPasteDialog open and shows error when ingest fails", async () => {
    vi.spyOn(newsService, "ingestNewsUrl").mockRejectedValue(
      new Error("Domain chưa nằm trong whitelist")
    );
    const onIngested = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickPasteDialog open={true} onClose={onClose} onIngested={onIngested} />
    );

    fireEvent.change(screen.getByLabelText("Danh sách URL"), {
      target: { value: "https://example.com/post" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đưa vào hàng đợi" }));

    expect(await screen.findByText("Domain chưa nằm trong whitelist")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onIngested).not.toHaveBeenCalled();
  });

  it("renders SourcesManagerSheet, creates a source, and triggers manual cron sync", async () => {
    const sampleSource = {
      id: "src-1",
      name: "Vercel Blog",
      feedUrl: "https://vercel.com/atom",
      domain: "vercel.com",
      enabled: true,
      defaultTags: ["nextjs"],
      lastFetchedAt: null,
      lastError: null,
      createdAt: "2026-11-22T07:00:00.000Z",
      updatedAt: "2026-11-22T07:00:00.000Z",
    };

    const createSpy = vi
      .spyOn(newsService, "createNewsSource")
      .mockResolvedValue({ source: sampleSource });
    vi.spyOn(newsService, "fetchNewsSources").mockResolvedValue({
      sources: [sampleSource],
    });
    const syncSpy = vi.spyOn(newsService, "triggerNewsCronSync").mockResolvedValue({
      sourcesProcessed: 1,
      totalQueued: 2,
      totalDuplicates: 0,
      results: [
        {
          sourceId: "src-1",
          sourceName: "Vercel Blog",
          queued: 2,
          duplicates: 0,
          skippedErrors: 1,
          error: null,
        },
      ],
    });
    const onChanged = vi.fn();

    render(
      <SourcesManagerSheet
        open={true}
        initialSources={[]}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    );

    fireEvent.change(screen.getByLabelText("Tên nguồn"), {
      target: { value: "Vercel Blog" },
    });
    fireEvent.change(screen.getByLabelText("RSS / Atom Feed URL"), {
      target: { value: "https://vercel.com/atom" },
    });
    fireEvent.change(screen.getByLabelText("Tags mặc định (phân tách dấu phẩy)"), {
      target: { value: "NextJS, Frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Thêm nguồn" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: "Vercel Blog",
        feedUrl: "https://vercel.com/atom",
        domain: undefined,
        enabled: true,
        defaultTags: ["nextjs", "frontend"],
      });
    });

    // The list renders only after reloadSources() resolves, which is after createNewsSource()
    expect(await screen.findByText("Vercel Blog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Quét tất cả ngay" }));
    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({});
      expect(onChanged).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/1 link bị bỏ qua/)).toBeTruthy();
  });
});
