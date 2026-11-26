// @vitest-environment jsdom
import React from "react";
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessState = vi.hoisted(() => ({
  canWrite: false,
}));

const plannerMock = vi.hoisted(() => ({
  plan: vi.fn(),
}));

vi.mock("@/hooks/use-can-write", () => ({
  useCanWrite: () => accessState.canWrite,
}));

vi.mock("@/roadmap-rag-assistant/sdk/typescript/src/client", () => ({
  RoadmapChatClient: class {
    plan = plannerMock.plan;
  },
}));

import { RoadmapWebMcpRegistrar } from "@/components/roadmap/RoadmapWebMcpRegistrar";
import { useRoadmapWebMcpTools } from "@/hooks/use-roadmap-webmcp";
import { runWebMcpCommand } from "@/logic/roadmap/roadmapAssistantService";

describe("WebMCP write safety", () => {
  const registeredSignals: Array<{ name: string; signal?: AbortSignal }> = [];
  const registerTool = vi.fn(
    async (tool: { name: string }, options?: { signal?: AbortSignal }) => {
      registeredSignals.push({ name: tool.name, signal: options?.signal });
    }
  );
  const getTools = vi.fn<
    () => Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>>
  >(async () => []);
  const executeTool = vi.fn();

  beforeEach(() => {
    accessState.canWrite = false;
    registeredSignals.length = 0;
    registerTool.mockClear();
    getTools.mockClear();
    executeTool.mockClear();
    plannerMock.plan.mockReset();

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool,
        getTools,
        executeTool,
      },
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "modelContext");
    vi.restoreAllMocks();
  });

  it("does not register any WebMCP tool when canWrite is false (Visitor)", () => {
    accessState.canWrite = false;
    render(<RoadmapWebMcpRegistrar />);
    expect(registerTool).not.toHaveBeenCalled();

    renderHook(() => useRoadmapWebMcpTools());
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("registers WebMCP tools only for Owner and aborts immediately when canWrite becomes false", () => {
    accessState.canWrite = false;
    const { rerender } = render(<RoadmapWebMcpRegistrar />);
    expect(registerTool).not.toHaveBeenCalled();

    accessState.canWrite = true;
    rerender(<RoadmapWebMcpRegistrar />);
    expect(registerTool.mock.calls.length).toBeGreaterThan(0);
    expect(registeredSignals.every((entry) => entry.signal && !entry.signal.aborted)).toBe(true);

    accessState.canWrite = false;
    rerender(<RoadmapWebMcpRegistrar />);
    expect(registeredSignals.every((entry) => entry.signal?.aborted === true)).toBe(true);
  });

  it("dispatches roadmap:updated with toolName and result only when runWebMcpCommand runs a write tool", async () => {
    const writeTool = {
      name: "create_item",
      description: "Create lesson",
      inputSchema: { type: "object" },
    };
    const readTool = {
      name: "list_roadmaps",
      description: "List topics",
      inputSchema: { type: "object" },
    };
    getTools.mockResolvedValue([writeTool, readTool]);

    const events: Array<{ toolName?: string; result?: unknown }> = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<{ toolName?: string; result?: unknown }>).detail);
    };
    window.addEventListener("roadmap:updated", listener);

    try {
      plannerMock.plan.mockResolvedValueOnce({ tool: "list_roadmaps", args: {}, reply: "" });
      executeTool.mockResolvedValueOnce([{ slug: "react" }]);
      await runWebMcpCommand("liệt kê topic");
      expect(events).toEqual([]);

      plannerMock.plan.mockResolvedValueOnce({ tool: "create_item", args: { title: "Hooks" }, reply: "" });
      executeTool.mockResolvedValueOnce({ slug: "hooks" });
      await runWebMcpCommand("tạo bài Hooks");
      expect(events).toEqual([{ toolName: "create_item", result: { slug: "hooks" } }]);
    } finally {
      window.removeEventListener("roadmap:updated", listener);
    }
  });
});
