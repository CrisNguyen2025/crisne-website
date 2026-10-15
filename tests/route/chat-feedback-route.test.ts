import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({ knowledgeTriage: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ai/langfuse", () => ({ createFeedbackScore: vi.fn() }));

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

describe("POST /api/chat/feedback — knowledge triage", () => {
  it("masks emails and phone numbers in every visitor field before saving", async () => {
    const res = await POST(
      feedbackRequest({
        traceId: TRACE_ID,
        value: 0,
        reason: "Sai kiến thức, gọi 0912 345 678",
        comment: "Gửi bài đúng cho a.b@gmail.com",
        query: "Cris có số +84 912 345 678 không?",
        assistantMsg: "Liên hệ cris@example.com",
      })
    );

    expect(res.status).toBe(204);
    expect(prismaMock.knowledgeTriage.create.mock.calls[0][0].data).toMatchObject({
      traceId: TRACE_ID,
      reason: "Sai kiến thức, gọi [phone]",
      comment: "Gửi bài đúng cho [email]",
      query: "Cris có số [phone] không?",
      assistantMsg: "Liên hệ [email]",
      status: "PENDING",
    });
  });

  it("masks the comment even when it stands in for a missing query", async () => {
    await POST(feedbackRequest({ traceId: TRACE_ID, value: 0, comment: "Email a.b@gmail.com" }));

    expect(prismaMock.knowledgeTriage.create.mock.calls[0][0].data.query).toBe("Email [email]");
  });

  it("does not create a triage item for a thumbs up", async () => {
    await POST(feedbackRequest({ traceId: TRACE_ID, value: 1, comment: "Hay" }));

    expect(prismaMock.knowledgeTriage.create).not.toHaveBeenCalled();
  });
});
