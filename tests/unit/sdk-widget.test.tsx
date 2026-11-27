// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import { CollapsibleReferenceSummary } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ReferenceSummary";
import { resolvePageContextRef } from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/pageContextRef";

const BASE = "/api/roadmap-assistant";

function openWidget(canWrite: boolean) {
  return render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite={canWrite} />);
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
}

describe("RoadmapChatbotWidget", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("menu by access (P1-5, P1-7)", () => {
    it("reader: puts disabled New Chat and Close outside menu, and Context without conversation id or history inside menu", async () => {
      openWidget(false);
      const newChatBtn = screen.getByRole("button", { name: "Cuộc trò chuyện mới" }) as HTMLButtonElement;
      expect(newChatBtn.disabled).toBe(true);
      expect(screen.queryByRole("button", { name: "Lịch sử chat" })).toBeNull();
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      await openMenu();
      expect(screen.getByRole("button", { name: "Context" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Lịch sử chat" })).toBeNull();
      expect(screen.queryByText("Thu gọn")).toBeNull();
      expect(screen.queryByText("Mã hội thoại")).toBeNull();
    });

    it("owner: moves chat history into more options alongside memory, context, and conversation id", async () => {
      openWidget(true);
      expect(screen.queryByRole("button", { name: "Lịch sử chat" })).toBeNull();
      await openMenu();
      expect(screen.getByRole("button", { name: "Lịch sử chat" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Context" })).toBeTruthy();
      expect(screen.getByText("Bộ nhớ")).toBeTruthy();
      expect(screen.getByText("Mã hội thoại")).toBeTruthy();
    });

    it("opens more options items as centered dialogs sized per option and keeps Abot panel open on modal interactions", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/threads")) {
            return new Response(JSON.stringify({ threads: [] }), { status: 200 });
          }
          if (url.endsWith("/chat/context")) {
            return new Response(
              JSON.stringify({
                model: "openai/gpt-oss-120b",
                window: 131_072,
                budget: 10_000,
                used: 1_000,
                parts: [{ key: "system", label: "System prompt", tokens: 1_000 }],
                reserved: [],
                omitted: [],
                last_turn: null,
              }),
              { status: 200 }
            );
          }
          if (url.startsWith("/api/v1/memories/settings")) {
            return new Response(
              JSON.stringify({
                settings: { id: "default", memoryEnabled: true, autoObserveEnabled: true },
              }),
              { status: 200 }
            );
          }
          if (url.startsWith("/api/v1/memories")) {
            return new Response(JSON.stringify({ memories: [] }), { status: 200 });
          }
          return new Response("{}", { status: 404 });
        })
      );

      openWidget(true);

      // 1. Context -> compact centered dialog ("sm")
      await openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Context" }));
      const contextDialog = screen.getByRole("dialog", { name: "Context" });
      expect(contextDialog.parentElement?.className).toContain("items-center");
      expect(contextDialog.parentElement?.className).toContain("justify-center");
      expect(contextDialog.className).toContain("rounded-2xl");
      expect(contextDialog.className).not.toContain("rounded-t-2xl");
      expect(contextDialog.className).toContain("lg:max-w-[32rem]");

      // Clicking inside or on modal backdrop closes only the dialog, keeping Abot open
      fireEvent.mouseDown(contextDialog);
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();
      fireEvent.mouseDown(contextDialog.parentElement!);
      fireEvent.click(contextDialog.parentElement!);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Context" })).toBeNull());
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // 2. Lịch sử chat -> medium centered dialog ("md")
      await openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Lịch sử chat" }));
      const historyDialog = screen.getByRole("dialog", { name: "Lịch sử chat" });
      expect(historyDialog.className).toContain("rounded-2xl");
      expect(historyDialog.className).toContain("lg:max-w-[38rem]");
      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lịch sử chat" })).toBeNull());
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // 3. Bộ nhớ -> large centered dialog ("lg")
      await openMenu();
      fireEvent.click(screen.getByRole("button", { name: /Bộ nhớ/ }));
      const memoryDialog = screen.getByRole("dialog", { name: "Bộ nhớ Abot" });
      expect(memoryDialog.className).toContain("rounded-2xl");
      expect(memoryDialog.className).toContain("lg:max-w-[46rem]");
      fireEvent.click(screen.getByRole("button", { name: "Đóng bảng bộ nhớ" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bộ nhớ Abot" })).toBeNull());
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();
    });

    it("enables New Chat after a message is sent and resets to disabled init stage on click", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":"đã trả lời"}\n\n'));
                c.close();
              },
            }),
            { status: 200 }
          )
        )
      );
      openWidget(false);
      const newChatBtn = screen.getByRole("button", { name: "Cuộc trò chuyện mới" }) as HTMLButtonElement;
      expect(newChatBtn.disabled).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Xem lộ trình" }));
      await screen.findByText("đã trả lời");
      expect(newChatBtn.disabled).toBe(false);

      fireEvent.click(newChatBtn);
      expect(screen.getByText(/Xin chào, mình là Abot/)).toBeTruthy();
      expect(newChatBtn.disabled).toBe(true);
    });
  });

  describe("top-right Switch to (Floating / Sidebar) and Close", () => {
    it("switches between Floating and Sidebar modes, pushes page layout, and closes via X button", () => {
      Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
          matches: query === "(min-width: 48rem)",
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      );

      const { container, unmount } = openWidget(false);
      const panel = container.querySelector("[data-abot-overlay-root]") as HTMLElement;
      expect(panel.getAttribute("data-abot-view-mode")).toBe("floating");
      expect(screen.getByRole("separator", { name: "Kéo để thay đổi chiều cao Abot" })).toBeTruthy();
      expect(document.documentElement.dataset.abotSidebar).toBeUndefined();

      fireEvent.click(screen.getByRole("button", { name: "Switch to" }));
      expect(screen.getByText("Switch to")).toBeTruthy();
      const floatingOpt = screen.getByRole("button", { name: "Floating" });
      const sidebarOpt = screen.getByRole("button", { name: "Sidebar" });
      expect(floatingOpt.getAttribute("aria-pressed")).toBe("true");
      expect(sidebarOpt.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(sidebarOpt);
      expect(panel.getAttribute("data-abot-view-mode")).toBe("sidebar");
      expect(panel.className).toContain("md:h-dvh");
      expect(panel.className).toContain("md:border-l");
      expect(panel.style.height).toBe("");
      expect(screen.queryByRole("separator", { name: "Kéo để thay đổi chiều cao Abot" })).toBeNull();
      const widthHandle = screen.getByRole("separator", { name: "Kéo để thay đổi chiều rộng Abot" });
      expect(widthHandle).toBeTruthy();
      expect(widthHandle.getAttribute("aria-orientation")).toBe("vertical");
      expect(document.documentElement.dataset.abotSidebar).toBe("true");
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("25rem");

      // Keyboard resize widens and resets on double-click
      fireEvent.keyDown(widthHandle, { key: "ArrowLeft" });
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("26.5rem");
      expect(panel.style.width).toBe("26.5rem");
      fireEvent.doubleClick(widthHandle);
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("25rem");
      expect(panel.style.width).toBe("25rem");

      // Dragging left edge widens the sidebar and persists to sessionStorage
      fireEvent.mouseDown(widthHandle, { button: 0, clientX: 1040 });
      expect(document.documentElement.dataset.abotResizing).toBe("true");
      fireEvent.mouseMove(window, { clientX: 960 });
      fireEvent.mouseUp(window);
      expect(document.documentElement.dataset.abotResizing).toBeUndefined();
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("30rem");
      expect(panel.style.width).toBe("30rem");
      expect(window.sessionStorage.getItem(`abot:sidebar-width:${BASE}`)).toBe("480");

      // Switch to Floating then back to Sidebar: panel width & --abot-sidebar-width stay in sync
      fireEvent.click(screen.getByRole("button", { name: "Switch to" }));
      fireEvent.click(screen.getByRole("button", { name: "Floating" }));
      expect(panel.style.width).toBe("");
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("");
      expect(panel.style.height).not.toBe("");

      fireEvent.click(screen.getByRole("button", { name: "Switch to" }));
      fireEvent.click(screen.getByRole("button", { name: "Sidebar" }));
      expect(panel.style.height).toBe("");
      expect(panel.style.width).toBe("30rem");
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("30rem");

      // Resizing again after Floating -> Sidebar stays smooth and keeps syncing
      const nextWidthHandle = screen.getByRole("separator", { name: "Kéo để thay đổi chiều rộng Abot" });
      fireEvent.mouseDown(nextWidthHandle, { button: 0, clientX: 960 });
      fireEvent.mouseMove(window, { clientX: 928 });
      fireEvent.mouseUp(window);
      expect(panel.style.width).toBe("32rem");
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("32rem");

      fireEvent.doubleClick(nextWidthHandle);
      expect(document.documentElement.style.getPropertyValue("--abot-sidebar-width")).toBe("25rem");

      // Desktop sidebar stays docked on outside clicks and global Escape
      fireEvent.mouseDown(document.body);
      expect(container.querySelector("[data-abot-overlay-root]")).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(container.querySelector("[data-abot-overlay-root]")).toBeTruthy();

      // Switch back to Floating
      fireEvent.click(screen.getByRole("button", { name: "Switch to" }));
      expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Floating" }));
      expect(panel.getAttribute("data-abot-view-mode")).toBe("floating");
      expect(document.documentElement.dataset.abotSidebar).toBeUndefined();
      expect(screen.getByRole("separator", { name: "Kéo để thay đổi chiều cao Abot" })).toBeTruthy();

      // Switch to Sidebar again, then close with top-right X button
      fireEvent.click(screen.getByRole("button", { name: "Switch to" }));
      fireEvent.click(screen.getByRole("button", { name: "Sidebar" }));
      expect(document.documentElement.dataset.abotSidebar).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: "Đóng Abot" }));
      expect(container.querySelector("[data-abot-overlay-root]")).toBeNull();
      expect(document.documentElement.dataset.abotSidebar).toBeUndefined();
      expect(screen.getByRole("button", { name: "Mở Abot" })).toBeTruthy();

      // Re-opening remembers Sidebar mode in sessionStorage
      fireEvent.click(screen.getByRole("button", { name: "Mở Abot" }));
      const reopened = container.querySelector("[data-abot-overlay-root]") as HTMLElement;
      expect(reopened.getAttribute("data-abot-view-mode")).toBe("sidebar");
      expect(document.documentElement.dataset.abotSidebar).toBe("true");

      unmount();
      expect(document.documentElement.dataset.abotSidebar).toBeUndefined();
    });
  });

  describe("input limit (P1-6)", () => {
    it("caps the input at 2000 characters", () => {
      openWidget(false);
      const input = screen.getByPlaceholderText(/Hỏi Abot/) as HTMLInputElement;
      expect(input.maxLength).toBe(2000);
    });

    it("hides the counter below 1800 and shows it from 1800", () => {
      openWidget(false);
      const input = screen.getByPlaceholderText(/Hỏi Abot/) as HTMLInputElement;

      fireEvent.change(input, { target: { value: "x".repeat(1799) } });
      expect(screen.queryByText(/\/2\.000$/)).toBeNull();

      fireEvent.change(input, { target: { value: "x".repeat(1800) } });
      expect(screen.getByText(/1\.800\/2\.000/)).toBeTruthy();
    });
  });

  describe("error reply (P0-2)", () => {
    it("shows Thử lại on a failed reply and re-sends the question on click", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("boom", { status: 500 }))
        .mockResolvedValueOnce(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":"đã trả lời"}\n\n'));
                c.close();
              },
            }),
            { status: 200 }
          )
        );
      vi.stubGlobal("fetch", fetchMock);
      openWidget(false);

      const input = screen.getByPlaceholderText(/Hỏi Abot/) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "hỏi thử" } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

      const retry = await screen.findByRole("button", { name: "Thử lại" });
      expect(document.body.textContent).not.toMatch(/localhost|:8000|FastAPI/);

      fireEvent.click(retry);
      await waitFor(() => expect(screen.getByText("đã trả lời")).toBeTruthy());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).message).toBe("hỏi thử");
    });
  });

  describe("suggestions by access (P0-1)", () => {
    it("reader sees no suggestion that would create data", () => {
      openWidget(false);
      expect(screen.getByRole("button", { name: "Xem lộ trình" })).toBeTruthy();
      expect(screen.queryByTitle(/^Tạo /)).toBeNull();
      expect(screen.queryByRole("button", { name: "Thao tác nhanh" })).toBeNull();
    });
  });

  describe("feedback", () => {
    const traceId = "0123456789abcdef0123456789abcdef";
    const replyStream = (done: object) =>
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify(done)}\n\n`));
              c.close();
            },
          }),
          { status: 200 }
        )
      );

    async function askAndWait(onFeedback = vi.fn()) {
      render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen onFeedback={onFeedback} />);
      fireEvent.change(screen.getByPlaceholderText(/Hỏi Abot/), { target: { value: "hỏi thử" } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      await screen.findByText("đã trả lời");
      return onFeedback;
    }

    it("sends only the last of rapid clicks, with the trace id the stream sent on done", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời", trace_id: traceId }));
      const onFeedback = await askAndWait();

      const like = screen.getByRole("button", { name: "Câu trả lời hữu ích" });
      fireEvent.click(like);
      fireEvent.click(like);
      fireEvent.click(like);
      expect(like.getAttribute("aria-pressed")).toBe("true");
      expect(onFeedback).not.toHaveBeenCalled();

      await waitFor(() => expect(onFeedback).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(onFeedback).toHaveBeenCalledWith(expect.any(String), 1, { traceId });
    });

    it("sends a 👎 once, when the reason sheet closes", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời", trace_id: traceId }));
      const onFeedback = await askAndWait();

      fireEvent.click(screen.getByRole("button", { name: "Câu trả lời chưa tốt" }));
      expect(onFeedback).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));

      await waitFor(() => expect(onFeedback).toHaveBeenCalledWith(expect.any(String), 0, { traceId }));
      expect(onFeedback).toHaveBeenCalledTimes(1);
    });

    it("shows the previous vote again when the host rejects", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời", trace_id: traceId }));
      await askAndWait(vi.fn().mockRejectedValue(new Error("500")));

      const like = screen.getByRole("button", { name: "Câu trả lời hữu ích" });
      fireEvent.click(like);
      expect(like.getAttribute("aria-pressed")).toBe("true");
      await waitFor(() => expect(like.getAttribute("aria-pressed")).toBe("false"), { timeout: 2000 });
      expect(screen.getByRole("status").textContent).toMatch(/Chưa gửi được đánh giá/);
    });

    it("sends the open sheet's reason when a 👎 on another reply closes it", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => replyStream({ message: "đã trả lời", trace_id: traceId })())
      );
      const onFeedback = await askAndWait();
      fireEvent.change(screen.getByPlaceholderText(/Hỏi Abot/), { target: { value: "hỏi lần hai" } });
      // The widget ignores a second send within 400ms of the first
      await new Promise((resolve) => setTimeout(resolve, 450));
      fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      await waitFor(() => expect(screen.getAllByRole("button", { name: "Câu trả lời chưa tốt" })).toHaveLength(2), {
        timeout: 3000,
      });

      const [first, second] = screen.getAllByRole("button", { name: "Câu trả lời chưa tốt" });
      fireEvent.click(first);
      fireEvent.click(screen.getByRole("button", { name: "Lạc đề / Chưa đúng trọng tâm" }));
      fireEvent.click(second);

      await waitFor(() =>
        expect(onFeedback).toHaveBeenCalledWith(expect.any(String), 0, {
          traceId,
          reason: "Lạc đề / Chưa đúng trọng tâm",
          comment: undefined,
        })
      );
      // The new sheet starts empty
      expect(screen.getByRole("button", { name: "Lạc đề / Chưa đúng trọng tâm" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("offers no rating for a reply without a trace (tracing off)", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời" }));
      await askAndWait();

      expect(screen.queryByRole("button", { name: "Câu trả lời hữu ích" })).toBeNull();
    });

    it("keeps 👍/👎 hidden when onFeedback is omitted while keeping trace ID copy button for Owner", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời", trace_id: traceId }));
      render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite />);
      fireEvent.change(screen.getByPlaceholderText(/Hỏi Abot/), { target: { value: "hỏi thử" } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      await screen.findByText("đã trả lời");

      expect(screen.queryByRole("button", { name: "Câu trả lời hữu ích" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Câu trả lời chưa tốt" })).toBeNull();
      expect(screen.getByRole("button", { name: "Sao chép trace ID của câu trả lời" })).toBeTruthy();
    });
  });

  describe("mascot", () => {
    it("renders circular mascot on launcher button, switches to happy eyes on hover, and opens chat", () => {
      render(<RoadmapChatbotWidget baseUrl={BASE} />);
      const launcher = screen.getByRole("button", { name: "Mở Abot" });
      expect(launcher.querySelectorAll("clipPath")).toHaveLength(2);
      expect(launcher.querySelectorAll("ellipse")).toHaveLength(1);

      fireEvent.mouseEnter(launcher);
      expect(launcher.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(3);

      fireEvent.click(launcher);
      expect(screen.getByPlaceholderText(/Hỏi Abot/)).toBeTruthy();
      expect(screen.getByText(/Xin chào, mình là Abot/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Sao chép câu trả lời" })).toBeNull();
    });

    it("hides header brand in init hero stage and docks to header on first message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":"đã trả lời"}\n\n'));
                c.close();
              },
            }),
            { status: 200 }
          )
        )
      );
      openWidget(false);
      expect(screen.getByText(/Xin chào, mình là Abot/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Xem lộ trình" }));
      await screen.findByText("đã trả lời");
      expect(screen.queryByText(/Xin chào, mình là Abot/)).toBeNull();
    });

    it("cycles through cool brow-raise, joy, and AI insight moods on click", () => {
      const { container } = openWidget(false);
      const scrollRoot = container.querySelector("[data-abot-scroll-root]") as HTMLElement;
      expect(scrollRoot.className).toContain("overflow-hidden");
      expect(scrollRoot.className).not.toContain("overflow-y-auto");

      const heroSvg = container.querySelector('svg[width="116"]') as SVGSVGElement;
      expect(heroSvg).toBeTruthy();

      fireEvent.click(heroSvg);
      expect(heroSvg.querySelectorAll("ellipse")).toHaveLength(2);

      fireEvent.click(heroSvg);
      expect(heroSvg.querySelectorAll("ellipse")).toHaveLength(4);

      fireEvent.click(heroSvg);
      expect(heroSvg.querySelectorAll('circle[stroke-dasharray="4 2.5"]')).toHaveLength(2);
    });
  });

  describe("open-state persistence and internal SPA navigation", () => {
    it("keeps Abot open across remount/reload via sessionStorage and respects explicit close", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
          matches: query === "(min-width: 48rem)",
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      );

      const first = render(<RoadmapChatbotWidget baseUrl={BASE} />);
      expect(screen.queryByRole("button", { name: "Đóng Abot" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Mở Abot" }));
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // Simulate full reload / unmount-remount with default initialOpen=false
      first.unmount();
      const reloaded = render(<RoadmapChatbotWidget baseUrl={BASE} />);
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // Explicit close persists false so next reload stays closed
      fireEvent.click(screen.getByRole("button", { name: "Đóng Abot" }));
      expect(screen.getByRole("button", { name: "Mở Abot" })).toBeTruthy();

      reloaded.unmount();
      render(<RoadmapChatbotWidget baseUrl={BASE} />);
      expect(screen.queryByRole("button", { name: "Đóng Abot" })).toBeNull();
    });

    it("navigates internal markdown, citation, and step source links via onNavigate without closing Abot", async () => {
      const onNavigate = vi.fn();
      render(
        <RoadmapChatbotWidget
          baseUrl={BASE}
          initialOpen
          onNavigate={onNavigate}
          initialMessages={[
            {
              id: "m-nav",
              role: "assistant",
              content: "Xem [Bài React](/react/hooks) và [Tài liệu ngoài](https://react.dev).",
              sources: [
                { id: "s1", title: "React Hooks", href: "/react/hooks", cited: true },
              ],
              steps: [
                {
                  id: "step-1",
                  kind: "retrieval",
                  status: "done",
                  count: 1,
                  items: [{ title: "Hook cơ bản", href: "/react/hooks#basic" }],
                },
              ],
              status: "complete",
              timestamp: new Date("2026-11-26T00:00:00Z"),
            },
          ]}
        />
      );

      // 1. Plain left click on internal markdown link -> SPA onNavigate, stays open
      const internalLink = screen.getByRole("link", { name: "Bài React" });
      fireEvent.click(internalLink);
      expect(onNavigate).toHaveBeenCalledWith("/react/hooks");
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // 2. Modified click (Ctrl/Meta) does not intercept SPA navigation
      onNavigate.mockClear();
      fireEvent.click(internalLink, { ctrlKey: true });
      fireEvent.click(internalLink, { metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();

      // 3. External link stays native target=_blank and does not call onNavigate
      const externalLink = screen.getByRole("link", { name: "Tài liệu ngoài" });
      expect(externalLink.getAttribute("target")).toBe("_blank");
      fireEvent.click(externalLink);
      expect(onNavigate).not.toHaveBeenCalled();

      // 4. Citation chip click navigates via onNavigate and keeps Abot open
      const chip = screen.getByRole("button", { name: "React Hooks" });
      fireEvent.mouseEnter(chip);
      fireEvent.click(chip);
      expect(onNavigate).toHaveBeenCalledWith("/react/hooks");
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();

      // 5. Expanded step source link also navigates via onNavigate
      onNavigate.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Đã xử lý/ }));
      fireEvent.click(screen.getByRole("button", { name: /Tra cứu cơ sở tri thức/ }));
      fireEvent.click(screen.getByRole("link", { name: "Hook cơ bản" }));
      expect(onNavigate).toHaveBeenCalledWith("/react/hooks#basic");
      expect(screen.getByRole("button", { name: "Đóng Abot" })).toBeTruthy();
    });

    it("updates composer Context Reference across Topic/Lesson navigation, attaches it to sent messages, and navigates on click", async () => {
      const onNavigate = vi.fn();
      let currentCtx = {
        roadmapSlug: "frontend",
        roadmapTitle: "Frontend",
        itemId: "ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529",
        itemTitle: "Bản phát hành bảo mật Next.js tháng 11/2026",
      } as {
        roadmapSlug?: string;
        roadmapTitle?: string;
        itemId?: string;
        itemTitle?: string;
      } | undefined;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":"Tóm tắt bài Next.js"}\n\n'));
                c.close();
              },
            }),
            { status: 200 }
          )
        )
      );

      const { rerender } = render(
        <RoadmapChatbotWidget
          baseUrl={BASE}
          initialOpen
          onNavigate={onNavigate}
          routeKey="/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529"
          getContext={() => currentCtx}
        />
      );

      // 1. Lesson Context Reference shows in composer alongside Send button
      const composerChip = screen.getByTestId("composer-context-ref");
      expect(composerChip.getAttribute("data-context-kind")).toBe("lesson");
      expect(composerChip.getAttribute("data-context-path")).toBe(
        "/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529"
      );
      expect(composerChip.textContent).toContain("Bản phát hành bảo mật Next.js tháng 11/2026");

      // 2. Sending keeps the user message bubble clean and shows a collapsible reference on the assistant turn
      fireEvent.change(screen.getByPlaceholderText(/Hỏi Abot/), {
        target: { value: "Tóm tắt bài này" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
      await screen.findByText("Tóm tắt bài Next.js");

      const userBubble = screen.getByText("Tóm tắt bài này").closest("[data-message-id]");
      expect(userBubble?.querySelector("[data-testid='message-context-ref']")).toBeNull();
      expect(userBubble?.querySelector("[data-testid='reference-summary-toggle']")).toBeNull();

      const refToggle = screen.getByTestId("reference-summary-toggle");
      expect(refToggle.textContent).toContain("Used 1 reference");
      expect(refToggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByTestId("message-context-ref")).toBeNull();

      fireEvent.click(refToggle);
      expect(refToggle.getAttribute("aria-expanded")).toBe("true");

      const sentChip = screen.getByTestId("message-context-ref");
      expect(sentChip.getAttribute("data-context-path")).toBe(
        "/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529"
      );
      expect(sentChip.textContent).toBe("Bản phát hành bảo mật Next.js tháng 11/2026");

      // 3. Navigating to Topic overview updates composer chip while keeping assistant reference snapshot intact
      currentCtx = { roadmapSlug: "frontend", roadmapTitle: "Frontend" };
      rerender(
        <RoadmapChatbotWidget
          baseUrl={BASE}
          initialOpen
          onNavigate={onNavigate}
          routeKey="/frontend"
          getContext={() => currentCtx}
        />
      );
      expect(screen.getByTestId("composer-context-ref").getAttribute("data-context-kind")).toBe("topic");
      expect(screen.getByTestId("composer-context-ref").getAttribute("data-context-path")).toBe("/frontend");
      expect(screen.getByTestId("message-context-ref").getAttribute("data-context-path")).toBe(
        "/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529"
      );

      // 4. Clicking the assistant reference card SPA-navigates back to that Lesson, and toggle collapses cleanly
      fireEvent.click(sentChip.closest("a") as HTMLAnchorElement);
      expect(onNavigate).toHaveBeenCalledWith(
        "/frontend/ban-phat-hanh-bao-mat-nextjs-thang-112026-va-loi-v1645-va-v15529"
      );
      fireEvent.click(refToggle);
      expect(refToggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByTestId("message-context-ref")).toBeNull();

      // 5. Navigating to root home clears the composer chip
      currentCtx = undefined;
      rerender(
        <RoadmapChatbotWidget
          baseUrl={BASE}
          initialOpen
          onNavigate={onNavigate}
          routeKey="/"
          getContext={() => currentCtx}
        />
      );
      expect(screen.queryByTestId("composer-context-ref")).toBeNull();
    });

    it("falls back to preceding user pageContext inside assistant steps without bleeding into later contextless turns", () => {
      render(
        <RoadmapChatbotWidget
          baseUrl={BASE}
          initialOpen
          initialMessages={[
            {
              id: "u-1",
              role: "user",
              content: "Tóm tắt phần bảo mật",
              pageContext: {
                roadmapSlug: "frontend",
                roadmapTitle: "Frontend",
                itemId: "nextjs-sec",
                itemTitle: "Next.js Security",
                section: "Security",
              },
              timestamp: new Date("2026-11-26T10:00:00Z"),
            },
            {
              id: "b-1",
              role: "assistant",
              content: "Nội dung tóm tắt bảo mật.",
              toolCalls: [
                {
                  name: "search_knowledge",
                  result: "ok",
                  status: "success",
                  startedAt: 1_000,
                  endedAt: 3_000,
                },
              ],
              firstTokenAt: 3_000,
              status: "complete",
              timestamp: new Date("2026-11-26T10:00:00Z"),
            },
            {
              id: "u-2",
              role: "user",
              content: "Câu hỏi chung",
              timestamp: new Date("2026-11-26T10:01:00Z"),
            },
            {
              id: "b-2",
              role: "assistant",
              content: "Trả lời chung.",
              status: "complete",
              timestamp: new Date("2026-11-26T10:01:05Z"),
            },
          ]}
        />
      );

      // Only the first assistant turn renders Used 1 reference inside its processing steps tree
      expect(screen.queryByTestId("reference-summary-toggle")).toBeNull();
      const stepsToggle = screen.getByRole("button", { name: /Đã xử lý/ });
      fireEvent.click(stepsToggle);

      const toggles = screen.getAllByTestId("reference-summary-toggle");
      expect(toggles).toHaveLength(1);
      expect(stepsToggle.parentElement?.contains(toggles[0])).toBe(true);

      fireEvent.click(toggles[0]);
      const refChip = screen.getByTestId("message-context-ref");
      expect(refChip.textContent).toBe("Next.js Security");
      expect(refChip.getAttribute("data-context-path")).toBe("/frontend/nextjs-sec");
      expect(screen.getByText("Frontend · Security")).toBeTruthy();
    });

    it("CollapsibleReferenceSummary falls back to path subtitle for topic references", () => {
      const topicRef = resolvePageContextRef({
        roadmapSlug: "frontend",
        roadmapTitle: "Frontend",
      });
      expect(topicRef).not.toBeNull();

      render(<CollapsibleReferenceSummary contextRef={topicRef!} />);
      const toggle = screen.getByTestId("reference-summary-toggle");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");

      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByTestId("message-context-ref").textContent).toBe("Frontend");
      expect(screen.getByText("/frontend")).toBeTruthy();
    });
  });
});
