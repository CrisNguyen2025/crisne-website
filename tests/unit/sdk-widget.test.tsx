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
});
