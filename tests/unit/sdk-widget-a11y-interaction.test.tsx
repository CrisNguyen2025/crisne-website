// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import { expectNoA11yViolations } from "../setup/a11y";
import { setupMswServer } from "../setup/msw";

const BASE = "http://localhost/api/roadmap-assistant";
const encoder = new TextEncoder();

function sseStream(events: Array<{ event: string; data: unknown }>) {
  const payload = events
    .map(
      ({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    )
    .join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

const server = setupMswServer([
  http.post(`${BASE}/chat/stream`, async () => {
    return new HttpResponse(
      sseStream([
        { event: "token", data: { delta: "Chào bạn từ MSW" } },
        { event: "done", data: { message: "Chào bạn từ MSW" } },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }),
]);

describe("RoadmapChatbotWidget interactions, MSW streaming, and a11y", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens from the launcher, enables submit on typing, and streams an MSW reply", async () => {
    const user = userEvent.setup();
    render(<RoadmapChatbotWidget baseUrl={BASE} canWrite={false} />);

    const launcher = screen.getByRole("button", { name: "Mở Abot" });
    expect(launcher).toBeInTheDocument();

    await user.click(launcher);

    const input = screen.getByPlaceholderText(/Hỏi Abot/);
    const sendButton = screen.getByRole("button", { name: "Gửi tin nhắn" });
    expect(input).toBeInTheDocument();
    expect(sendButton).toBeDisabled();

    await user.type(input, "RAG là gì{Enter}");

    expect(await screen.findByText("Chào bạn từ MSW")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("passes axe-core audit on the closed launcher and open drawer", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RoadmapChatbotWidget baseUrl={BASE} canWrite={false} />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Mở Abot" }));
    const optionsButton = screen.getByRole("button", { name: "Tùy chọn" });
    expect(optionsButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Gửi tin nhắn" })
    ).toHaveAttribute("aria-label", "Gửi tin nhắn");
    await expectNoA11yViolations(container);

    await user.click(optionsButton);
    expect(optionsButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Context" })).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const switchButton = screen.getByRole("button", { name: "Switch to" });
    await user.click(switchButton);
    expect(optionsButton).toHaveAttribute("aria-expanded", "false");
    expect(switchButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Sidebar" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("recovers cleanly via userEvent click when MSW returns 502 then 200", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.post(`${BASE}/chat/stream`, () => {
        attempt += 1;
        if (attempt === 1) {
          return new HttpResponse("Bad Gateway", { status: 502 });
        }
        return new HttpResponse(
          sseStream([{ event: "done", data: { message: "Đã khôi phục" } }]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }
        );
      })
    );

    render(
      <RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite={false} />
    );
    await user.type(
      screen.getByPlaceholderText(/Hỏi Abot/),
      "thử retry{Enter}"
    );

    const retryButton = await screen.findByRole("button", { name: "Thử lại" });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(await screen.findByText("Đã khôi phục")).toBeInTheDocument();
    expect(attempt).toBe(2);
  });
});
