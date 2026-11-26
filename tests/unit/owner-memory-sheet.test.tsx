// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerMemorySheet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import {
  OWNER_MEMORIES_UPDATED_EVENT,
  usePendingMemoryCount,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/useOwnerMemories";
import type { OwnerMemoryItem } from "@/roadmap-rag-assistant/sdk/typescript/src/types";

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
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    lastUsedAt: null,
  };
}

describe("OwnerMemorySheet & useOwnerMemories", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads active & pending memories, creates topic-scoped memory, edits inline, approves pending, and deletes", async () => {
    let activeList: OwnerMemoryItem[] = [makeItem()];
    let pendingList: OwnerMemoryItem[] = [
      makeItem({
        id: "mem-pending",
        kind: "preference",
        content: "Luôn kèm mục Lỗi hay gặp",
        source: "suggested",
        status: "pending",
      }),
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url.includes("status=active")) {
        return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
      }
      if (method === "GET" && url.includes("status=pending")) {
        return new Response(JSON.stringify({ memories: pendingList }), { status: 200 });
      }
      if (method === "POST" && url === "/api/v1/memories") {
        const body = JSON.parse(String(init?.body));
        const created = makeItem({
          id: "mem-created",
          kind: body.kind,
          content: body.content,
          scopeTopicSlug: body.scopeTopicSlug ?? null,
        });
        activeList = [created, ...activeList];
        return new Response(JSON.stringify({ memory: created }), { status: 201 });
      }
      if (method === "PATCH" && url.startsWith("/api/v1/memories/")) {
        const id = url.split("/").pop()!;
        const body = JSON.parse(String(init?.body));
        if (body.status === "active") {
          const target = pendingList.find((m) => m.id === id)!;
          const approved = { ...target, status: "active" as const };
          pendingList = pendingList.filter((m) => m.id !== id);
          activeList = [approved, ...activeList];
          return new Response(JSON.stringify({ memory: approved }), { status: 200 });
        }
        activeList = activeList.map((m) => (m.id === id ? { ...m, ...body } : m));
        const updated = activeList.find((m) => m.id === id)!;
        return new Response(JSON.stringify({ memory: updated }), { status: 200 });
      }
      if (method === "DELETE" && url.startsWith("/api/v1/memories/")) {
        const id = url.split("/").pop()!;
        activeList = activeList.filter((m) => m.id !== id);
        pendingList = pendingList.filter((m) => m.id !== id);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onClose = vi.fn();
    render(<OwnerMemorySheet baseUrl={BASE} currentTopicSlug="nextjs" onClose={onClose} />);

    // Initial load shows active & pending counts
    await waitFor(() => expect(screen.getByText("Đang dùng Next.js 15 và FastAPI")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Đang nhớ (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chờ duyệt (1)" })).toBeTruthy();

    // Create a topic-scoped goal memory
    fireEvent.change(screen.getByLabelText("Loại bộ nhớ"), { target: { value: "goal" } });
    fireEvent.change(screen.getByLabelText("Phạm vi bộ nhớ"), { target: { value: "topic" } });
    fireEvent.change(screen.getByPlaceholderText(/Đang dùng Next\.js 15/), {
      target: { value: "Hoàn thành App Router trong Q4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Đang nhớ (2)" })).toBeTruthy();
      expect(screen.getByText("topic: nextjs")).toBeTruthy();
    });
    expect(screen.getByText("Hoàn thành App Router trong Q4")).toBeTruthy();

    // Inline edit the first active memory
    const editButtons = screen.getAllByRole("button", { name: "Sửa mục bộ nhớ" });
    fireEvent.click(editButtons[0]);
    const editTextarea = screen.getByDisplayValue("Hoàn thành App Router trong Q4");
    fireEvent.change(editTextarea, { target: { value: "Hoàn thành App Router & RSC" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).toBeNull();
      expect(screen.getByText("Hoàn thành App Router & RSC")).toBeTruthy();
    });

    // Switch to pending tab and approve
    fireEvent.click(screen.getByRole("button", { name: "Chờ duyệt (1)" }));
    await waitFor(() => expect(screen.getByText("Luôn kèm mục Lỗi hay gặp")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Chờ duyệt (0)" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Đang nhớ (3)" })).toBeTruthy();

    // Switch back to active tab and delete one item
    fireEvent.click(screen.getByRole("button", { name: "Đang nhớ (3)" }));
    const deleteButtons = await screen.findAllByRole("button", { name: "Xoá mục bộ nhớ" });
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Đang nhớ (2)" })).toBeTruthy());

    // Escape closes the sheet and stops propagation
    const parentKeyListener = vi.fn();
    document.addEventListener("keydown", parentKeyListener);
    fireEvent.keyDown(document, { key: "Escape" });
    document.removeEventListener("keydown", parentKeyListener);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(parentKeyListener).not.toHaveBeenCalled();
  });

  it("shows an error banner and retries loading when the API fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ memories: [makeItem()] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ memories: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OwnerMemorySheet baseUrl={BASE} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Không tải được bộ nhớ/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByText("Đang dùng Next.js 15 và FastAPI")).toBeTruthy());
  });

  it("shows replacement target text for pending suggestions with replacesMemoryId and notifies count", async () => {
    const active = [makeItem({ id: "old-1", content: "Đang dùng Next.js 14" })];
    const pending = [
      makeItem({
        id: "new-1",
        content: "Đã nâng cấp lên Next.js 15",
        source: "suggested",
        status: "pending",
        replacesMemoryId: "old-1",
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("status=active")) return new Response(JSON.stringify({ memories: active }), { status: 200 });
        return new Response(JSON.stringify({ memories: pending }), { status: 200 });
      })
    );

    const onPendingCountChange = vi.fn();
    render(
      <OwnerMemorySheet baseUrl={BASE} onPendingCountChange={onPendingCountChange} onClose={vi.fn()} />
    );

    await waitFor(() => expect(onPendingCountChange).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getByRole("button", { name: "Chờ duyệt (1)" }));
    await waitFor(() => expect(screen.getByText(/Thay thế: “Đang dùng Next\.js 14”/)).toBeTruthy());
  });

  it("wires pendingMemoryCount badge for Owner and never fetches memories for Visitor", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/memories?status=pending")) {
        return new Response(
          JSON.stringify({ memories: [makeItem({ id: "p1", status: "pending" }), makeItem({ id: "p2", status: "pending" })] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ memories: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    // 1. Visitor: zero memory requests
    const { unmount } = render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite={false} restoreLatestThread={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    // 2. Owner: fetches pending count and displays badge "2" next to Bộ nhớ
    render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite restoreLatestThread />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/memories?status=pending", { cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    await waitFor(() => {
      expect(screen.getByText("Bộ nhớ")).toBeTruthy();
      expect(screen.getByText("2")).toBeTruthy();
    });
  });

  it("edits kind, scope, and content on Chờ duyệt tab before approving, and warns at 10 pending items", async () => {
    let activeList: OwnerMemoryItem[] = [];
    let pendingList: OwnerMemoryItem[] = Array.from({ length: 10 }, (_, idx) =>
      makeItem({
        id: `mem-p-${idx}`,
        kind: "learning_note",
        content: idx === 0 ? "Hay quên stale closure trong hook" : `Ghi chú chờ ${idx}`,
        source: "suggested",
        status: "pending",
      })
    );
    const patchCalls: Array<{ id: string; body: Record<string, unknown> }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url.includes("status=active")) {
          return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
        }
        if (method === "GET" && url.includes("status=pending")) {
          return new Response(JSON.stringify({ memories: pendingList }), { status: 200 });
        }
        if (method === "PATCH" && url.startsWith("/api/v1/memories/")) {
          const id = url.split("/").pop()!;
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          patchCalls.push({ id, body });
          if (body.status === "active") {
            const target = pendingList.find((m) => m.id === id)!;
            const approved = { ...target, status: "active" as const };
            pendingList = pendingList.filter((m) => m.id !== id);
            activeList = [approved, ...activeList];
            return new Response(JSON.stringify({ memory: approved }), { status: 200 });
          }
          pendingList = pendingList.map((m) => (m.id === id ? { ...m, ...body } : m));
          return new Response(JSON.stringify({ memory: pendingList.find((m) => m.id === id) }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      })
    );

    render(<OwnerMemorySheet baseUrl={BASE} currentTopicSlug="react" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Chờ duyệt (10)" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("10/10");

    fireEvent.click(screen.getByRole("button", { name: "Chờ duyệt (10)" }));
    await waitFor(() => expect(screen.getByText("Hay quên stale closure trong hook")).toBeTruthy());

    const editButtons = screen.getAllByRole("button", { name: "Sửa mục bộ nhớ" });
    fireEvent.click(editButtons[0]);

    fireEvent.change(screen.getByLabelText("Loại bộ nhớ khi sửa"), { target: { value: "preference" } });
    fireEvent.change(screen.getByLabelText("Phạm vi bộ nhớ khi sửa"), { target: { value: "react" } });
    fireEvent.change(screen.getByLabelText("Nội dung bộ nhớ khi sửa"), {
      target: { value: "Luôn giải thích stale closure kèm dependency array" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => {
      expect(screen.getByText("Luôn giải thích stale closure kèm dependency array")).toBeTruthy();
      expect(screen.getByText("topic: react")).toBeTruthy();
    });
    expect(patchCalls[0]).toEqual({
      id: "mem-p-0",
      body: {
        kind: "preference",
        content: "Luôn giải thích stale closure kèm dependency array",
        scopeTopicSlug: "react",
      },
    });
    expect(screen.getByRole("button", { name: "Chờ duyệt (10)" })).toBeTruthy();

    const approveButtons = screen.getAllByRole("button", { name: "Duyệt" });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Chờ duyệt (9)" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Đang nhớ (1)" })).toBeTruthy();
    expect(patchCalls[1]).toEqual({ id: "mem-p-0", body: { status: "active" } });
  });

  it("lazily loads Đã gỡ (archived) tab, supports restore and permanent delete", async () => {
    let activeList: OwnerMemoryItem[] = [];
    let archivedList: OwnerMemoryItem[] = [
      makeItem({ id: "arch-1", content: "Mục đã lưu trữ 1", status: "archived" }),
      makeItem({ id: "arch-2", content: "Mục đã lưu trữ 2", status: "archived" }),
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("status=active")) {
        return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
      }
      if (method === "GET" && url.includes("status=pending")) {
        return new Response(JSON.stringify({ memories: [] }), { status: 200 });
      }
      if (method === "GET" && url.includes("status=archived")) {
        return new Response(JSON.stringify({ memories: archivedList }), { status: 200 });
      }
      if (method === "PATCH" && url === "/api/v1/memories/arch-1") {
        const target = archivedList.find((m) => m.id === "arch-1")!;
        archivedList = archivedList.filter((m) => m.id !== "arch-1");
        const restored = { ...target, status: "active" as const };
        activeList = [restored, ...activeList];
        return new Response(JSON.stringify({ memory: restored }), { status: 200 });
      }
      if (method === "DELETE" && url === "/api/v1/memories/arch-2") {
        archivedList = archivedList.filter((m) => m.id !== "arch-2");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OwnerMemorySheet baseUrl={BASE} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Đang nhớ (0)" })).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("status=archived"), expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Đã gỡ" }));
    await waitFor(() => expect(screen.getByText("Mục đã lưu trữ 1")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Đã gỡ (2)" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Khôi phục" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Đang nhớ (1)" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Đã gỡ (1)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Xoá mục bộ nhớ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã gỡ (0)" })).toBeTruthy());
    expect(screen.getByText("Không có mục nào đã gỡ.")).toBeTruthy();
  });

  it("promotes a memory to a target Lesson, archives the memory, and dispatches roadmap:updated", async () => {
    let activeList: OwnerMemoryItem[] = [
      makeItem({
        id: "mem-promote",
        kind: "learning_note",
        scopeTopicSlug: "react",
        content: "useTransition giữ UI phản hồi khi render tác vụ nặng",
      }),
    ];
    let shouldFailCreate = true;
    const roadmapUpdatedEvents: Array<{ toolName?: string; result?: string }> = [];
    const onRoadmapUpdated = (event: Event) => {
      roadmapUpdatedEvents.push((event as CustomEvent<{ toolName?: string; result?: string }>).detail);
    };
    window.addEventListener("roadmap:updated", onRoadmapUpdated);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("status=active")) {
        return new Response(JSON.stringify({ memories: activeList }), { status: 200 });
      }
      if (method === "GET" && url.includes("status=pending")) {
        return new Response(JSON.stringify({ memories: [] }), { status: 200 });
      }
      if (method === "GET" && url === "/api/v1/roadmaps") {
        return new Response(
          JSON.stringify({
            roadmaps: [
              { id: "t-react", slug: "react", title: "React 19", order: 1 },
              { id: "t-next", slug: "nextjs", title: "Next.js", order: 2 },
            ],
          }),
          { status: 200 }
        );
      }
      if (method === "GET" && url === "/api/v1/roadmaps/react?mode=outline") {
        return new Response(
          JSON.stringify({
            roadmap: { id: "t-react", slug: "react", title: "React 19", order: 1 },
            items: [],
            sections: ["Hooks", "Concurrency", null],
          }),
          { status: 200 }
        );
      }
      if (method === "POST" && url === "/api/v1/roadmaps/items") {
        if (shouldFailCreate) {
          shouldFailCreate = false;
          return new Response(JSON.stringify({ error: "Lesson đã tồn tại" }), { status: 409 });
        }
        return new Response(
          JSON.stringify({
            item: {
              id: "lesson-new",
              slug: "concurrent-usetransition",
              title: "Concurrent useTransition",
              description: "useTransition giữ UI phản hồi khi render tác vụ nặng",
              section: "Concurrency",
              order: 1,
              roadmapSlug: "react",
              createdAt: "2026-11-26T00:00:00.000Z",
              updatedAt: "2026-11-26T00:00:00.000Z",
            },
          }),
          { status: 201 }
        );
      }
      if (method === "PATCH" && url === "/api/v1/memories/mem-promote") {
        activeList = [];
        return new Response(
          JSON.stringify({
            memory: makeItem({ id: "mem-promote", status: "archived" }),
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<OwnerMemorySheet baseUrl={BASE} currentTopicSlug="nextjs" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("useTransition giữ UI phản hồi khi render tác vụ nặng")).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: "Đưa vào Lesson" }));
      await waitFor(() => expect(screen.getByRole("option", { name: "Concurrency" })).toBeTruthy());

      expect((screen.getByLabelText("Topic đích") as HTMLSelectElement).value).toBe("react");
      fireEvent.change(screen.getByLabelText("Section đích"), { target: { value: "Concurrency" } });
      fireEvent.change(screen.getByLabelText("Tiêu đề Lesson"), { target: { value: "Concurrent useTransition" } });

      // First submit returns 409 error and must NOT archive the memory
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận đưa vào Lesson" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Lesson đã tồn tại"));
      expect(activeList).toHaveLength(1);

      // Retry succeeds, dispatches roadmap:updated, and archives the memory
      fireEvent.click(screen.getByRole("button", { name: "Xác nhận đưa vào Lesson" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Đang nhớ (0)" })).toBeTruthy());

      expect(roadmapUpdatedEvents).toEqual([
        { toolName: "promote_concept_to_lesson", result: "concurrent-usetransition" },
      ]);
      const createCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/v1/roadmaps/items" && init?.method === "POST");
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        roadmapSlug: "react",
        title: "Concurrent useTransition",
        section: "Concurrency",
        description: "useTransition giữ UI phản hồi khi render tác vụ nặng",
        status: "target",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/memories/mem-promote",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "archived" }) })
      );
    } finally {
      window.removeEventListener("roadmap:updated", onRoadmapUpdated);
    }
  });

  it("refreshes pending count adaptively after stream end and on memory mutation events", async () => {
    vi.useFakeTimers();
    const pendingResponses = [0, 0, 1, 2];
    const fetchMock = vi.fn(async () => {
      const nextLen = pendingResponses.shift() ?? 2;
      const memories = Array.from({ length: nextLen }, (_, idx) => makeItem({ id: `p-${idx}`, status: "pending" }));
      return new Response(JSON.stringify({ memories }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    function Harness({ enabled, isStreaming }: { enabled: boolean; isStreaming: boolean }) {
      const [count] = usePendingMemoryCount(BASE, enabled, isStreaming);
      return <span data-testid="pending-count">{count}</span>;
    }

    const { rerender } = render(<Harness enabled={false} isStreaming={false} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(OWNER_MEMORIES_UPDATED_EVENT));
      await vi.advanceTimersByTimeAsync(2000);
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
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Stops polling once count increases; subsequent timers do not fire extra requests
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Instant refresh on mutation event from OwnerMemorySheet
    await act(async () => {
      window.dispatchEvent(new CustomEvent(OWNER_MEMORIES_UPDATED_EVENT));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("pending-count").textContent).toBe("2");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
