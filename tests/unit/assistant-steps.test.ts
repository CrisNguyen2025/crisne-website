import { describe, expect, it, vi } from "vitest";
import { RoadmapChatClient } from "@/roadmap-rag-assistant/sdk/typescript/src/client";
import type { AssistantStepEvent, ChatResponse } from "@/roadmap-rag-assistant/sdk/typescript/src/types";
import {
  formatStepDetail,
  formatStepLabel,
  formatStepSummary,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters";

const step = (s: Partial<AssistantStepEvent>): AssistantStepEvent => ({
  id: "x",
  kind: "routing",
  status: "done",
  ...s,
});

describe("step formatters (contract: rag_service/steps.py)", () => {
  it("labels every kind, live wording while running", () => {
    expect(formatStepLabel(step({ kind: "retrieval", status: "running" }))).toBe("Đang tra cứu cơ sở tri thức…");
    expect(formatStepLabel(step({ kind: "retrieval" }))).toBe("Tra cứu cơ sở tri thức");
    expect(formatStepLabel(step({ kind: "tool", name: "list_topics" }))).toBe("Liệt kê danh sách Topic");
    expect(formatStepLabel(step({ kind: "guard" }))).toBe("Kiểm tra câu trả lời");
  });

  it("summarises finished steps from their data", () => {
    expect(formatStepSummary(step({ intent: "knowledge_query" }))).toBe("Tra cứu tri thức");
    expect(formatStepSummary(step({ kind: "retrieval", count: 2 }))).toBe("2 tài liệu");
    expect(formatStepSummary(step({ kind: "retrieval", count: 0 }))).toBe("Không có tài liệu phù hợp");
    expect(formatStepSummary(step({ kind: "generation", mode: "context", fallback_reason: "llm_error" }))).toBe(
      "Dữ liệu gốc · AI lỗi"
    );
    expect(formatStepSummary(step({ kind: "generation", status: "error" }))).toBe("Lỗi");
    expect(formatStepSummary(step({ kind: "retrieval", status: "running" }))).toBeUndefined();
  });

  it("shows tool results and guard issues when expanded", () => {
    expect(formatStepDetail(step({ kind: "tool", result: "📋 Có 1 topic" }))).toBe("📋 Có 1 topic");
    expect(
      formatStepDetail(step({ kind: "guard", grounding: "issues", ungrounded_terms: ["Frontend"], invalid_links: ["fe"] }))
    ).toBe("Tên không có trong dữ liệu: Frontend\nĐã gỡ link tới topic không tồn tại: fe");
    expect(formatStepDetail(step({ kind: "guard", grounding: "ok" }))).toBeUndefined();
  });
});

describe("RoadmapChatClient step events", () => {
  it("forwards step events and keeps `steps` from done", async () => {
    const sse = [
      'event: step\ndata: {"id": "retrieve", "kind": "retrieval", "status": "running"}\n\n',
      'event: step\ndata: {"id": "retrieve", "kind": "retrieval", "status": "done", "count": 1, "duration_ms": 40}\n\n',
      'event: done\ndata: {"message": "ok", "tool_calls": [], "steps": [{"id": "retrieve", "kind": "retrieval", "status": "done", "count": 1}]}\n\n',
    ].join("");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const steps: AssistantStepEvent[] = [];
    const done = await new Promise<ChatResponse>((resolve, reject) => {
      new RoadmapChatClient({ baseUrl: "http://rag.test" }).streamChat(
        "q",
        { onStep: (s) => steps.push(s), onDone: resolve, onError: reject },
        "t1"
      );
    });

    expect(steps.map((s) => s.status)).toEqual(["running", "done"]);
    expect(steps[1].duration_ms).toBe(40);
    expect(done.steps?.[0]).toMatchObject({ id: "retrieve", count: 1 });
    vi.unstubAllGlobals();
  });
});
