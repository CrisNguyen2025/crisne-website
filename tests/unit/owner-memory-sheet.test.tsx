// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerMemorySheet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet";
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
});
