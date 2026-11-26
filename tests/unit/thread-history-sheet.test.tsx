// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import type { ThreadSummary } from "@/roadmap-rag-assistant/sdk/typescript/src/types";
import { WELCOME_MESSAGE_ID } from "@/roadmap-rag-assistant/sdk/typescript/src/react/welcome";
import { expectNoA11yViolations } from "../setup/a11y";

const BASE = "/api/roadmap-assistant";

function makeThreads(): ThreadSummary[] {
  return [
    {
      threadId: "t-current",
      title: "Hỏi về RAG Hybrid",
      matchedSnippet: null,
      lastMessageAt: new Date(Date.now() - 35 * 60_000).toISOString(),
      messageCount: 4,
      activeTopicSlug: "ai-architecture",
      activeTopicTitle: "AI & LLM Architecture",
      activeLessonTitle: null,
      isClosed: false,
    },
    {
      threadId: "t-old",
      title: "Ôn tập App Router",
      matchedSnippet: null,
      lastMessageAt: new Date(Date.now() - 16 * 3600_000).toISOString(),
      messageCount: 6,
      activeTopicSlug: "nextjs",
      activeTopicTitle: "Next.js",
      activeLessonTitle: null,
      isClosed: true,
    },
  ];
}

describe("ThreadHistorySheet inside RoadmapChatbotWidget", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens Bottom Sheet, searches, switches to another Thread, and passes axe-core a11y", async () => {
    let threads = makeThreads();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (method === "GET" && url === `${BASE}/threads`) {
        return new Response(JSON.stringify({ threads }), { status: 200 });
      }
      if (method === "GET" && url.startsWith(`${BASE}/threads?q=`)) {
        return new Response(
          JSON.stringify({
            threads: [
              {
                ...threads[1],
                matchedSnippet: "…cấu trúc App Router và Server Actions…",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (method === "PATCH" && url === `${BASE}/threads/t-old`) {
        return new Response(
          JSON.stringify({
            threadId: "t-old",
            messages: [
              { id: "restored-1", role: "user", content: "Ôn tập App Router", timestamp: "2026-11-25T10:00:00.000Z" },
              { id: "restored-2", role: "assistant", content: "Nội dung App Router đã khôi phục", timestamp: "2026-11-25T10:00:05.000Z" },
            ],
            state: { activeTopicSlug: "nextjs", activeTopicTitle: "Next.js" },
          }),
          { status: 200 }
        );
      }
      if (method === "DELETE" && url === `${BASE}/threads/t-current`) {
        threads = threads.filter((t) => t.threadId !== "t-current");
        return new Response(JSON.stringify({ ok: true, threadId: "t-current" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite threadId="t-current" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));

    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());
    expect(screen.getByText("Đang mở")).toBeTruthy();
    expect(screen.getByText("AI & LLM Architecture")).toBeTruthy();
    expect(screen.getByText("Ôn tập App Router")).toBeTruthy();

    await expectNoA11yViolations(container);

    // Search filters immediately and then shows server matchedSnippet
    const searchInput = screen.getByLabelText("Tìm kiếm lịch sử chat");
    fireEvent.change(searchInput, { target: { value: "App Router" } });

    await waitFor(
      () =>
        expect(
          screen.getByText(
            (_content, element) =>
              element?.tagName === "P" &&
              element.textContent === "…cấu trúc App Router và Server Actions…"
          )
        ).toBeTruthy(),
      { timeout: 1500 }
    );
    expect(screen.getByText("App Router", { selector: "mark" })).toBeTruthy();

    // Click row switches active Thread and closes sheet smoothly
    fireEvent.click(screen.getByRole("button", { name: /^Ôn tập App Router/ }));
    await waitFor(() => expect(screen.getByText("Nội dung App Router đã khôi phục")).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());
  });

  it("supports two-step delete with toast notification, resets active Thread to welcome, and handles Escape dismissal", async () => {
    let threads = makeThreads();
    const onNotify = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url === `${BASE}/threads`) {
          return new Response(JSON.stringify({ threads }), { status: 200 });
        }
        if (method === "DELETE" && url === `${BASE}/threads/t-current`) {
          threads = threads.filter((t) => t.threadId !== "t-current");
          return new Response(JSON.stringify({ ok: true, threadId: "t-current" }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      })
    );

    render(
      <RoadmapChatbotWidget
        baseUrl={BASE}
        initialOpen
        canWrite
        threadId="t-current"
        onNotify={onNotify}
        initialMessages={[
          { id: WELCOME_MESSAGE_ID, role: "assistant", content: "Xin chào", timestamp: new Date() },
          { id: "u1", role: "user", content: "Hỏi về RAG Hybrid", timestamp: new Date() },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());

    // First click enters confirm state, Escape cancels confirm without closing sheet
    fireEvent.click(screen.getByRole("button", { name: "Xoá cuộc trò chuyện Hỏi về RAG Hybrid" }));
    expect(screen.getByRole("button", { name: "Xác nhận xoá Hỏi về RAG Hybrid" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Xác nhận xoá Hỏi về RAG Hybrid" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Lịch sử chat" })).toBeTruthy();

    // Confirm deletion removes current Thread, triggers toast, and resets chat to greeting
    fireEvent.click(screen.getByRole("button", { name: "Xoá cuộc trò chuyện Hỏi về RAG Hybrid" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá Hỏi về RAG Hybrid" }));

    await waitFor(() => expect(screen.queryByText("Hỏi về RAG Hybrid")).toBeNull());
    expect(onNotify).toHaveBeenCalledWith("Đã xoá cuộc trò chuyện", "success");

    // Escape closes sheet smoothly
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());
    expect(screen.getByText(/Xin chào, mình là Abot/)).toBeTruthy();
  });

  it("handles list error retry, empty/no-match states, clear search, and backdrop click", async () => {
    const threads = makeThreads();
    let listAttempts = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${BASE}/threads`) {
          listAttempts += 1;
          if (listAttempts === 1) {
            return new Response("Server Error", { status: 500 });
          }
          return new Response(JSON.stringify({ threads }), { status: 200 });
        }
        if (url.startsWith(`${BASE}/threads?q=khong_ton_tai`)) {
          return new Response(JSON.stringify({ threads: [] }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      })
    );

    render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite threadId="t-current" />);

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("500"));

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());

    // Empty search result + clear search button restores Recents
    const searchInput = screen.getByLabelText("Tìm kiếm lịch sử chat") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "khong_ton_tai" } });
    await waitFor(() =>
      expect(screen.getByText("Không tìm thấy cuộc trò chuyện phù hợp.")).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: "Xoá từ khoá tìm kiếm" }));
    expect(searchInput.value).toBe("");
    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());

    // Backdrop click closes sheet smoothly
    const dialog = screen.getByRole("dialog", { name: "Lịch sử chat" });
    fireEvent.click(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());
  });

  it("shows empty 30-day message and keeps current chat intact with error toast when switching fails", async () => {
    const threads = makeThreads();
    const onNotify = vi.fn();
    let phase: "empty" | "loaded" = "empty";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url === `${BASE}/threads`) {
          return new Response(JSON.stringify({ threads: phase === "empty" ? [] : threads }), {
            status: 200,
          });
        }
        if (method === "PATCH" && url === `${BASE}/threads/t-old`) {
          return new Response("Bad Gateway", { status: 502 });
        }
        return new Response("Not found", { status: 404 });
      })
    );

    const { rerender } = render(
      <RoadmapChatbotWidget
        baseUrl={BASE}
        initialOpen
        canWrite
        threadId="t-current"
        onNotify={onNotify}
        initialMessages={[
          { id: "u-live", role: "user", content: "Câu đang chat", timestamp: new Date() },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() =>
      expect(screen.getByText("Chưa có cuộc trò chuyện nào trong 30 ngày qua.")).toBeTruthy()
    );

    phase = "loaded";
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());

    rerender(
      <RoadmapChatbotWidget
        baseUrl={BASE}
        initialOpen
        canWrite
        threadId="t-current"
        onNotify={onNotify}
        initialMessages={[
          { id: "u-live", role: "user", content: "Câu đang chat", timestamp: new Date() },
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() => expect(screen.getByText("Ôn tập App Router")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Ôn tập App Router/ }));
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("502"), "error")
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());

    // Background conversation stays untouched on failure
    expect(screen.getByText("Câu đang chat")).toBeTruthy();
  });

  it("focuses search on desktop, avoids keyboard jump and locks drawer swipe on mobile", async () => {
    const threads = makeThreads();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === `${BASE}/threads`) {
          return new Response(JSON.stringify({ threads }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      })
    );

    // Desktop (>= 768px): search input receives autoFocus
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    const desktop = render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite threadId="t-current" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByLabelText("Tìm kiếm lịch sử chat"));
    desktop.unmount();

    // Mobile (< 768px): close button gets focus (not search) and right-swipe does not close drawer while sheet is open
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 767px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

    const mobile = render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite threadId="t-current" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
    await waitFor(() => expect(screen.getByText("Hỏi về RAG Hybrid")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng lịch sử chat" }));

    const panel = mobile.container.querySelector("[data-abot-overlay-root]") as HTMLElement;
    fireEvent.touchStart(panel, { touches: [{ clientX: 20, clientY: 200 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 180, clientY: 200 }] });
    fireEvent.touchEnd(panel);

    expect(panel.style.transform).toBe("");
    expect(mobile.container.querySelector("[data-abot-overlay-root]")).toBeTruthy();
  });
});
