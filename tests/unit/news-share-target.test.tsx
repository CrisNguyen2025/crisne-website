// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EnqueueNewsResult } from "@/lib/news/ingest";
import type { NewsItemDto } from "@/lib/news/schemas";
import * as newsService from "@/logic/news/newsService";
import { ShareTargetClient } from "@/components/news/ShareTargetClient";

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

function makeNewsItem(overrides: Partial<NewsItemDto> = {}): NewsItemDto {
  return {
    id: "news-1",
    slug: null,
    sourceUrl: "https://youtube.com/watch?v=abc",
    canonicalUrl: "https://youtube.com/watch?v=abc",
    domain: "youtube.com",
    platform: "youtube",
    origin: "share",
    sourceId: null,
    title: "Test video",
    author: null,
    thumbnailUrl: null,
    tldr: "Test summary",
    takeaways: [],
    tags: [],
    personalNote: null,
    ingestStatus: "ready",
    reviewStatus: "draft",
    readState: "unread",
    isSaved: false,
    isPublic: false,
    publicAt: null,
    extractionMethod: "article",
    extractionError: null,
    possibleDuplicateOfId: null,
    publishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeResult(overrides: Partial<EnqueueNewsResult> = {}): EnqueueNewsResult {
  return {
    status: "queued",
    item: makeNewsItem(),
    jobId: "job-1",
    ...overrides,
  };
}

describe("ShareTargetClient", () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows spinner while ingesting", () => {
    vi.spyOn(newsService, "ingestNewsUrl").mockReturnValue(new Promise(() => {}));
    render(<ShareTargetClient url="https://youtube.com/watch?v=abc" />);
    expect(screen.getByText(/Đang thêm vào hàng đợi/i)).toBeTruthy();
  });

  it("calls ingestNewsUrl with origin=share", async () => {
    const spy = vi
      .spyOn(newsService, "ingestNewsUrl")
      .mockResolvedValue(makeResult());
    render(<ShareTargetClient url="https://youtube.com/watch?v=abc" />);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        url: "https://youtube.com/watch?v=abc",
        origin: "share",
      })
    );
  });

  it("shows success state after resolve", async () => {
    vi.spyOn(newsService, "ingestNewsUrl").mockResolvedValue(makeResult());
    render(<ShareTargetClient url="https://youtube.com/watch?v=abc" />);
    await waitFor(() =>
      expect(screen.getByText(/Đã thêm vào hàng đợi/i)).toBeTruthy()
    );
    expect(screen.getByRole("link", { name: /Mở ngay/i })).toBeTruthy();
  });

  it("shows duplicate message when status=duplicate", async () => {
    vi.spyOn(newsService, "ingestNewsUrl").mockResolvedValue(
      makeResult({ status: "duplicate", jobId: undefined })
    );
    render(<ShareTargetClient url="https://youtube.com/watch?v=abc" />);
    await waitFor(() =>
      expect(screen.getByText(/đã có trong hàng đợi/i)).toBeTruthy()
    );
  });

  it("redirects to /feed-ingestion after 2.5s on success", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    vi.spyOn(newsService, "ingestNewsUrl").mockResolvedValue(makeResult());
    render(<ShareTargetClient url="https://youtube.com/watch?v=abc" />);
    await waitFor(() =>
      expect(screen.getByText(/Đã thêm/i)).toBeTruthy()
    );
    const timerCall = setTimeoutSpy.mock.calls.find((call) => call[1] === 2500);
    expect(timerCall).toBeDefined();
    (timerCall![0] as () => void)();
    expect(mockReplace).toHaveBeenCalledWith("/feed-ingestion");
  });

  it("shows error state on reject with retry button", async () => {
    vi.spyOn(newsService, "ingestNewsUrl").mockRejectedValue(
      new Error("Domain không được phép")
    );
    render(<ShareTargetClient url="https://evil.com/page" />);
    await waitFor(() =>
      expect(screen.getByText(/Domain không được phép/i)).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: /Thử lại/i })).toBeTruthy();
  });

  it("retries when clicking retry button", async () => {
    let callCount = 0;
    const spy = vi
      .spyOn(newsService, "ingestNewsUrl")
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Lỗi mạng");
        }
        return makeResult();
      });

    render(<ShareTargetClient url="https://youtube.com/watch?v=xyz" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Thử lại/i })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /Thử lại/i }));

    await waitFor(() =>
      expect(screen.getByText(/Đã thêm vào hàng đợi/i)).toBeTruthy()
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
