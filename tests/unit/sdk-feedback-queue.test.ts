import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFeedbackQueue, type Vote } from "@/roadmap-rag-assistant/sdk/typescript/src/react/useFeedback";

const DELAY = 800;

function setup(initial: Record<string, 0 | 1> = {}, send = vi.fn().mockResolvedValue(undefined)) {
  const shown: Record<string, Vote>[] = [];
  const saved: Record<string, 0 | 1>[] = [];
  const queue = createFeedbackQueue({
    initial,
    send,
    onChange: (votes) => shown.push(votes),
    onCommitted: (votes) => saved.push(votes),
    delayMs: DELAY,
  });
  return { queue, send, shown, saved, last: () => shown.at(-1) };
}

describe("createFeedbackQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows each click at once but sends only the last vote", async () => {
    const { queue, send, last } = setup();
    for (const value of [1, null, 1, 0, 1] as Vote[]) queue.vote("m1", value);
    expect(last()).toEqual({ m1: 1 });
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("m1", 1, undefined);
  });

  it("sends nothing when the clicks end on the vote the service already has", async () => {
    const { queue, send } = setup({ m1: 1 });
    queue.vote("m1", null);
    queue.vote("m1", 1);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(send).not.toHaveBeenCalled();
  });

  it("takes a vote back with null and saves only accepted votes", async () => {
    const { queue, send, saved } = setup({ m1: 0 });
    queue.vote("m1", null);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(send).toHaveBeenCalledWith("m1", null, undefined);
    expect(saved.at(-1)).toEqual({});
  });

  it("shows the accepted vote again and reports the failure when the request fails", async () => {
    const { queue, last, saved } = setup({ m1: 1 }, vi.fn().mockRejectedValue(new Error("500")));
    const onFailed = vi.fn();
    queue.setHandlers({ send: vi.fn().mockRejectedValue(new Error("500")), onFailed });
    queue.vote("m1", 0);
    expect(last()).toEqual({ m1: 0 });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(last()).toEqual({ m1: 1 });
    expect(saved).toEqual([]);
    expect(onFailed).toHaveBeenCalledWith("m1");
  });

  it("sends one message's votes one at a time, the newest last", async () => {
    let release!: () => void;
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const { queue } = setup({}, send);
    queue.vote("m1", 1);
    await vi.advanceTimersByTimeAsync(DELAY);
    queue.vote("m1", 0);
    await vi.advanceTimersByTimeAsync(DELAY);
    // The second request waits for the first
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.map((call) => call[1])).toEqual([1, 0]);
  });

  it("holds a deferred 👎 until commit, then sends it once with the reason", async () => {
    const { queue, send } = setup();
    queue.vote("m1", 0, { defer: true });
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(send).not.toHaveBeenCalled();

    await queue.commit("m1", { reason: "Lạc đề" });
    // The sheet closes after submit: nothing more to send
    await queue.commit("m1");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("m1", 0, { reason: "Lạc đề" });
  });

  it("flushAll sends every vote still waiting", async () => {
    const { queue, send } = setup();
    queue.vote("m1", 1);
    queue.vote("m2", 0, { defer: true });
    queue.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ["m1", 1],
      ["m2", 0],
    ]);
  });
});
