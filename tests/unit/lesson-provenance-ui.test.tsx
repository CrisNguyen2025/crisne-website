// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonProvenanceResponse, ProvenanceDto } from "@/lib/provenance/dto";
import { buildStatementsHtml } from "@/lib/provenance/markers";
import { groupBySection } from "@/lib/roadmap/sections";
import type { ChecklistItem, RoadmapMeta } from "@/lib/roadmap/types";

const mockUseCanWrite = vi.fn(() => false);
const service = vi.hoisted(() => ({
  fetchLessonProvenance: vi.fn(),
  fetchRoadmapBySlug: vi.fn(() => Promise.resolve({ items: [] })),
  updateItemStatus: vi.fn(),
  updateItemInfo: vi.fn(),
  updateItemContent: vi.fn(),
  deleteItem: vi.fn(),
}));

vi.mock("@/logic/roadmap/roadmapService", () => service);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
    const props = { ...rest };
    delete props.prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/hooks/use-can-write", () => ({ useCanWrite: () => mockUseCanWrite() }));
vi.mock("@/hooks/use-media-query", () => ({ MOBILE_VIEWPORT_QUERY: "(max-width: 767px)", useMediaQuery: () => false }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/roadmap/EditItemContentDrawer", () => ({
  preloadLessonContentEditor: vi.fn(),
  EditItemContentDrawer: () => null,
}));

import { LessonEditorialReader } from "@/components/roadmap/LessonEditorialReader";

const K1 = "0192f1a2-0000-7000-8000-000000000001";
const K2 = "0192f1a2-0000-7000-8000-000000000002";
const K_UNKNOWN = "0192f1a2-0000-7000-8000-000000000009";

const TOPIC: RoadmapMeta = { id: "t-1", slug: "nextjs", title: "Next.js", order: 0, isLocked: false };
const LESSON: ChecklistItem = {
  id: "l-1",
  slug: "turbopack",
  title: "Turbopack",
  description: "",
  section: null,
  order: 0,
  hasContent: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};
const HTML = buildStatementsHtml([
  { text: "Turbopack ổn định.", claimRefKey: K1 },
  { text: "HMR nhanh hơn.", claimRefKey: K2 },
  { text: "Câu có marker lạ.", claimRefKey: K_UNKNOWN },
]);

const dto = (claimRefKey: string, sourceTitle: string, extractedAt: string | null): ProvenanceDto => ({
  claimRefKey,
  sourceName: "Next.js Blog",
  sourceUrl: "https://nextjs.org/blog/next-16",
  sourceTitle,
  excerpt: `Ý gốc của ${sourceTitle}`,
  authorType: "ai_assisted",
  relationType: "derived_from",
  collectedAt: "2026-11-20T00:00:00.000Z",
  extractedAt,
});

const RESPONSE: LessonProvenanceResponse = {
  provenances: [dto(K1, "Next.js 16", "2026-11-21T00:00:00.000Z"), dto(K2, "Next.js 16 HMR", null)],
  orphans: [dto("0192f1a2-0000-7000-8000-000000000003", "Bài đã bị xoá khỏi nội dung", null)],
};

function renderReader(lesson: ChecklistItem = { ...LESSON, content: HTML }) {
  return render(
    <LessonEditorialReader
      lesson={lesson}
      processedHtml={HTML}
      headings={[]}
      topic={TOPIC}
      siblingGroups={groupBySection([lesson], [null])}
      allTopics={[TOPIC]}
    />
  );
}

describe("Provenance on the Lesson page (ADR-0017)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has neither; the reader's table of contents uses both
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.IntersectionObserver;
    Element.prototype.scrollIntoView = vi.fn();
    mockUseCanWrite.mockReturnValue(false);
    service.fetchLessonProvenance.mockResolvedValue(RESPONSE);
  });
  afterEach(cleanup);

  it("shows a Visitor the same HTML and never calls the provenance API", async () => {
    const { container } = renderReader();
    await new Promise((r) => setTimeout(r, 0));
    expect(service.fetchLessonProvenance).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Nguồn \d/ })).toBeNull();
    expect(screen.queryByText("Nguồn tham khảo của bài")).toBeNull();
    for (const span of container.querySelectorAll("span[data-provenance-ref]")) {
      expect(span.innerHTML).toBe("");
    }
  });

  it("puts a numbered chip on every marker that has provenance, and opens all six fields", async () => {
    mockUseCanWrite.mockReturnValue(true);
    const { container } = renderReader();

    const chips = await screen.findAllByRole("button", { name: /^Nguồn \d/ });
    expect(chips).toHaveLength(2);
    expect(service.fetchLessonProvenance).toHaveBeenCalledWith("l-1");
    expect(chips.map((c) => c.textContent)).toEqual(["1", "2"]);
    // The unknown marker stays an empty span
    expect(container.querySelector(`span[data-provenance-ref="${K_UNKNOWN}"]`)?.innerHTML).toBe("");

    fireEvent.click(chips[1]);
    const dialog = await screen.findByRole("dialog", { name: "Nguồn của câu 2" });
    const link = dialog.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://nextjs.org/blog/next-16");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(dialog.textContent).toContain("Next.js Blog");
    expect(dialog.textContent).toContain("Next.js 16 HMR");
    expect(dialog.textContent).toContain("Ý gốc của Next.js 16 HMR");
    expect(dialog.textContent).toContain("Thu thập:");
    expect(dialog.textContent).toContain("Trích xuất: Chưa rõ");
    expect(dialog.textContent).toContain("AI tóm tắt, Owner sửa");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists sources whose marker is gone under the content", async () => {
    mockUseCanWrite.mockReturnValue(true);
    renderReader();
    expect(await screen.findByText("Nguồn tham khảo của bài")).toBeTruthy();
    expect(screen.getByText("· Bài đã bị xoá khỏi nội dung", { exact: false })).toBeTruthy();
    expect(screen.getByText("Ý gốc của Bài đã bị xoá khỏi nội dung")).toBeTruthy();
  });

  it("still renders the Lesson when the provenance API fails", async () => {
    mockUseCanWrite.mockReturnValue(true);
    service.fetchLessonProvenance.mockRejectedValue(new Error("network"));
    renderReader({ ...LESSON, id: "l-error", content: HTML });
    await waitFor(() => expect(service.fetchLessonProvenance).toHaveBeenCalledWith("l-error"));
    expect(screen.getByText("Turbopack ổn định.", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Nguồn \d/ })).toBeNull();
  });
});
