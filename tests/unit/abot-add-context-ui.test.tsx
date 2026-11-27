// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import { MessageList } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList";
import type { ChatMessage } from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

const BASE = "/api/roadmap-assistant";

function sseStream(events: Array<{ event: string; data: unknown }>) {
  const payload = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(payload));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );
}

describe("Abot + Add Context, Slash Actions (/quiz -> Topic), & Gmail Dialog", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides Gmail from Visitors and exposes Actions (Slash) only", () => {
    render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite={false} />);

    fireEvent.click(screen.getByTestId("composer-add-context-btn"));
    expect(screen.getByTestId("add-context-menu")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.queryByText("Gmail")).toBeNull();
  });

  it("shows Actions & Gmail (Set up) for Owner, handles /quiz Topic suggestion & Escape without closing widget", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/connectors/gmail/status")) {
        return new Response(
          JSON.stringify({
            connected: false,
            status: "disconnected",
            accountEmail: null,
            config: {
              allowedLabelIds: [],
              defaultQuery: "newer_than:14d",
              maxEmails: 5,
              excludeSensitiveSubjects: true,
            },
          }),
          { status: 200 }
        );
      }
      if (url === "/api/v1/roadmaps") {
        return new Response(
          JSON.stringify({
            roadmaps: [
              { id: "r-be", slug: "backend", title: "Backend Systems", description: "", order: 1, _count: { items: 8 } },
              { id: "r-fe", slug: "frontend", title: "Frontend", description: "", order: 2, _count: { items: 5 } },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/chat/stream")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return sseStream([
          { event: "token", data: { delta: `Danh sách quiz cho ${body.message}` } },
          {
            event: "done",
            data: {
              message: `Danh sách quiz cho ${body.message}`,
              suggestions: [{ label: "Quiz: Event Loop", prompt: "quiz bài Event Loop" }],
            },
          },
        ]);
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RoadmapChatbotWidget
        baseUrl={BASE}
        initialOpen
        canWrite
        getContext={() => ({ roadmapSlug: "frontend", roadmapTitle: "Frontend" })}
      />
    );

    // 1. Open + menu -> Actions + Gmail Set up visible
    fireEvent.click(screen.getByTestId("composer-add-context-btn"));
    await waitFor(() => expect(screen.getByText("Set up")).toBeTruthy());

    // 2. Click Actions -> inserts `/` and opens SlashCommandPopover
    fireEvent.click(screen.getByText("Actions"));
    expect(screen.getByTestId("slash-command-popover")).toBeTruthy();

    // 3. Click /quiz -> opens Topic picker with current Topic (`Frontend`) prioritized first
    fireEvent.click(screen.getByText(/Kiểm tra theo Topic/));
    const topicPopover = await screen.findByTestId("slash-quiz-topic-popover");
    expect(topicPopover.textContent).toContain("Đang xem");

    // 4. Escape closes Slash popover WITHOUT closing the drawer (`data-abot-overlay-root`)
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("slash-quiz-topic-popover")).toBeNull();
    expect(screen.getByTestId("composer-add-context-btn")).toBeTruthy();

    // 5. Typing `/quiz F` filters to Frontend -> selecting sends `/quiz Frontend` and renders returned suggestion chip
    const textarea = screen.getByPlaceholderText("Hỏi Abot…") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/quiz F" } });
    const frontendBtn = await screen.findByRole("option", { name: /Frontend/ });
    fireEvent.click(frontendBtn);

    await screen.findByText("Danh sách quiz cho /quiz Frontend");
    expect(screen.getByRole("button", { name: "Quiz: Event Loop" })).toBeTruthy();

    // 6. Mid-sentence slash does NOT trigger popover
    fireEvent.change(textarea, { target: { value: "đường dẫn /api/v1/roadmaps" } });
    expect(screen.queryByTestId("slash-command-popover")).toBeNull();
  });

  it("opens GmailConnectorDialog, toggles attached Gmail chip, and includes connectors on chat stream", async () => {
    const statusConnected = {
      connected: true,
      status: "connected",
      accountEmail: "owner@gmail.com",
      config: {
        allowedLabelIds: ["Label_1"],
        defaultQuery: "newer_than:7d",
        maxEmails: 5,
        excludeSensitiveSubjects: true,
      },
      labels: [{ id: "Label_1", name: "AI News" }],
    };

    const capturedStream = { body: null as Record<string, unknown> | null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/connectors/gmail/status")) {
        return new Response(JSON.stringify(statusConnected), { status: 200 });
      }
      if (url.endsWith("/chat/stream")) {
        capturedStream.body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return sseStream([{ event: "done", data: { message: "Tóm tắt Gmail xong" } }]);
      }
      if (url.includes("/api/v1/connectors/gmail/config")) {
        return new Response(JSON.stringify(statusConnected), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RoadmapChatbotWidget baseUrl={BASE} initialOpen canWrite />);

    // Open + -> toggle connected Gmail ON
    fireEvent.click(screen.getByTestId("composer-add-context-btn"));
    const gmailItem = await screen.findByRole("menuitem", { name: /Gmail/ });
    expect(gmailItem.textContent).toContain("owner@gmail.com");
    fireEvent.click(gmailItem);

    // Chip appears in toolbar; open Gmail config dialog via clicking chip
    const chip = screen.getByTestId("composer-gmail-chip");
    expect(chip).toBeTruthy();
    fireEvent.click(chip.querySelector("button")!);
    expect(await screen.findByRole("dialog", { name: "Cấu hình Gmail Connector" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dùng ngay" }));

    // Sending message attaches `connectors: ["gmail"]`
    const textarea = screen.getByPlaceholderText("Hỏi Abot…");
    fireEvent.change(textarea, { target: { value: "Trong Gmail có gì mới?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    await screen.findByText("Tóm tắt Gmail xong");
    expect(capturedStream.body?.connectors).toEqual(["gmail"]);
  });

  it("renders restored contextMeta badges on user bubbles in MessageList", () => {
    const messages: ChatMessage[] = [
      {
        id: "user-restored-1",
        role: "user",
        content: "/gmail Tổng hợp mail",
        isRestored: true,
        contextMeta: { connectors: ["gmail"], slashCommand: "/gmail" },
        timestamp: new Date(),
      },
    ];
    const scrollRef = React.createRef<HTMLDivElement>();
    render(
      <MessageList
        messages={messages}
        isLoading={false}
        isStreaming={false}
        runningCode={null}
        expandedTools={{}}
        feedback={{}}
        copiedId={null}
        canWrite
        sendMessage={vi.fn()}
        retry={vi.fn()}
        copyMessage={vi.fn()}
        handleFeedback={vi.fn()}
        handleRunCode={vi.fn()}
        toggleToolExpand={vi.fn()}
        scrollRef={scrollRef}
        bottomSentinelRef={React.createRef<HTMLDivElement>()}
        scrollToBottom={vi.fn()}
      />
    );

    expect(screen.getByTestId("message-context-gmail-chip").textContent).toContain("Gmail");
    expect(screen.getByTestId("message-context-slash-chip").textContent).toBe("/gmail");
  });
});
