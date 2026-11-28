// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NewsItemDto, NewsSourceDto, NewsSourcePreviewDto } from "@/lib/news/schemas";
import { NEWS_CRON_SCHEDULE } from "@/lib/news/cron-schedule";
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
    slug: null,
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
      onToggleRead: vi.fn(),
      onToggleSave: vi.fn(),
      onDismiss: vi.fn(),
      onReopen: vi.fn(),
      onDelete: vi.fn(),
      onUpdateTags: vi.fn(async () => {}),
      onOpenExternal: vi.fn(),
      ...overrides,
    };
    return { props, ...render(<NewsReaderPanel {...props} />) };
  }

  it("shows a retry button only for failed or partial items with an extraction error", () => {
    const failed = makeItem({
      ingestStatus: "partial",
      tldr: null,
      extractionMethod: "metadata_only",
      extractionError: "Metadata: ERROR: Unsupported URL",
    });
    const onRetry = vi.fn();
    renderPanel(failed, { onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledWith(failed);

    cleanup();
    renderPanel(failed, { onRetry, isRetrying: true });
    const pending = screen.getByRole("button", { name: "Đang gửi lại" }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);

    cleanup();
    renderPanel(makeItem({ ingestStatus: "queued", extractionError: "Lỗi cũ" }), { onRetry });
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();

    cleanup();
    renderPanel(failed);
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("reingestNewsItem posts to the reingest route without forcing deep extraction", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ item: makeItem(), jobId: "job-2" }), { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await newsService.reingestNewsItem("news 1", false);
      expect(result.jobId).toBe("job-2");
      expect(fetchMock).toHaveBeenCalledWith("/api/news/news%201/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceDeep: false }),
      });

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "News item not found" }), { status: 404 })
      );
      await expect(newsService.reingestNewsItem("missing", false)).rejects.toThrow(
        "News item not found"
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders NewsReaderPanel details, thumbnail, 2-step delete, and tag editing without personal note", async () => {
    const item = makeItem({
      possibleDuplicateOfId: "news-0",
      personalNote: "Note cũ",
      thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      tags: ["tutorial", "ai", "architecture"],
    });
    const onUpdateTags = vi.fn(async () => {});
    const onDelete = vi.fn();

    renderPanel(item, {
      duplicateTitle: "Bài viết tương tự trước đó",
      onUpdateTags,
      onDelete,
    });

    expect(screen.getByText("via Captions")).toBeTruthy();
    expect(screen.getByText("Hướng dẫn")).toBeTruthy();
    expect(screen.getByAltText(item.title)).toBeTruthy();
    expect(screen.getByText("Bài viết tương tự trước đó")).toBeTruthy();
    expect(screen.getByText("Dùng schema rõ ràng.")).toBeTruthy();
    expect(screen.queryByLabelText("Ghi chú cá nhân")).toBeNull();

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
        onToggleRead: (item: NewsItemDto, next: "read" | "unread") => onToggleRead(item, next),
        onToggleSave: vi.fn(),
        onDismiss: vi.fn(),
        onReopen: vi.fn(),
        onDelete: vi.fn(),
        onUpdateTags: vi.fn(async () => {}),
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

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("roadmap-theme");

    const textarea = screen.getByLabelText("Danh sách URL");
    fireEvent.change(textarea, {
      target: { value: "https://github.com/vercel/next.js\nhttps://github.com/vercel/next.js" },
    });
    expect(screen.getByText("1 link")).toBeTruthy();
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
      fetchIntervalDays: 1,
      fetchHour: 11,
      itemCount: 0,
      lastFetchedAt: null,
      lastError: null,
      createdAt: "2026-11-22T07:00:00.000Z",
      updatedAt: "2026-11-22T07:00:00.000Z",
    };

    const previewSpy = vi.spyOn(newsService, "previewNewsSource").mockResolvedValue(
      makePreview({
        resolvedFeedUrl: "https://vercel.com/atom",
        siteHost: "vercel.com",
        feedTitle: "Vercel Blog",
      })
    );
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

    // Only the page link is required; an empty name, the feed URL and domain come from feed detection
    expect((screen.getByLabelText("Tên nguồn (tuỳ chọn)") as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("Tags mặc định (phân tách dấu phẩy)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Link trang hoặc feed"), {
      target: { value: "https://vercel.com/blog" },
    });
    // Schedule defaults to every day; the daily cron sets the hour, so there is no hour field
    const intervalField = screen.getByLabelText("Tần suất quét tự động") as HTMLSelectElement;
    expect(intervalField.value).toBe("1");
    expect(screen.queryByLabelText("Giờ quét (giờ VN)")).toBeNull();
    fireEvent.change(intervalField, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm nguồn" }));

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledWith("https://vercel.com/blog");
      expect(createSpy).toHaveBeenCalledWith({
        name: "Vercel Blog",
        feedUrl: "https://vercel.com/atom",
        domain: "vercel.com",
        enabled: true,
        fetchIntervalDays: 3,
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

  it("detects the feed on paste, shows it for manual checking, and adds it without detecting again", async () => {
    const discoveredSource = {
      id: "src-sub",
      name: "Goon",
      feedUrl: "https://goonnguyen.substack.com/feed",
      domain: "goonnguyen.substack.com",
      enabled: true,
      fetchIntervalDays: 1,
      fetchHour: 11,
      itemCount: 0,
      lastFetchedAt: null,
      lastError: null,
      createdAt: "2026-11-23T07:00:00.000Z",
      updatedAt: "2026-11-23T07:00:00.000Z",
    };

    const previewSpy = vi.spyOn(newsService, "previewNewsSource").mockResolvedValue(
      makePreview({
        resolvedFeedUrl: "https://goonnguyen.substack.com/feed",
        siteHost: "goonnguyen.substack.com",
        feedTitle: "Goon",
      })
    );
    const createSpy = vi
      .spyOn(newsService, "createNewsSource")
      .mockResolvedValue({ source: discoveredSource });
    vi.spyOn(newsService, "fetchNewsSources").mockResolvedValue({
      sources: [discoveredSource],
    });

    render(
      <ToastProvider>
        <SourcesManagerSheet
          open={true}
          initialSources={[]}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>
    );

    const urlField = screen.getByLabelText("Link trang hoặc feed") as HTMLInputElement;
    fireEvent.paste(urlField, {
      clipboardData: { getData: () => "https://goonnguyen.substack.com/" },
    });

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledWith("https://goonnguyen.substack.com/");
      expect(urlField.value).toBe("https://goonnguyen.substack.com/feed");
    });
    expect(screen.getByRole("button", { name: "Kiểm tra feed" })).toBeTruthy();

    // Detection fills the empty name; the Owner can still rename before adding
    const nameField = screen.getByLabelText("Tên nguồn (tuỳ chọn)") as HTMLInputElement;
    expect(nameField.value).toBe("Goon");
    fireEvent.change(nameField, { target: { value: "Goon Weekly" } });

    fireEvent.click(screen.getByRole("button", { name: "Thêm nguồn" }));
    expect(
      await screen.findByText('Đã thêm nguồn "Goon" (goonnguyen.substack.com/feed)')
    ).toBeTruthy();
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith({
      name: "Goon Weekly",
      feedUrl: "https://goonnguyen.substack.com/feed",
      domain: "goonnguyen.substack.com",
      enabled: true,
      fetchIntervalDays: 1,
    });
  });

  it("lists feeds suggested from related pages when the pasted page has none, and checks one on click", async () => {
    const previewSpy = vi
      .spyOn(newsService, "previewNewsSource")
      .mockRejectedValueOnce(
        new newsService.NewsSourcePreviewError(
          "Trang này không có RSS/Atom/JSON feed, nhưng tìm thấy 1 feed liên quan. Chọn một feed bên dưới để kiểm tra.",
          "FEED_NOT_FOUND",
          [{ url: "https://openai.com/news/rss.xml", title: "OpenAI News", format: "rss" }]
        )
      )
      .mockResolvedValueOnce(
        makePreview({
          resolvedFeedUrl: "https://openai.com/news/rss.xml",
          siteHost: "openai.com",
          feedTitle: "OpenAI News",
        })
      );

    render(
      <SourcesManagerSheet open={true} initialSources={[]} onClose={vi.fn()} onChanged={vi.fn()} />
    );

    const urlField = screen.getByLabelText("Link trang hoặc feed") as HTMLInputElement;
    fireEvent.paste(urlField, { clipboardData: { getData: () => "https://openai.com/" } });

    const group = await screen.findByRole("group", { name: "Feed gợi ý" });
    expect(screen.getByRole("alert").textContent).toContain("tìm thấy 1 feed liên quan");
    fireEvent.click(within(group).getByRole("button", { name: /OpenAI News/ }));

    await waitFor(() => {
      expect(previewSpy).toHaveBeenLastCalledWith("https://openai.com/news/rss.xml");
      expect(urlField.value).toBe("https://openai.com/news/rss.xml");
    });
    expect(screen.queryByRole("group", { name: "Feed gợi ý" })).toBeNull();
    expect((screen.getByLabelText("Tên nguồn (tuỳ chọn)") as HTMLInputElement).value).toBe(
      "OpenAI News"
    );
  });

  it("shows worker status badge in header (including unconfigured), re-checks on click, and omits Làm mới sync button", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const emptyCounts = {
      total: 0, queued: 0, processing: 0, ready: 0, partial: 0, failed: 0,
      draft: 0, unread: 0, saved: 0, dismissed: 0, queue: 0, inbox: 0, done: 0,
    };
    const healthSpy = vi
      .spyOn(newsService, "fetchNewsWorkerHealth")
      .mockResolvedValue({ configured: true, status: "ok" });

    render(
      <NuqsTestingAdapter hasMemory>
        <ToastProvider>
          <NewsFeedClient
            initialData={{ items: [], counts: emptyCounts, tags: [], duplicateTitles: {}, hasMore: false }}
            initialParams={{ view: "inbox", sort: "latest" }}
            initialWorkerHealth={{ configured: false, status: "unconfigured" }}
          />
        </ToastProvider>
      </NuqsTestingAdapter>
    );

    expect(screen.queryByRole("button", { name: "Làm mới" })).toBeNull();

    const workerBtn = screen.getByRole("button", {
      name: "Kiểm tra trạng thái worker: Chưa gắn worker",
    });
    expect(workerBtn.textContent).toContain("Chưa gắn worker");

    fireEvent.click(workerBtn);
    await waitFor(() => {
      expect(healthSpy).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByRole("button", {
        name: "Kiểm tra trạng thái worker: Worker OK",
      })
    ).toBeTruthy();
  });

  function makeSource(overrides: Partial<NewsSourceDto> = {}): NewsSourceDto {
    return {
      id: "src-1",
      name: "Vercel Blog",
      feedUrl: "https://vercel.com/atom",
      domain: "vercel.com",
      enabled: true,
      fetchIntervalDays: 1,
      fetchHour: 11,
      itemCount: 0,
      lastFetchedAt: null,
      lastError: null,
      createdAt: "2026-11-22T07:00:00.000Z",
      updatedAt: "2026-11-22T07:00:00.000Z",
      ...overrides,
    };
  }

  function makePreview(overrides: Partial<NewsSourcePreviewDto> = {}): NewsSourcePreviewDto {
    return {
      resolvedFeedUrl: "https://example.com/feed.xml",
      siteHost: "example.com",
      feedTitle: "Example",
      format: "rss",
      candidates: [],
      itemCount: 3,
      sampleItems: [],
      warnings: [],
      ...overrides,
    };
  }

  it("applies roadmap-theme on SourcesManagerSheet, shows cron schedule, and renders empty state", () => {
    render(
      <SourcesManagerSheet
        open={true}
        initialSources={[]}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("roadmap-theme");
    expect(screen.getByText(`Tự động: ${NEWS_CRON_SCHEDULE.label}`)).toBeTruthy();
    expect(screen.getByText(/Chưa có nguồn RSS nào/)).toBeTruthy();
  });

  it("shows alert error and preserves create form values when createNewsSource fails", async () => {
    vi.spyOn(newsService, "previewNewsSource").mockResolvedValue(
      makePreview({ resolvedFeedUrl: "https://broken.example.com/feed" })
    );
    vi.spyOn(newsService, "createNewsSource").mockRejectedValue(
      new Error("Không tìm thấy RSS/Atom hợp lệ")
    );
    const onChanged = vi.fn();

    render(
      <SourcesManagerSheet
        open={true}
        initialSources={[]}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    );

    const feedField = screen.getByLabelText("Link trang hoặc feed") as HTMLInputElement;

    fireEvent.change(feedField, { target: { value: "https://broken.example.com/feed" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm nguồn" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không tìm thấy RSS/Atom hợp lệ");
    expect(feedField.value).toBe("https://broken.example.com/feed");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("supports lastError display, per-source sync, toggle enabled, inline edit diff, and 2-step delete", async () => {
    const initialSource = makeSource({
      id: "src-edit",
      name: "Anthropic News",
      feedUrl: "https://anthropic.com/feed.xml",
      itemCount: 12,
      domain: "anthropic.com",
      enabled: true,
      fetchIntervalDays: 1,
      fetchHour: 11,
      lastError: "HTTP 500 timeout khi tải feed",
    });

    const syncSpy = vi.spyOn(newsService, "triggerNewsCronSync").mockResolvedValue({
      sourcesProcessed: 1,
      totalQueued: 1,
      totalDuplicates: 0,
      results: [
        {
          sourceId: initialSource.id,
          sourceName: initialSource.name,
          queued: 1,
          duplicates: 0,
          skippedErrors: 0,
          error: null,
        },
      ],
    });
    const updateSpy = vi
      .spyOn(newsService, "updateNewsSource")
      .mockResolvedValue({ source: initialSource });
    const deleteSpy = vi
      .spyOn(newsService, "deleteNewsSource")
      .mockResolvedValue({ deleted: true });
    vi.spyOn(newsService, "fetchNewsSources").mockResolvedValue({
      sources: [initialSource],
    });
    const onChanged = vi.fn();

    render(
      <ToastProvider>
        <SourcesManagerSheet
          open={true}
          initialSources={[initialSource]}
          onClose={vi.fn()}
          onChanged={onChanged}
        />
      </ToastProvider>
    );

    // lastError banner
    expect(screen.getByText("HTTP 500 timeout khi tải feed")).toBeTruthy();
    // Count badge of items collected from the source
    expect(screen.getByLabelText("12 bài").textContent).toBe("12");

    // Menu order: edit, scan, history, then disable and delete
    fireEvent.click(screen.getByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Chỉnh sửa",
      "Quét ngay",
      "Lịch sử quét",
      "Tắt nguồn",
      "Xoá nguồn",
    ]);

    // Scan history opens under the card from the menu
    const scansSpy = vi.spyOn(newsService, "fetchNewsSourceScans").mockResolvedValue({
      scans: [
        {
          id: "scan-2",
          trigger: "manual",
          queued: 0,
          duplicates: 0,
          skippedErrors: 0,
          notModified: false,
          error: "HTTP 500 timeout khi tải feed",
          createdAt: "2026-11-25T04:05:00.000Z",
        },
        {
          id: "scan-1",
          trigger: "cron",
          queued: 2,
          duplicates: 1,
          skippedErrors: 1,
          notModified: false,
          error: null,
          createdAt: "2026-11-24T04:00:00.000Z",
        },
      ],
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Lịch sử quét" }));
    const history = await screen.findByRole("region", { name: "Lịch sử quét" });
    expect(scansSpy).toHaveBeenCalledWith("src-edit");
    expect(await within(history).findByText("+2 mới · 1 trùng · 1 bỏ qua")).toBeTruthy();
    expect(within(history).getByText("Tự động")).toBeTruthy();
    expect(within(history).getByText("HTTP 500 timeout khi tải feed")).toBeTruthy();

    // Per-source sync via ActionMenu refreshes the open history
    fireEvent.click(screen.getByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Quét ngay" }));
    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalledWith({ sourceId: "src-edit" });
      expect(scansSpy).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByRole("button", { name: "Đóng lịch sử quét" }));
    expect(screen.queryByRole("region", { name: "Lịch sử quét" })).toBeNull();

    // Toggle enabled via ActionMenu
    fireEvent.click(await screen.findByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Tắt nguồn" }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("src-edit", { enabled: false });
    });

    // Inline edit: Huỷ closes without API call; Lưu sends minimal diff
    fireEvent.click(screen.getByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Chỉnh sửa" }));

    const editForm = screen.getByRole("form", { name: "Chỉnh sửa nguồn Anthropic News" });
    fireEvent.click(within(editForm).getByRole("button", { name: "Huỷ" }));
    expect(screen.queryByRole("form", { name: "Chỉnh sửa nguồn Anthropic News" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Chỉnh sửa" }));

    const reopenedEditForm = screen.getByRole("form", {
      name: "Chỉnh sửa nguồn Anthropic News",
    });
    // Edit form shares the add form's fields, plus the name
    expect(within(reopenedEditForm).getByLabelText("Link trang hoặc feed")).toBeTruthy();
    expect(within(reopenedEditForm).queryByLabelText("Domain bài viết (tuỳ chọn)")).toBeNull();
    fireEvent.change(within(reopenedEditForm).getByLabelText("Tên nguồn"), {
      target: { value: "Anthropic Engineering" },
    });
    fireEvent.click(within(reopenedEditForm).getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("src-edit", {
        name: "Anthropic Engineering",
      });
    });

    // 2-step delete: first click asks for confirmation, second click deletes
    fireEvent.click(screen.getByRole("button", { name: "Tuỳ chọn nguồn Anthropic News" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá nguồn" }));
    expect(deleteSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("src-edit");
    });
  });

  it("validates whitespace-only create inputs and renders destructive sync summary when all sources fail", async () => {
    const createSpy = vi.spyOn(newsService, "createNewsSource");
    const customDomain = `${"sub.".repeat(20)}example.com`;
    const failingSource = makeSource({
      id: "src-fail",
      name: "Slow Feed",
      feedUrl: "https://feed.example.com/rss.xml",
      domain: customDomain,
    });

    let resolveSync: (value: Awaited<ReturnType<typeof newsService.triggerNewsCronSync>>) => void = () => {};
    vi.spyOn(newsService, "triggerNewsCronSync").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        })
    );
    vi.spyOn(newsService, "fetchNewsSources").mockResolvedValue({
      sources: [failingSource],
    });

    render(
      <ToastProvider>
        <SourcesManagerSheet
          open={true}
          initialSources={[failingSource]}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>
    );

    // Custom domain badge truncates with full title
    const domainBadge = screen.getByTitle(customDomain);
    expect(domainBadge.className).toContain("max-w-[12rem]");
    expect(domainBadge.className).toContain("truncate");

    // Whitespace-only link keeps "Thêm nguồn" disabled, so createNewsSource is never called
    const feedField = screen.getByLabelText("Link trang hoặc feed");
    fireEvent.change(feedField, { target: { value: "   " } });
    const addBtn = screen.getByRole("button", { name: "Thêm nguồn" }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.click(addBtn);
    expect(createSpy).not.toHaveBeenCalled();

    // While syncing all sources, the per-source menu (holding "Quét ngay") is hidden to avoid concurrent sync collisions
    fireEvent.click(screen.getByRole("button", { name: "Quét tất cả ngay" }));
    expect(screen.queryByRole("button", { name: "Tuỳ chọn nguồn Slow Feed" })).toBeNull();

    resolveSync({
      sourcesProcessed: 1,
      totalQueued: 0,
      totalDuplicates: 0,
      results: [
        {
          sourceId: "src-fail",
          sourceName: "Slow Feed",
          queued: 0,
          duplicates: 0,
          skippedErrors: 0,
          error: "HTTP 403 bị chặn bot",
        },
      ],
    });

    const statusBanner = await screen.findByRole("status");
    expect(statusBanner.className).toContain("border-destructive/30");
    expect(statusBanner.className).toContain("text-destructive");
    expect(statusBanner.className).not.toContain("text-[var(--status-known)]");
    expect(statusBanner.textContent).toContain("Đã quét 1 nguồn: +0 bài mới vào Chờ xử lý");
    expect(statusBanner.textContent).toContain("Slow Feed: HTTP 403 bị chặn bot");
  });
});
