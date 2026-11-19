// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList";
import type { ChatMessage } from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

const PREVIEW = '**➕ TẠO MỚI 1 TOPIC**\n- **Danh sách thực thể:**\n  1. **Backend gíup tôi**\n\n👉 Bấm nút **[✅ Xác nhận thực hiện]** bên dưới';

function renderPreview(opts: {
  editableTitles?: string[];
  editableTarget?: { topic?: string; section?: string };
  canWrite?: boolean;
}) {
  const sendMessage = vi.fn();
  const message: ChatMessage = {
    id: "a1",
    role: "assistant",
    content: PREVIEW,
    editableTitles: opts.editableTitles,
    editableTarget: opts.editableTarget,
    timestamp: new Date(),
  };
  render(
    <MessageList
      messages={[message]}
      isLoading={false}
      isStreaming={false}
      runningCode={null}
      expandedTools={{}}
      feedback={{}}
      copiedId={null}
      canWrite={opts.canWrite ?? true}
      sendMessage={sendMessage}
      retry={vi.fn()}
      copyMessage={vi.fn()}
      handleFeedback={vi.fn()}
      handleRunCode={vi.fn()}
      toggleToolExpand={vi.fn()}
      scrollRef={React.createRef<HTMLDivElement>()}
      bottomSentinelRef={React.createRef<HTMLDivElement>()}
      scrollToBottom={vi.fn()}
    />
  );
  return sendMessage;
}

describe("Preview with editable names", () => {
  afterEach(cleanup);

  it("sends the edited name with the confirmation", () => {
    const sendMessage = renderPreview({ editableTitles: ["Backend gíup tôi"] });
    const input = screen.getByRole("textbox", { name: "Tên" }) as HTMLInputElement;
    expect(input.value).toBe("Backend gíup tôi");
    fireEvent.change(input, { target: { value: "  Backend  " } });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận thực hiện/ }));
    expect(sendMessage).toHaveBeenCalledWith("ok", { titles: ["Backend"] });
  });

  it("sends a plain ok when the name was not edited", () => {
    const sendMessage = renderPreview({ editableTitles: ["Backend"] });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận thực hiện/ }));
    expect(sendMessage).toHaveBeenCalledWith("ok", undefined);
  });

  it("disables confirm while a name is blank", () => {
    const sendMessage = renderPreview({ editableTitles: ["Backend"] });
    fireEvent.change(screen.getByRole("textbox", { name: "Tên" }), { target: { value: "   " } });
    const confirm = screen.getByRole("button", { name: /Xác nhận thực hiện/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("shows no inputs for a preview with nothing to edit (delete) or for a reader", () => {
    renderPreview({ editableTitles: undefined });
    expect(screen.queryByRole("textbox")).toBeNull();
    cleanup();
    renderPreview({ editableTitles: ["Backend"], canWrite: false });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancel still sends hủy", () => {
    const sendMessage = renderPreview({ editableTitles: ["Backend"] });
    fireEvent.click(screen.getByRole("button", { name: /Hủy bỏ/ }));
    expect(sendMessage).toHaveBeenCalledWith("hủy", undefined);
  });

  it("renders topic and section target inputs and sends only edited fields", () => {
    const sendMessage = renderPreview({
      editableTitles: ["Hybrid Search"],
      editableTarget: { topic: "ai-engineering", section: "RAG" },
    });
    const topicInput = screen.getByRole("textbox", { name: "Topic đích" }) as HTMLInputElement;
    const sectionInput = screen.getByRole("textbox", { name: "Mục đích" }) as HTMLInputElement;
    expect(topicInput.value).toBe("ai-engineering");
    expect(sectionInput.value).toBe("RAG");

    fireEvent.change(topicInput, { target: { value: "  backend  " } });
    fireEvent.change(sectionInput, { target: { value: "  Retrieval  " } });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận thực hiện/ }));
    expect(sendMessage).toHaveBeenCalledWith("ok", {
      target: { topic: "backend", section: "Retrieval" },
    });
  });

  it("allows clearing section input while disabling confirm when topic input is blank", () => {
    const sendMessage = renderPreview({
      editableTitles: ["Hybrid Search"],
      editableTarget: { topic: "ai-engineering", section: "RAG" },
    });
    const topicInput = screen.getByRole("textbox", { name: "Topic đích" });
    const sectionInput = screen.getByRole("textbox", { name: "Mục đích" });
    const confirm = screen.getByRole("button", { name: /Xác nhận thực hiện/ }) as HTMLButtonElement;

    fireEvent.change(sectionInput, { target: { value: "" } });
    expect(confirm.disabled).toBe(false);

    fireEvent.change(topicInput, { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.change(topicInput, { target: { value: "ai-engineering" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(sendMessage).toHaveBeenCalledWith("ok", { target: { section: "" } });
  });
});
