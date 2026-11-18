// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";

const BASE = "/api/roadmap-assistant";

function sseStream(events: Array<{ event: string; data: unknown }>) {
  return new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        for (const ev of events) {
          c.enqueue(enc.encode(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`));
        }
        c.close();
      },
    }),
    { status: 200 }
  );
}

describe("Suggest block executed jump & busy conflict handling", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("replaces Play with jump action after execution and scrolls to the executed prompt without re-fetching", async () => {
    const suggestMarkdown =
      "Dưới đây là gợi ý:\n\n```text\nGuardrails cho LLM hoạt động thế nào\n```\n\n```text\nliệt kê topic\n```";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseStream([{ event: "done", data: { message: suggestMarkdown } }])
      )
      .mockResolvedValueOnce(
        sseStream([
          {
            event: "done",
            data: { message: "Guardrails là lớp bộ lọc bảo vệ LLM." },
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite />
    );

    const input = screen.getByPlaceholderText(/Hỏi Abot/) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "gợi ý vài prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    await screen.findByText("Guardrails cho LLM hoạt động thế nào");

    const sendButtonsBefore = screen.getAllByRole("button", { name: "Gửi" });
    expect(sendButtonsBefore).toHaveLength(2);

    // Execute the first Suggest block
    fireEvent.click(sendButtonsBefore[0]);

    await screen.findByText("Guardrails là lớp bộ lọc bảo vệ LLM.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First Suggest block now shows icon-only jump action; second remains "Gửi"
    const jumpButton = await screen.findByRole("button", {
      name: "Đã gửi — Đi tới câu hỏi",
    });
    expect(jumpButton.textContent).toBe("");
    expect(screen.getAllByRole("button", { name: "Gửi" })).toHaveLength(1);

    const scrollRoot = container.querySelector(
      "[data-abot-scroll-root]"
    ) as HTMLDivElement;
    const scrollToSpy = vi.fn();
    scrollRoot.scrollTo = scrollToSpy;

    // Clicking jump scrolls to the executed user bubble instead of re-sending
    fireEvent.click(jumpButton);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    const userBubbles = Array.from(
      container.querySelectorAll<HTMLElement>("[data-message-id]")
    );
    const executedWrapper = userBubbles.find((el) =>
      el.textContent?.includes("Guardrails cho LLM hoạt động thế nào")
    );
    expect(executedWrapper).toBeTruthy();
    const bubble = executedWrapper?.firstElementChild as HTMLElement;
    expect(bubble.className).toContain("ring-2");
  });

  it("disables un-executed Suggest Play buttons while composer turn is streaming and keeps failed turns runnable", async () => {
    const suggestMarkdown = "```text\nliệt kê topic\n```";
    let resolvePendingStream!: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolvePendingStream = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseStream([{ event: "done", data: { message: suggestMarkdown } }])
      )
      .mockReturnValueOnce(pendingPromise)
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite />);

    const input = screen.getByPlaceholderText(/Hỏi Abot/) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "cho ví dụ" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    const playBtn = (await screen.findByRole("button", {
      name: "Gửi",
    })) as HTMLButtonElement;
    expect(playBtn.disabled).toBe(false);

    // Wait past the 400ms handleSend debounce before starting a composer turn
    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.change(input, { target: { value: "hỏi bằng composer" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    // While composer turn is in flight, Suggest Play button must be disabled
    await waitFor(() => expect(playBtn.disabled).toBe(true));

    resolvePendingStream(
      sseStream([{ event: "done", data: { message: "đã trả lời composer" } }])
    );
    await screen.findByText("đã trả lời composer");
    await waitFor(() => expect(playBtn.disabled).toBe(false));

    // If running the Suggest block fails, it stays runnable ("Gửi"), not "Đã gửi"
    fireEvent.click(playBtn);
    await screen.findByRole("button", { name: "Thử lại" });
    expect(
      screen.queryByRole("button", { name: "Đã gửi — Đi tới câu hỏi" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Gửi" })).toBeTruthy();
  });
});
