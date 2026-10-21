import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({ knowledgeTriage: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const langfuseMock = vi.hoisted(() => ({
  createFeedbackScore: vi.fn(),
  deleteFeedbackScore: vi.fn(),
  addToReviewQueue: vi.fn(),
}));
vi.mock("@/lib/ai/langfuse", () => langfuseMock);

import { POST } from "@/app/api/chat/feedback/route";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
let clientIp = 0;

const feedbackRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/chat/feedback", {
    method: "POST",
    // Unique IP per request so the rate limiter never interferes
    headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${++clientIp}` },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/chat/feedback", () => {
  it("scores the trace with the masked reason and comment", async () => {
    const res = await POST(
      feedbackRequest({
        traceId: TRACE_ID,
        value: 0,
        reason: "Sai kiến thức, gọi 0912 345 678",
        comment: "Gửi bài đúng cho a.b@gmail.com",
        source: "roadmap-assistant",
      })
    );

    expect(res.status).toBe(204);
    expect(langfuseMock.createFeedbackScore).toHaveBeenCalledWith(TRACE_ID, 0, {
      reason: "Sai kiến thức, gọi [phone]",
      comment: "Gửi bài đúng cho [email]",
      source: "roadmap-assistant",
    });
  });

  it("sends a 👎 to the review queue, a 👍 not", async () => {
    await POST(feedbackRequest({ traceId: TRACE_ID, value: 0 }));
    await POST(feedbackRequest({ traceId: TRACE_ID, value: 1 }));

    expect(langfuseMock.addToReviewQueue).toHaveBeenCalledTimes(1);
    expect(langfuseMock.addToReviewQueue).toHaveBeenCalledWith(TRACE_ID);
  });

  it("removes the score when the vote is taken back", async () => {
    const res = await POST(feedbackRequest({ traceId: TRACE_ID, value: null }));

    expect(res.status).toBe(204);
    expect(langfuseMock.deleteFeedbackScore).toHaveBeenCalledWith(TRACE_ID);
    expect(langfuseMock.createFeedbackScore).not.toHaveBeenCalled();
  });

  it("never writes knowledge triage: items are imported from Langfuse by the owner", async () => {
    await POST(feedbackRequest({ traceId: TRACE_ID, value: 0, reason: "Lạc đề", comment: "x" }));

    expect(prismaMock.knowledgeTriage.create).not.toHaveBeenCalled();
  });

  it.each([
    { traceId: "not-a-trace", value: 1 },
    { traceId: TRACE_ID, value: 2 },
    { traceId: TRACE_ID },
    { traceId: TRACE_ID, value: 1, source: "Not A Source!" },
  ])("rejects an invalid payload %o", async (body) => {
    expect((await POST(feedbackRequest(body))).status).toBe(400);
    expect(langfuseMock.createFeedbackScore).not.toHaveBeenCalled();
  });
});
