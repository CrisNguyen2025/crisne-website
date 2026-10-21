// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";

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
    it("reader: offers a new conversation, but no conversation id", async () => {
      openWidget(false);
      await openMenu();
      expect(screen.getByText("Cuộc trò chuyện mới")).toBeTruthy();
      expect(screen.queryByText("Mã hội thoại")).toBeNull();
    });

    it("owner: offers the conversation id as well", async () => {
      openWidget(true);
      await openMenu();
      expect(screen.getByText("Cuộc trò chuyện mới")).toBeTruthy();
      expect(screen.getByText("Mã hội thoại")).toBeTruthy();
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
      const card = screen.getByText(/Có những lộ trình/);
      expect(within(card.parentElement as HTMLElement).queryByText(/^Tạo /)).toBeNull();
      expect(screen.queryByText(/Tạo 2 layer/)).toBeNull();
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
      expect(screen.getByRole("button", { name: "Lạc đề / Chưa đúng trọng tâm" }).className).not.toMatch(/font-medium/);
    });

    it("offers no rating for a reply without a trace (tracing off)", async () => {
      vi.stubGlobal("fetch", replyStream({ message: "đã trả lời" }));
      await askAndWait();

      expect(screen.queryByRole("button", { name: "Câu trả lời hữu ích" })).toBeNull();
    });
  });
});
