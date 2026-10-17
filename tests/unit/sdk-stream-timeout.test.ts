import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapChatClient, StreamTimeoutError } from "@/roadmap-rag-assistant/sdk/typescript/src/client";

// A body the test controls: chunks are pushed by hand, and nothing arrives unless we push it.
function controlledStream() {
  let push!: (text: string) => void;
  let close!: () => void;
  let abort!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      // Ignored once the request was aborted: the server would have stopped sending too
      push = (text) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          /* stream already errored */
        }
      };
      close = () => controller.close();
      // Like fetch: aborting the request errors the body the reader is waiting on
      abort = () => controller.error(new DOMException("aborted", "AbortError"));
    },
  });
  return { body, push, close, abort };
}

// fetch stand-in that honours the request signal, as the browser does
function fakeFetch(stream: ReturnType<typeof controlledStream>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => stream.abort());
    return new Response(stream.body, { status: 200 });
  });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("streamChat timeouts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports a stalled stream as StreamTimeoutError after the idle limit", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", fakeFetch(stream));
    const onError = vi.fn();
    const onDone = vi.fn();
    const client = new RoadmapChatClient({ idleTimeout: 30_000, timeout: 120_000 });

    client.streamChat("xin chào", { onError, onDone });
    stream.push(sse("token", { delta: "Xin" }));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(StreamTimeoutError);
    expect(err.kind).toBe("timeout");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does not time out while chunks keep arriving within the idle limit", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", fakeFetch(stream));
    const onError = vi.fn();
    const client = new RoadmapChatClient({ idleTimeout: 30_000, timeout: 300_000 });

    client.streamChat("xin chào", { onError });
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      stream.push(sse("token", { delta: "." }));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).not.toHaveBeenCalled();
    stream.close();
  });

  it("cancels a request that outlives the total time limit even when chunks keep coming", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", fakeFetch(stream));
    const onError = vi.fn();
    const client = new RoadmapChatClient({ idleTimeout: 30_000, timeout: 60_000 });

    client.streamChat("xin chào", { onError });
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      stream.push(sse("token", { delta: "." }));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(StreamTimeoutError);
  });

  it("does not report an error when the user stops the stream", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", fakeFetch(stream));
    const onError = vi.fn();
    const client = new RoadmapChatClient({ idleTimeout: 30_000 });

    const controller = client.streamChat("xin chào", { onError });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).not.toHaveBeenCalled();
  });
});
