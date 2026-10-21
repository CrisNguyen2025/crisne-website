// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatClient } from "@/roadmap-rag-assistant/sdk/typescript/src/client";
import { ChangeReviewCard } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ChangeReviewCard";
import type { ChangeReview, ChatResponse } from "@/roadmap-rag-assistant/sdk/typescript/src/types";

afterEach(cleanup);

const CREATE: ChangeReview = {
  id: "c1",
  action: "create",
  level: "item",
  parent: "layer-1",
  added: 2,
  removed: 0,
  entries: [
    { op: "create", level: "item", title: "Docker Basics", id: "i1" },
    { op: "create", level: "item", title: "Compose", id: "i2" },
  ],
  skipped: ["Kubernetes"],
};

const DELETE: ChangeReview = {
  id: "c2",
  action: "delete",
  level: "layer",
  added: 0,
  removed: 3,
  entries: [
    {
      op: "delete",
      level: "layer",
      title: "Ops",
      id: "l1",
      children: [
        { level: "group", title: "core" },
        { level: "item", title: "CI/CD" },
      ],
    },
  ],
};

describe("ChangeReviewCard", () => {
  it("sums every action of the reply in one collapsed summary", () => {
    const { getByRole, queryByText } = render(<ChangeReviewCard changes={[CREATE, DELETE]} />);

    const toggle = getByRole("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("3 thay đổi");
    expect(toggle.textContent).toContain("+2");
    expect(toggle.textContent).toContain("−3");
    expect(queryByText("Docker Basics")).toBeNull();
  });

  it("expands to the rows created and deleted, children and skipped titles included", () => {
    const { getByRole, getByText } = render(<ChangeReviewCard changes={[CREATE, DELETE]} />);

    fireEvent.click(getByRole("button"));

    expect(getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(getByText("Docker Basics")).toBeTruthy();
    expect(getByText("Ops")).toBeTruthy();
    expect(getByText("CI/CD")).toBeTruthy();
    expect(getByText(/Đã có sẵn, không tạo lại: Kubernetes/)).toBeTruthy();
  });

  it("renders nothing when no row changed", () => {
    const { container } = render(<ChangeReviewCard changes={[{ ...CREATE, added: 0, entries: [] }]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("RoadmapChatClient change_review events", () => {
  it("forwards change_review and keeps `changes` from done", async () => {
    const sse = [
      'event: tool_end\ndata: {"name": "create_item", "result": "ok", "is_error": false}\n\n',
      `event: change_review\ndata: ${JSON.stringify(CREATE)}\n\n`,
      `event: done\ndata: ${JSON.stringify({ message: "ok", tool_calls: [], changes: [CREATE] })}\n\n`,
    ].join("");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const changes: ChangeReview[] = [];
    const done = await new Promise<ChatResponse>((resolve, reject) => {
      new RoadmapChatClient({ baseUrl: "http://rag.test" }).streamChat(
        "q",
        { onChangeReview: (c) => changes.push(c), onDone: resolve, onError: reject },
        "t1"
      );
    });

    expect(changes).toEqual([CREATE]);
    expect(done.changes).toEqual([CREATE]);
    vi.unstubAllGlobals();
  });
});
