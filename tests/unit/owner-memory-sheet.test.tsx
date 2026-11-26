// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerMemorySheet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import {
  OWNER_MEMORIES_UPDATED_EVENT,
  usePendingMemoryCount,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/useOwnerMemories";
import type { OwnerMemoryItem, OwnerMemorySettings } from "@/roadmap-rag-assistant/sdk/typescript/src/types";

const BASE = "/api/roadmap-assistant";

function makeItem(overrides: Partial<OwnerMemoryItem> = {}): OwnerMemoryItem {
  return {
    id: overrides.id ?? "mem-1",
    kind: overrides.kind ?? "techstack",
    scopeTopicSlug: overrides.scopeTopicSlug ?? null,
    content: overrides.content ?? "Đang dùng Next.js 15 và FastAPI",
    source: overrides.source ?? "explicit",
    status: overrides.status ?? "active",
    replacesMemoryId: overrides.replacesMemoryId ?? null,
    evidenceSnippet: overrides.evidenceSnippet ?? null,
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    lastUsedAt: null,
  };
}

describe("OwnerMemorySheet & useOwnerMemories (Rovo 2-Tab)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders Rovo two-tab dialog, approves with Undo, rejects with negative feedback, and manages explicit items", async () => {
    let settings: OwnerMemorySettings = {
      id: "default",
      memoryEnabled: true,
      autoObserveEnabled: true,
      lastSynthesizedAt: null,
    };
    let activeList: OwnerMemoryItem[] = [
      makeItem({ id: "mem-old", kind: "techstack", content: "Đang dùng Next.js 14", source: "explicit" }),
      makeItem({
        id: "mem-obs",
        kind: "goal",
        content: "Đang tập trung ôn RAG",
        source: "observed",
        evidenceSnippet: "Đọc 3 bài về RAG",
      }),
    ];
    let pendingList: OwnerMemoryItem[] = [
      makeItem({
        id: "mem-pending",
        kind: "techstack",
        content: "Đang nâng cấp Next.js 16",
        source: "suggested",
        status: "pending",
        replacesMemoryId: "mem-old",
      }),
    ];
    let archivedList: OwnerMemoryItem[] = [];
    const activityEvents: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/memories/settings") {
        if (method === "PATCH") {
          const patch = JSON.parse(String(init?.body ?? "{}"));
          settings = { ...settings, ...patch };
        }
        return new Response(JSON.stringify({ settings }), { status: 200 });
      }
      if (url === "/api/v1/memories/activity-events" && method === "POST") {
        activityEvents.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ event: { id: "ev-1" } }), { status: 201 });
      }
      if (url.startsWith("/api/v1/memories?status=active")) {
        return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
      }
      if (url.startsWith("/api/v1/memories?status=pending")) {
        return new Response(JSON.stringify({ memories: pendingList }), { status: 200 });
      }
      if (url.startsWith("/api/v1/memories?status=archived")) {
        return new Response(JSON.stringify({ memories: archivedList }), { status: 200 });
      }
      if (url === "/api/v1/memories" && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const created = makeItem({
          id: `mem-${Date.now()}`,
          kind: body.kind,
          content: body.content,
          scopeTopicSlug: body.scopeTopicSlug ?? null,
          source: "explicit",
          status: "active",
        });
        activeList = [created, ...activeList];
        return new Response(JSON.stringify({ memory: created }), { status: 201 });
      }
      if (url.startsWith("/api/v1/memories/") && method === "PATCH") {
        const id = url.split("/").pop() ?? "";
        const body = JSON.parse(String(init?.body ?? "{}"));
        const target =
          [...activeList, ...pendingList, ...archivedList].find((m) => m.id === id) ?? makeItem({ id });
        const updated = { ...target, ...body };
        activeList = activeList.filter((m) => m.id !== id);
        pendingList = pendingList.filter((m) => m.id !== id);
        archivedList = archivedList.filter((m) => m.id !== id);
        if (body.restoreReplacedId) {
          const restored = archivedList.find((m) => m.id === body.restoreReplacedId);
          if (restored) {
            archivedList = archivedList.filter((m) => m.id !== body.restoreReplacedId);
            activeList = [{ ...restored, status: "active" }, ...activeList];
          }
        } else if (updated.status === "active" && target.replacesMemoryId) {
          const old = activeList.find((m) => m.id === target.replacesMemoryId);
          if (old) {
            activeList = activeList.filter((m) => m.id !== old.id);
            archivedList = [{ ...old, status: "archived" }, ...archivedList];
          }
        }
        if (updated.status === "active") activeList = [updated, ...activeList];
        else if (updated.status === "pending") pendingList = [updated, ...pendingList];
        else archivedList = [updated, ...archivedList];
        return new Response(JSON.stringify({ memory: updated }), { status: 200 });
      }
      if (url === "/api/v1/memories?status=all" && method === "DELETE") {
        activeList = [];
        pendingList = [];
        archivedList = [];
        return new Response(JSON.stringify({ ok: true, deletedCount: 2 }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onPendingCount = vi.fn();
    render(
      <OwnerMemorySheet
        baseUrl={BASE}
        currentTopicSlug="nextjs"
        onPendingCountChange={onPendingCount}
        onClose={vi.fn()}
      />
    );

    // Tab 1 (Abot quan sát) shows both pending replacement diff & observed snippet
    await waitFor(() => expect(screen.getByText("Đang nâng cấp Next.js 16")).toBeTruthy());
    expect(screen.getByText(/Thay thế: “Đang dùng Next.js 14”/)).toBeTruthy();
    expect(screen.getByText("Đang tập trung ôn RAG")).toBeTruthy();
    expect(screen.getByText(/Đọc 3 bài về RAG/)).toBeTruthy();
    expect(onPendingCount).toHaveBeenCalledWith(1);

    // Approve pending -> shows Undo toast, click Undo -> calls restoreReplacedId
    fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Hoàn tác" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, opt]) =>
            u === "/api/v1/memories/mem-pending" &&
            String(opt?.body ?? "").includes('"restoreReplacedId":"mem-old"')
        )
      ).toBe(true)
    );

    // Reject pending -> archives and logs memory_rejected event
    fireEvent.click(screen.getByRole("button", { name: "Không đúng" }));
    await waitFor(() =>
      expect(activityEvents.some((ev) => ev.eventType === "memory_rejected")).toBe(true)
    );

    // Switch to Tab 2 (Bạn chia sẻ trực tiếp) -> filter & create new explicit memory
    fireEvent.click(screen.getByRole("tab", { name: /Bạn chia sẻ trực tiếp/ }));
    await waitFor(() => expect(screen.getByText("Đang dùng Next.js 14")).toBeTruthy());

    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm kiếm ghi nhớ" }), {
      target: { value: "không tồn tại" },
    });
    expect(screen.getByText("Không có mục nào khớp với bộ lọc hiện tại.")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm kiếm ghi nhớ" }), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Thêm ghi nhớ/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Phạm vi bộ nhớ" }), {
      target: { value: "topic" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Nội dung ghi nhớ mới" }), {
      target: { value: "Luôn kèm ví dụ App Router" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(screen.getByText("Luôn kèm ví dụ App Router")).toBeTruthy());

    // Open Settings drawer -> toggle kill-switch + Clear All 2-step confirmation -> Rovo Empty State
    fireEvent.click(screen.getByRole("button", { name: "Cài đặt bộ nhớ" }));
    fireEvent.click(screen.getByRole("switch", { name: "Tự động quan sát và đề xuất" }));
    await waitFor(() => expect(settings.autoObserveEnabled).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "Xoá toàn bộ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá tất cả" }));
    await waitFor(() => expect(screen.getByText("Sẵn sàng ghi nhớ!")).toBeTruthy());
  });

  it("supports Promote to Lesson with retry on error", async () => {
    const activeList: OwnerMemoryItem[] = [
      makeItem({
        id: "mem-promote",
        kind: "learning_note",
        content: "useTransition giữ UI phản hồi khi render tác vụ nặng",
        scopeTopicSlug: "nextjs",
        source: "observed",
      }),
    ];
    let createAttempts = 0;
    const roadmapUpdatedEvents: Array<{ toolName?: string; result?: string }> = [];
    const onRoadmapUpdated = (ev: Event) => {
      roadmapUpdatedEvents.push((ev as CustomEvent).detail ?? {});
    };
    window.addEventListener("roadmap:updated", onRoadmapUpdated);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url === "/api/v1/memories/settings") {
        return new Response(JSON.stringify({ settings: { id: "default", memoryEnabled: true, autoObserveEnabled: true } }), { status: 200 });
      }
      if (url.startsWith("/api/v1/memories?status=active")) {
        return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
      }
      if (url.startsWith("/api/v1/memories?status=pending")) {
        return new Response(JSON.stringify({ memories: [] }), { status: 200 });
      }
      if (url === "/api/v1/roadmaps") {
        return new Response(
          JSON.stringify({ roadmaps: [{ id: "r1", slug: "react", title: "React 19", order: 1 }] }),
          { status: 200 }
        );
      }
      if (url === "/api/v1/roadmaps/react?mode=outline") {
        return new Response(
          JSON.stringify({ roadmap: { id: "r1", slug: "react", title: "React 19", order: 1 }, items: [], sections: ["Concurrency"] }),
          { status: 200 }
        );
      }
      if (url === "/api/v1/roadmaps/items" && method === "POST") {
        createAttempts += 1;
        if (createAttempts === 1) {
          return new Response(JSON.stringify({ error: "Tiêu đề trùng" }), { status: 400 });
        }
        return new Response(JSON.stringify({ item: { id: "it-1", slug: "concurrent-usetransition" } }), { status: 201 });
      }
      if (url === "/api/v1/memories/mem-promote" && method === "PATCH") {
        return new Response(JSON.stringify({ memory: makeItem({ id: "mem-promote", status: "archived" }) }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<OwnerMemorySheet baseUrl={BASE} currentTopicSlug="nextjs" onClose={vi.fn()} />);
      await waitFor(() =>
        expect(screen.getByText("useTransition giữ UI phản hồi khi render tác vụ nặng")).toBeTruthy()
      );
      fireEvent.click(screen.getByRole("button", { name: "Đưa vào Lesson" }));
      await waitFor(() => expect(screen.getByText("React 19")).toBeTruthy());

      fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề Lesson" }), {
        target: { value: "Concurrent useTransition" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận đưa vào Lesson" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Tiêu đề trùng"));

      fireEvent.click(screen.getByRole("button", { name: "Xác nhận đưa vào Lesson" }));
      await waitFor(() => expect(roadmapUpdatedEvents).toHaveLength(1));
    } finally {
      window.removeEventListener("roadmap:updated", onRoadmapUpdated);
    }
  });

  it("hides Bộ nhớ in Visitor widget and isolates pending count polling", async () => {
    vi.useFakeTimers();
    const pendingResponses = [0, 0, 1, 2];
    const fetchMock = vi.fn(async () => {
      const nextLen = pendingResponses.shift() ?? 2;
      const memories = Array.from({ length: nextLen }, (_, idx) => makeItem({ id: `p-${idx}`, status: "pending" }));
      return new Response(JSON.stringify({ memories }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RoadmapChatbotWidget baseUrl={BASE} canWrite={false} initialOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    expect(screen.queryByRole("menuitem", { name: /Bộ nhớ/ })).toBeNull();

    function Harness({ enabled, isStreaming }: { enabled: boolean; isStreaming: boolean }) {
      const [count] = usePendingMemoryCount(BASE, enabled, isStreaming);
      return <span data-testid="pending-count">{count}</span>;
    }

    const { rerender } = render(<Harness enabled={false} isStreaming={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<Harness enabled isStreaming={false} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("0");

    rerender(<Harness enabled isStreaming />);
    rerender(<Harness enabled isStreaming={false} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(OWNER_MEMORIES_UPDATED_EVENT));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("2");
  });
});
