// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupBySection } from "@/lib/roadmap/sections";
import type { ChecklistItem, RoadmapMeta } from "@/lib/roadmap/types";
import {
  consumeRoadmapRefreshPending,
  reconcileDeletedLessonIds,
  reconcileDeletedTopicSlugs,
} from "@/lib/roadmap/pending-write";
import { isRoadmapWriteTool } from "@/logic/roadmap/roadmapAssistantService";

const routerSpies = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const serviceSpies = vi.hoisted(() => ({
  fetchRoadmapBySlug: vi.fn(),
  fetchLessonProvenance: vi.fn(() => Promise.resolve({ provenances: [], orphans: [] })),
  createRoadmap: vi.fn(),
  deleteRoadmapBySlug: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItemStatus: vi.fn(),
  updateItemInfo: vi.fn(),
  updateItemContent: vi.fn(),
  reorderItems: vi.fn(),
  updateRoadmapBySlug: vi.fn(),
  renameSection: vi.fn(),
  dissolveSection: vi.fn(),
  fetchAllRoadmaps: vi.fn(),
  exportAllRoadmaps: vi.fn(),
}));

const widgetCapture = vi.hoisted(() => ({
  onToolExecuted: undefined as
    | ((toolName: string, result: string, isFailed?: boolean) => void)
    | undefined,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerSpies,
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

vi.mock("@/hooks/use-can-write", () => ({
  useCanWrite: () => true,
}));

vi.mock("@/hooks/use-media-query", () => ({
  MOBILE_VIEWPORT_QUERY: "(max-width: 767px)",
  useMediaQuery: () => false,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/roadmap/EditItemContentDrawer", () => ({
  preloadLessonContentEditor: vi.fn(),
  EditItemContentDrawer: () => null,
}));

vi.mock("@/components/roadmap/RoadmapMap", () => ({
  RoadmapMap: () => <div data-testid="roadmap-map-reorder" />,
}));

vi.mock("@/logic/roadmap/roadmapService", () => serviceSpies);

vi.mock(
  "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget",
  () => ({
    RoadmapChatbotWidget: ({
      onToolExecuted,
    }: {
      onToolExecuted?: (
        toolName: string,
        result: string,
        isFailed?: boolean
      ) => void;
    }) => {
      widgetCapture.onToolExecuted = onToolExecuted;
      return <div data-testid="mock-chatbot-widget" />;
    },
  })
);

import { LessonEditorialReader } from "@/components/roadmap/LessonEditorialReader";
import { TopicEditorialPage } from "@/components/roadmap/TopicEditorialPage";
import { PublicationHome } from "@/components/roadmap/PublicationHome";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbot";
import { useTopicOwnerStatuses } from "@/components/roadmap/useTopicOwnerStatuses";
import { useRoadmapWebMcpTools } from "@/hooks/use-roadmap-webmcp";

const TOPIC: RoadmapMeta & { updatedAt: string } = {
  id: "topic-1",
  slug: "ai-engineering",
  title: "AI Engineering",
  description: "Lộ trình AI",
  order: 1,
  sectionNames: ["Nền tảng", "Thực hành"],
  updatedAt: "2026-11-24T00:00:00.000Z",
};

const LESSON_1: ChecklistItem = {
  id: "lesson-1",
  slug: "embeddings",
  title: "Embeddings",
  description: "Biểu diễn vector",
  section: "Nền tảng",
  order: 0,
  roadmapSlug: "ai-engineering",
  hasContent: true,
  createdAt: "2026-11-24T00:00:00.000Z",
  updatedAt: "2026-11-24T00:00:00.000Z",
};

const LESSON_2: ChecklistItem = {
  id: "lesson-2",
  slug: "rag-evals",
  title: "RAG Evals",
  description: "Đánh giá hệ thống RAG",
  section: "Thực hành",
  order: 1,
  roadmapSlug: "ai-engineering",
  hasContent: true,
  createdAt: "2026-11-24T00:00:00.000Z",
  updatedAt: "2026-11-24T00:00:00.000Z",
};

describe("Roadmap stale cache & post-delete refresh flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRoadmapRefreshPending();
    reconcileDeletedLessonIds([]);
    reconcileDeletedTopicSlugs([]);
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.IntersectionObserver;
    Element.prototype.scrollIntoView = vi.fn();
    serviceSpies.fetchRoadmapBySlug.mockResolvedValue({
      roadmap: TOPIC,
      items: [LESSON_1, LESSON_2],
      sections: ["Nền tảng", "Thực hành"],
    });
  });

  afterEach(() => {
    cleanup();
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it("deleting a lesson avoids leaving-route refresh, hides stale cached item & empty section on TopicEditorialPage, and refreshes after landing", async () => {
    serviceSpies.deleteItem.mockResolvedValueOnce({ success: true });
    const siblingGroups = groupBySection(
      [LESSON_1, LESSON_2],
      ["Nền tảng", "Thực hành"]
    );

    const readerView = render(
      <LessonEditorialReader
        lesson={LESSON_1}
        processedHtml="<p>Nội dung</p>"
        headings={[]}
        topic={TOPIC}
        siblingGroups={siblingGroups}
        allTopics={[TOPIC]}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Thao tác bài học" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Xoá bài học" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() =>
      expect(serviceSpies.deleteItem).toHaveBeenCalledWith("lesson-1")
    );
    expect(routerSpies.push).toHaveBeenCalledWith("/ai-engineering");
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    readerView.unmount();

    // Simulate landing on TopicEditorialPage from stale Next.js Client Router Cache (still has LESSON_1 & "Nền tảng")
    const topicView = render(
      <TopicEditorialPage
        topic={TOPIC}
        initialItems={[LESSON_1, LESSON_2]}
        initialSections={["Nền tảng", "Thực hành"]}
      />
    );

    expect(screen.queryByRole("link", { name: /Embeddings/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Thao tác mục Nền tảng" })
    ).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /RAG Evals/ }).length
    ).toBeGreaterThan(0);
    expect(routerSpies.refresh).toHaveBeenCalledTimes(1);

    // Server refresh completes without LESSON_1 -> tombstone is reconciled cleanly
    topicView.rerender(
      <TopicEditorialPage
        topic={TOPIC}
        initialItems={[LESSON_2]}
        initialSections={["Thực hành"]}
      />
    );
    expect(
      screen.getAllByRole("link", { name: /RAG Evals/ }).length
    ).toBeGreaterThan(0);
  });

  it("deleting a topic hides stale topic & its recent lessons on PublicationHome and refreshes after landing", async () => {
    serviceSpies.deleteRoadmapBySlug.mockResolvedValueOnce({ success: true });

    const topicView = render(
      <TopicEditorialPage
        topic={TOPIC}
        initialItems={[LESSON_1]}
        initialSections={["Nền tảng"]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Thao tác topic" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá topic" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá topic" }));

    await waitFor(() =>
      expect(serviceSpies.deleteRoadmapBySlug).toHaveBeenCalledWith(
        "ai-engineering"
      )
    );
    expect(routerSpies.push).toHaveBeenCalledWith("/");
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    topicView.unmount();

    const homeView = render(
      <PublicationHome
        topics={[
          {
            id: "topic-1",
            slug: "ai-engineering",
            title: "AI Engineering",
            description: "Lộ trình AI",
            order: 1,
            updatedAt: "2026-11-24T00:00:00.000Z",
            lessonCount: 1,
            sectionNames: ["Nền tảng"],
          },
          {
            id: "topic-2",
            slug: "backend",
            title: "Backend",
            description: "Node & DB",
            order: 2,
            updatedAt: "2026-11-24T00:00:00.000Z",
            lessonCount: 2,
            sectionNames: ["API"],
          },
        ]}
        recentLessons={[
          {
            id: "lesson-1",
            slug: "embeddings",
            title: "Embeddings",
            description: "Biểu diễn vector",
            section: "Nền tảng",
            readingMinutes: 3,
            hasContent: true,
            updatedAt: "2026-11-24T00:00:00.000Z",
            topicSlug: "ai-engineering",
            topicTitle: "AI Engineering",
          },
          {
            id: "lesson-9",
            slug: "postgres",
            title: "Postgres",
            description: "CSDL quan hệ",
            section: "API",
            readingMinutes: 5,
            hasContent: true,
            updatedAt: "2026-11-24T00:00:00.000Z",
            topicSlug: "backend",
            topicTitle: "Backend",
          },
        ]}
        totalLessons={3}
      />
    );

    expect(screen.queryByRole("link", { name: /AI Engineering/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Embeddings/ })).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: /Backend/ })
        .some((link) => link.getAttribute("href") === "/backend")
    ).toBe(true);
    expect(screen.getByRole("link", { name: /Postgres/ })).toBeTruthy();
    expect(screen.getByText("1 topics · 2 bài học")).toBeTruthy();
    expect(routerSpies.refresh).toHaveBeenCalledTimes(1);
    homeView.unmount();
  });

  it("defers router.refresh until after navigation when creating a topic or creating+opening a lesson", async () => {
    serviceSpies.createRoadmap.mockResolvedValueOnce({
      roadmap: {
        id: "topic-new",
        slug: "systems",
        title: "Systems",
        description: "",
        order: 2,
      },
    });

    const homeView = render(
      <PublicationHome topics={[]} recentLessons={[]} totalLessons={0} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tạo topic" }));
    const topicDialog = screen.getByRole("dialog");
    fireEvent.change(within(topicDialog).getByLabelText(/Tên topic/i), {
      target: { value: "Systems" },
    });
    fireEvent.click(
      within(topicDialog).getByRole("button", { name: "Tạo topic" })
    );

    await waitFor(() =>
      expect(routerSpies.push).toHaveBeenCalledWith("/systems")
    );
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    expect(consumeRoadmapRefreshPending()).toBe(true);
    homeView.unmount();

    vi.clearAllMocks();
    serviceSpies.createItem.mockResolvedValueOnce({
      item: { ...LESSON_1, id: "lesson-new", slug: "agents", title: "Agents" },
    });

    const topicView = render(
      <TopicEditorialPage
        topic={TOPIC}
        initialItems={[LESSON_1]}
        initialSections={["Nền tảng"]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Thêm bài" }));
    const itemDialog = screen.getByRole("dialog");
    fireEvent.change(within(itemDialog).getByLabelText(/Tên bài/i), {
      target: { value: "Agents" },
    });
    fireEvent.click(
      within(itemDialog).getByRole("button", { name: "Tạo & viết nội dung" })
    );

    await waitFor(() =>
      expect(routerSpies.push).toHaveBeenCalledWith("/ai-engineering/agents")
    );
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    expect(consumeRoadmapRefreshPending()).toBe(true);
    topicView.unmount();
  });

  it("handles Abot write tools: recognizes mark_lesson_reviewed, ignores failed tools, and redirects instead of 404 when open route is deleted", async () => {
    expect(isRoadmapWriteTool("mark_lesson_reviewed")).toBe(true);

    const updatedEvents: unknown[] = [];
    const listener = (e: Event) =>
      updatedEvents.push((e as CustomEvent).detail ?? null);
    window.addEventListener("roadmap:updated", listener);

    render(<RoadmapAssistantChatbot />);
    act(() => {
      widgetCapture.onToolExecuted?.("delete_item", "Lỗi quyền", true);
    });
    expect(updatedEvents).toHaveLength(0);

    act(() => {
      widgetCapture.onToolExecuted?.(
        "mark_lesson_reviewed",
        "Đã ghi nhận ôn tập",
        false
      );
    });
    expect(updatedEvents).toHaveLength(1);
    window.removeEventListener("roadmap:updated", listener);

    // Abot deletes open lesson -> redirects to topic without calling router.refresh() on deleted URL
    serviceSpies.fetchRoadmapBySlug
      .mockResolvedValueOnce({ items: [LESSON_1, LESSON_2] })
      .mockResolvedValueOnce({ items: [LESSON_2] });

    const lessonStatusesHook = renderHook(() =>
      useTopicOwnerStatuses("ai-engineering", true, "lesson-1")
    );
    await waitFor(() =>
      expect(serviceSpies.fetchRoadmapBySlug).toHaveBeenCalledTimes(1)
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { toolName: "delete_item", result: "Đã xoá" },
        })
      );
    });

    await waitFor(() =>
      expect(routerSpies.push).toHaveBeenCalledWith("/ai-engineering")
    );
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    expect(consumeRoadmapRefreshPending()).toBe(true);
    lessonStatusesHook.unmount();

    // Abot deletes open topic -> 404 from outline check redirects to "/"
    vi.clearAllMocks();
    serviceSpies.fetchRoadmapBySlug
      .mockResolvedValueOnce({ items: [LESSON_2] })
      .mockRejectedValueOnce(Object.assign(new Error("Not found"), { status: 404 }));

    const topicStatusesHook = renderHook(() =>
      useTopicOwnerStatuses("ai-engineering", true)
    );
    await waitFor(() =>
      expect(serviceSpies.fetchRoadmapBySlug).toHaveBeenCalledTimes(1)
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { toolName: "delete_topic", result: "Đã xoá topic" },
        })
      );
    });

    await waitFor(() => expect(routerSpies.push).toHaveBeenCalledWith("/"));
    expect(routerSpies.refresh).not.toHaveBeenCalled();
    expect(consumeRoadmapRefreshPending()).toBe(true);
    topicStatusesHook.unmount();
  });

  it("WebMCP delete_item and delete_roadmap emit targeted deletion metadata so open views redirect instead of refreshing 404", async () => {
    const tools = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
    (
      document as unknown as {
        modelContext: {
          registerTool: (tool: {
            name: string;
            execute: (args: Record<string, unknown>) => Promise<unknown>;
          }) => Promise<void>;
        };
      }
    ).modelContext = {
      registerTool: async (tool) => {
        tools.set(tool.name, tool.execute);
      },
    };

    serviceSpies.deleteItem.mockResolvedValueOnce({ success: true });
    serviceSpies.deleteRoadmapBySlug.mockResolvedValueOnce({ success: true });

    const webmcpHook = renderHook(() => useRoadmapWebMcpTools());
    const statusesHook = renderHook(() =>
      useTopicOwnerStatuses("ai-engineering", true, "lesson-1")
    );

    await act(async () => {
      await tools.get("delete_item")?.({ id: "lesson-1", confirm: true });
    });
    expect(routerSpies.push).toHaveBeenCalledWith("/ai-engineering");
    expect(routerSpies.refresh).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await act(async () => {
      await tools.get("delete_roadmap")?.({
        slug: "ai-engineering",
        confirm: true,
      });
    });
    expect(routerSpies.push).toHaveBeenCalledWith("/");
    expect(routerSpies.refresh).not.toHaveBeenCalled();

    statusesHook.unmount();
    webmcpHook.unmount();
  });
});
