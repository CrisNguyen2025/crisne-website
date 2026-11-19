// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withHeadingIds } from "@/lib/roadmap/content-utils";
import { DEFAULT_LESSON_TEMPLATE_HTML } from "@/lib/roadmap/lesson-template";
import { groupBySection } from "@/lib/roadmap/sections";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import {
  isSectionExpanded,
  LectureShell,
  type SectionOverride,
  toggleSectionOverride,
} from "@/components/roadmap/LectureShell";
import { computeActiveHeadingId } from "@/components/roadmap/LectureToc";
import { PublicationHome } from "@/components/roadmap/PublicationHome";
import { TopicEditorialPage } from "@/components/roadmap/TopicEditorialPage";
import { LessonEditorialReader } from "@/components/roadmap/LessonEditorialReader";

const mockUseCanWrite = vi.fn(() => false);
const mockUseMediaQuery = vi.fn(() => false);

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
    const linkProps = { ...rest };
    delete linkProps.prefetch;
    return (
      <a href={href} {...linkProps}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/hooks/use-can-write", () => ({
  useCanWrite: () => mockUseCanWrite(),
}));

vi.mock("@/hooks/use-media-query", () => ({
  MOBILE_VIEWPORT_QUERY: "(max-width: 767px)",
  useMediaQuery: () => mockUseMediaQuery(),
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: ({ className }: { className?: string }) => (
    <button type="button" className={className} aria-label="Toggle theme" />
  ),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/roadmap/RoadmapMap", () => ({
  RoadmapMap: () => <div data-testid="roadmap-map-reorder" />,
}));

vi.mock("@/components/roadmap/EditItemContentDrawer", () => ({
  EditItemContentDrawer: ({
    isOpen,
    initialDraftContent,
  }: {
    isOpen: boolean;
    initialDraftContent?: string;
  }) =>
    isOpen ? (
      <div data-testid="mock-content-drawer">
        {initialDraftContent ?? "blank"}
      </div>
    ) : null,
}));

vi.mock("@/logic/roadmap/roadmapService", () => ({
  fetchRoadmapBySlug: vi.fn(() => Promise.resolve({ items: [] })),
  updateItemStatus: vi.fn(),
  createItem: vi.fn(),
  updateRoadmapBySlug: vi.fn(),
  deleteRoadmapBySlug: vi.fn(),
  renameSection: vi.fn(),
  dissolveSection: vi.fn(),
  reorderItems: vi.fn(),
  updateItemInfo: vi.fn(),
  updateItemContent: vi.fn(),
  deleteItem: vi.fn(),
}));

const TOPIC: RoadmapMeta & { updatedAt: string } = {
  id: "topic-1",
  slug: "harness-engineering",
  title: "Harness Engineering",
  description: "Xây dựng môi trường kiểm soát cho coding agent.",
  order: 0,
  isLocked: false,
  updatedAt: "2026-11-18T00:00:00.000Z",
};

const ITEMS: ChecklistItem[] = [
  {
    id: "l-1",
    slug: "why-agents-fail",
    title: "Tại sao các Agent mạnh vẫn thất bại",
    description: "Phân tích nguyên nhân failure mode.",
    section: "Nền tảng",
    order: 0,
    readingMinutes: 4,
    hasContent: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
  {
    id: "l-2",
    slug: "repo-source-of-truth",
    title: "Repository là nguồn sự thật",
    description: "Giữ kiến thức ngay trong codebase.",
    section: "Thực hành",
    order: 1,
    readingMinutes: 6,
    hasContent: true,
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
  },
];

describe("groupBySection & Collapse state helpers", () => {
  it("groups items by section case-insensitively and preserves null section", () => {
    const withDiffCase: ChecklistItem[] = [
      { ...ITEMS[0], section: "nền tảng" },
      { ...ITEMS[1], section: null },
    ];
    const groups = groupBySection(withDiffCase, ["Nền tảng", null]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((i) => i.id)).toEqual(["l-1"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["l-2"]);
  });

  it("supports multi-expand collapse toggles and reopens when navigating into a closed section", () => {
    let overrides: Record<string, SectionOverride> = {};
    expect(isSectionExpanded(overrides, "Nền tảng", "Nền tảng")).toBe(true);
    expect(isSectionExpanded(overrides, "Thực hành", "Nền tảng")).toBe(false);

    overrides = toggleSectionOverride(overrides, "Thực hành", "Nền tảng");
    expect(isSectionExpanded(overrides, "Nền tảng", "Nền tảng")).toBe(true);
    expect(isSectionExpanded(overrides, "Thực hành", "Nền tảng")).toBe(true);

    overrides = toggleSectionOverride(overrides, "Thực hành", "Nền tảng");
    expect(isSectionExpanded(overrides, "Thực hành", "Nền tảng")).toBe(false);
    expect(isSectionExpanded(overrides, "Thực hành", "Thực hành")).toBe(true);

    overrides = toggleSectionOverride(overrides, "Nền tảng", "Nền tảng");
    expect(isSectionExpanded(overrides, "Nền tảng", "Nền tảng")).toBe(false);
  });

  it("computes active heading reliably across top, mid-scroll, and bottom of document", () => {
    const mockEl = (id: string, top: number) =>
      ({
        id,
        getBoundingClientRect: () => ({ top }),
      }) as unknown as HTMLElement;

    expect(
      computeActiveHeadingId(
        [mockEl("h-1", 420), mockEl("h-2", 800)],
        900,
        0,
        2000
      )
    ).toBe("h-1");

    expect(
      computeActiveHeadingId(
        [mockEl("h-1", -300), mockEl("h-2", 60), mockEl("h-3", 500)],
        900,
        350,
        2000
      )
    ).toBe("h-2");

    expect(
      computeActiveHeadingId(
        [mockEl("h-1", -900), mockEl("h-2", -300), mockEl("h-3", 280)],
        900,
        1110,
        2000
      )
    ).toBe("h-3");
  });
});

describe("LectureShell & editorial pages", () => {
  beforeEach(() => {
    mockUseCanWrite.mockReturnValue(false);
    mockUseMediaQuery.mockReturnValue(false);
    globalThis.IntersectionObserver = class IntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof globalThis.IntersectionObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders flat syllabus when topic has no named sections, and collapse UI when sections exist", () => {
    const unscopedGroups: SectionGroup[] = [
      { section: null, items: ITEMS.map((i) => ({ ...i, section: null })) },
    ];

    const { rerender } = render(
      <LectureShell
        topic={TOPIC}
        siblingGroups={unscopedGroups}
        activeView="summary"
        defaultOpenSectionKey="__none__"
        canWrite={false}
        ownerStatusById={{}}
        headings={[{ id: "h-curriculum", text: "Nội dung lộ trình", level: 2 }]}
      >
        <p>Body</p>
      </LectureShell>
    );

    expect(screen.queryByRole("link", { name: "Tổng quan" })).toBeNull();
    expect(screen.getByText(ITEMS[0].title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nền tảng/ })).toBeNull();
    expect(screen.getAllByText("On this page").length).toBeGreaterThanOrEqual(
      1
    );

    const sectionedGroups = groupBySection(ITEMS, ["Nền tảng", "Thực hành"]);
    rerender(
      <LectureShell
        topic={TOPIC}
        siblingGroups={sectionedGroups}
        activeView="summary"
        defaultOpenSectionKey="Nền tảng"
        canWrite={false}
        ownerStatusById={{}}
        headings={[{ id: "h-curriculum", text: "Nội dung lộ trình", level: 2 }]}
      >
        <p>Body</p>
      </LectureShell>
    );

    const nenTangBtn = screen.getByRole("button", { name: /Nền tảng/ });
    const thucHanhBtn = screen.getByRole("button", { name: /Thực hành/ });
    expect(nenTangBtn.getAttribute("aria-expanded")).toBe("true");
    expect(thucHanhBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(thucHanhBtn);
    expect(nenTangBtn.getAttribute("aria-expanded")).toBe("true");
    expect(thucHanhBtn.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens mobile drawer with syllabus and closes cleanly", () => {
    const sectionedGroups = groupBySection(ITEMS, ["Nền tảng", "Thực hành"]);
    render(
      <LectureShell
        topic={TOPIC}
        siblingGroups={sectionedGroups}
        activeView="summary"
        defaultOpenSectionKey="Nền tảng"
        canWrite={false}
        ownerStatusById={{}}
        headings={[{ id: "h-curriculum", text: "Nội dung lộ trình", level: 2 }]}
      >
        <p>Body</p>
      </LectureShell>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mở danh sách bài học" })
    );
    expect(screen.getByRole("dialog", { name: TOPIC.title })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Đóng danh sách bài học" })
    );
    expect(screen.queryByRole("dialog", { name: TOPIC.title })).toBeNull();
  });

  it("renders TopicEditorialPage as Summary with next pager to first lesson and hides owner controls from visitor", () => {
    render(
      <TopicEditorialPage
        topic={TOPIC}
        initialItems={ITEMS}
        initialSections={["Nền tảng", "Thực hành"]}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: TOPIC.title })
    ).toBeTruthy();
    expect(screen.queryByText("On this page")).toBeNull();
    expect(screen.getByText("Trang sau")).toBeTruthy();
    const nextLink = screen.getByRole("link", { name: /Trang sau/ });
    expect(nextLink.getAttribute("href")).toBe("/harness-engineering/why-agents-fail");
    expect(screen.queryByRole("button", { name: /Thêm bài/ })).toBeNull();
  });

  it("renders LessonEditorialReader with webmcp context attributes and pager back to Tổng quan", () => {
    const groups = groupBySection(ITEMS, ["Nền tảng", "Thực hành"]);
    const { container } = render(
      <LessonEditorialReader
        lesson={ITEMS[0]}
        processedHtml='<h2 id="h-1">Mở đầu</h2><p>Nội dung</p>'
        headings={[{ id: "h-1", text: "Mở đầu", level: 2 }]}
        topic={TOPIC}
        siblingGroups={groups}
        nextLesson={{
          id: ITEMS[1].id,
          slug: ITEMS[1].slug,
          title: ITEMS[1].title,
        }}
        allTopics={[TOPIC]}
      />
    );

    const article = container.querySelector("[data-roadmap-context]");
    expect(article).toBeTruthy();
    expect(article?.getAttribute("data-roadmap-slug")).toBe(
      "harness-engineering"
    );
    expect(article?.getAttribute("data-lesson-slug")).toBe("why-agents-fail");
    expect(article?.getAttribute("data-section")).toBe("Nền tảng");

    const prevLink = screen.getByRole("link", { name: /Trang trước/ });
    expect(prevLink.getAttribute("href")).toBe("/harness-engineering");

    expect(screen.getAllByText("On this page").length).toBeGreaterThanOrEqual(
      1
    );

    const nextLink = screen.getByRole("link", { name: /Trang sau/ });
    expect(nextLink.getAttribute("href")).toBe("/harness-engineering/repo-source-of-truth");
  });

  it("renders PublicationHome cleanly without header or footer chrome", () => {
    const { container } = render(
      <PublicationHome
        topics={[
          {
            ...TOPIC,
            lessonCount: 2,
            sectionNames: ["Nền tảng", "Thực hành"],
          },
        ]}
        recentLessons={[
          {
            id: ITEMS[0].id,
            slug: ITEMS[0].slug,
            title: ITEMS[0].title,
            description: ITEMS[0].description,
            section: ITEMS[0].section,
            readingMinutes: 4,
            hasContent: true,
            updatedAt: ITEMS[0].updatedAt,
            topicTitle: TOPIC.title,
            topicSlug: TOPIC.slug,
          },
        ]}
        totalLessons={2}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Crisne" })
    ).toBeTruthy();
    expect(screen.getByText("1 topics · 2 bài học")).toBeTruthy();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });

  it("puts the Owner controls under On this page: right rail on xl, top of the article below xl", () => {
    mockUseCanWrite.mockReturnValue(true);
    const groups = groupBySection(ITEMS, ["Nền tảng", "Thực hành"]);
    const renderLesson = () =>
      render(
        <LessonEditorialReader
          lesson={ITEMS[0]}
          processedHtml='<h2 id="h-1">Mở đầu</h2><p>Nội dung</p>'
          headings={[{ id: "h-1", text: "Mở đầu", level: 2 }]}
          topic={TOPIC}
          siblingGroups={groups}
          allTopics={[TOPIC]}
        />
      );

    mockUseMediaQuery.mockReturnValue(true);
    const xl = renderLesson();
    const toc = xl.container.querySelector('nav[aria-label="On this page"]');
    const status = screen.getByRole("group", { name: "Trạng thái bài học" });
    expect(toc?.closest("aside")).toBe(status.closest("aside"));
    expect(toc!.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(xl.container.querySelector("article header [role=group]")).toBeNull();
    xl.unmount();

    mockUseMediaQuery.mockReturnValue(false);
    const lg = renderLesson();
    const header = lg.container.querySelector("article header");
    expect(header?.firstElementChild?.contains(screen.getByRole("group", { name: "Trạng thái bài học" }))).toBe(true);
    expect(screen.getAllByRole("button", { name: "Sửa" })).toHaveLength(1);
  });

  it("extracts H2/H3 outline from DEFAULT_LESSON_TEMPLATE_HTML and lets Owner open editor from template", () => {
    const { headings } = withHeadingIds(DEFAULT_LESSON_TEMPLATE_HTML);
    expect(DEFAULT_LESSON_TEMPLATE_HTML).not.toContain("<h1");
    expect(headings.map((h) => [h.level, h.text])).toEqual([
      [2, "Tổng quan & Bài toán"],
      [2, "Cơ chế hoạt động"],
      [3, "Thành phần chính"],
      [2, "Ví dụ & Áp dụng thực tế"],
      [2, "Lưu ý & Trade-off"],
    ]);

    mockUseCanWrite.mockReturnValue(true);
    const groups = groupBySection(ITEMS, ["Nền tảng", "Thực hành"]);
    render(
      <LessonEditorialReader
        lesson={{ ...ITEMS[0], content: undefined, hasContent: false }}
        processedHtml=""
        headings={[]}
        topic={TOPIC}
        siblingGroups={groups}
        allTopics={[TOPIC]}
      />
    );

    const templateBtn = screen.getByRole("button", { name: "Soạn từ mẫu chuẩn" });
    expect(screen.getByRole("button", { name: "Soạn tự do" })).toBeTruthy();
    fireEvent.click(templateBtn);

    const drawer = screen.getByTestId("mock-content-drawer");
    expect(drawer.textContent).toContain("Tổng quan");
  });
});
