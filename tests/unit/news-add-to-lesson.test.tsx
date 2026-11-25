// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsItemDto } from "@/lib/news/schemas";

const news = vi.hoisted(() => ({ addNewsItemToLesson: vi.fn() }));
const roadmap = vi.hoisted(() => ({ fetchAllRoadmaps: vi.fn(), fetchRoadmapBySlug: vi.fn() }));
vi.mock("@/logic/news/newsService", () => news);
vi.mock("@/logic/roadmap/roadmapService", () => roadmap);
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { AddToLessonSheet } from "@/components/news/AddToLessonSheet";
import { NewsReaderPanel } from "@/components/news/NewsReaderPanel";
import { consumeRoadmapRefreshPending } from "@/lib/roadmap/pending-write";

function makeItem(overrides: Partial<NewsItemDto> = {}): NewsItemDto {
  return {
    id: "news-1",
    slug: null,
    sourceUrl: "https://nextjs.org/blog/next-16",
    canonicalUrl: "https://nextjs.org/blog/next-16",
    domain: "nextjs.org",
    platform: "article",
    origin: "cron",
    sourceId: null,
    title: "Next.js 16",
    author: null,
    thumbnailUrl: null,
    tldr: "Turbopack mặc định.",
    takeaways: ["**Turbopack** ổn định cho dev và build.", "HMR nhanh hơn."],
    tags: [],
    personalNote: null,
    ingestStatus: "ready",
    reviewStatus: "draft",
    readState: "read",
    isSaved: false,
    extractionMethod: "article",
    extractionError: null,
    possibleDuplicateOfId: null,
    publishedAt: null,
    createdAt: "2026-11-22T07:00:00.000Z",
    updatedAt: "2026-11-22T07:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {};
const asyncNoop = async () => {};

function renderPanel(item: NewsItemDto) {
  return render(
    <NewsReaderPanel
      item={item}
      onToggleRead={noop}
      onToggleSave={noop}
      onDismiss={noop}
      onReopen={noop}
      onDelete={noop}
      onUpdateTags={asyncNoop}
      onOpenExternal={noop}
    />
  );
}

async function openSheetAndPickTopic() {
  fireEvent.click(screen.getByRole("button", { name: "Đưa vào Lesson" }));
  await screen.findByRole("option", { name: "Next.js" });
  fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "nextjs" } });
  await waitFor(() => expect(roadmap.fetchRoadmapBySlug).toHaveBeenCalledWith("nextjs", { mode: "outline" }));
}

describe("AddToLessonSheet (ADR-0017)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roadmap.fetchAllRoadmaps.mockResolvedValue({
      roadmaps: [{ id: "t-1", slug: "nextjs", title: "Next.js", order: 0, isLocked: false, _count: { items: 1 } }],
    });
    roadmap.fetchRoadmapBySlug.mockResolvedValue({
      roadmap: { id: "t-1", slug: "nextjs", title: "Next.js", order: 0, isLocked: false },
      items: [{ id: "l-1", slug: "app-router", title: "App Router", section: null, order: 0, description: "" }],
      sections: [null],
    });
    news.addNewsItemToLesson.mockResolvedValue({
      kind: "created",
      lesson: { id: "l-new", slug: "next-js-16", roadmapSlug: "nextjs" },
      provenanceCount: 2,
    });
  });
  afterEach(cleanup);

  it("shows the button only for items that are ready and not dismissed", () => {
    renderPanel(makeItem());
    expect(screen.queryByRole("button", { name: "Đưa vào Lesson" })).toBeTruthy();
    cleanup();
    renderPanel(makeItem({ ingestStatus: "processing" }));
    expect(screen.queryByRole("button", { name: "Đưa vào Lesson" })).toBeNull();
    cleanup();
    renderPanel(makeItem({ reviewStatus: "dismissed" }));
    expect(screen.queryByRole("button", { name: "Đưa vào Lesson" })).toBeNull();
  });

  it("sends a create_lesson payload with status target, excerpts from the AI text, and edits marked ai_assisted", async () => {
    render(<AddToLessonSheet item={makeItem()} />);
    await openSheetAndPickTopic();

    // `**` markers are gone from the editable text
    const first = screen.getByLabelText("Nội dung ý 1") as HTMLTextAreaElement;
    expect(first.value).toBe("Turbopack ổn định cho dev và build.");
    fireEvent.change(screen.getByLabelText("Nội dung ý 2"), { target: { value: "HMR nhanh hơn rõ rệt." } });

    fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
    expect(news.addNewsItemToLesson).not.toHaveBeenCalled();
    expect(screen.getByText(/Tạo bài "Next.js 16" trong Next.js \(Mục tiêu\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lưu vào Lesson" }));
    await screen.findByText("Đã đưa 2 ý vào Lesson.");
    expect(news.addNewsItemToLesson).toHaveBeenCalledWith("news-1", {
      mode: "create_lesson",
      roadmapSlug: "nextjs",
      section: null,
      title: "Next.js 16",
      status: "target",
      statements: [
        { text: "Turbopack ổn định cho dev và build.", excerpt: "Turbopack ổn định cho dev và build.", authorType: "ai_generated" },
        { text: "HMR nhanh hơn rõ rệt.", excerpt: "HMR nhanh hơn.", authorType: "ai_assisted" },
      ],
    });
    expect(screen.getByRole("link", { name: "Mở bài" }).getAttribute("href")).toBe("/nextjs/next-js-16");
    expect(consumeRoadmapRefreshPending()).toBe(true);
  });

  it("sends append_to_lesson without a status, only with the chosen statements", async () => {
    render(<AddToLessonSheet item={makeItem()} />);
    await openSheetAndPickTopic();
    fireEvent.click(screen.getByLabelText("Chọn ý 1"));
    fireEvent.click(screen.getByRole("radio", { name: "Nối vào bài có sẵn" }));
    await screen.findByRole("option", { name: "App Router" });
    fireEvent.change(screen.getByLabelText("Bài"), { target: { value: "l-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào Lesson" }));
    await waitFor(() => expect(news.addNewsItemToLesson).toHaveBeenCalled());
    expect(news.addNewsItemToLesson.mock.calls[0][1]).toEqual({
      mode: "append_to_lesson",
      lessonId: "l-1",
      statements: [{ text: "HMR nhanh hơn.", excerpt: "HMR nhanh hơn.", authorType: "ai_generated" }],
    });
  });

  it("keeps Xem trước disabled without a statement or a target", async () => {
    render(<AddToLessonSheet item={makeItem()} />);
    fireEvent.click(screen.getByRole("button", { name: "Đưa vào Lesson" }));
    await screen.findByRole("option", { name: "Next.js" });
    expect((screen.getByRole("button", { name: "Xem trước" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "nextjs" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Xem trước" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByLabelText("Chọn ý 1"));
    fireEvent.click(screen.getByLabelText("Chọn ý 2"));
    expect((screen.getByRole("button", { name: "Xem trước" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a duplicate title and an item already added to that lesson", async () => {
    news.addNewsItemToLesson.mockResolvedValueOnce({ kind: "duplicate", existing: { id: "l-1", title: "Next.js 16" } });
    render(<AddToLessonSheet item={makeItem()} />);
    await openSheetAndPickTopic();
    fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào Lesson" }));
    expect((await screen.findByRole("alert")).textContent).toContain('Topic này đã có bài "Next.js 16"');

    news.addNewsItemToLesson.mockResolvedValueOnce({ kind: "already_integrated" });
    fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào Lesson" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Bài tin này đã được đưa vào bài đó rồi.")
    );
  });

  it("clears the error once the Owner changes the target or goes to the preview", async () => {
    news.addNewsItemToLesson.mockResolvedValueOnce({ kind: "duplicate", existing: { id: "l-1", title: "Next.js 16" } });
    render(<AddToLessonSheet item={makeItem()} />);
    await openSheetAndPickTopic();
    fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào Lesson" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("radio", { name: "Nối vào bài có sẵn" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
