import { describe, expect, it } from "vitest";
import {
  IngestRequestSchema,
  JobCompleteRequestSchema,
  NewsSummaryOutputSchema,
} from "@/lib/news/schemas";

describe("news Zod schemas", () => {
  it("validates a well-formed LLM summary JSON payload", () => {
    const parsed = NewsSummaryOutputSchema.safeParse({
      title: "Next.js 16 cập nhật Turbopack mặc định",
      tldr: "Next.js 16 bật Turbopack ổn định cho dev và cải thiện tốc độ build đáng kể.",
      takeaways: [
        "Turbopack ổn định cho cả dev và production build.",
        "Hỗ trợ React Compiler ổn định hơn.",
      ],
      tags: ["nextjs", "frontend"],
      language: "vi",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts up to 10 takeaways and rejects more", () => {
    const points = Array.from({ length: 11 }, (_, index) => `Concept number ${index + 1}`);
    const base = {
      title: "Next.js 16.4 release notes",
      tldr: "Next.js 16.4 ships many independent improvements.",
      tags: ["nextjs"],
      language: "en",
    };
    expect(NewsSummaryOutputSchema.safeParse({ ...base, takeaways: points.slice(0, 10) }).success).toBe(
      true
    );
    expect(NewsSummaryOutputSchema.safeParse({ ...base, takeaways: points }).success).toBe(false);
  });

  it("rejects invalid or incomplete summary payloads", () => {
    expect(
      NewsSummaryOutputSchema.safeParse({
        title: "No",
        tldr: "Quá ngắn",
        takeaways: [],
        tags: [],
        language: "fr",
      }).success
    ).toBe(false);
  });

  it("validates JobCompleteRequestSchema variants", () => {
    expect(
      JobCompleteRequestSchema.safeParse({
        outcome: "ready",
        extractionMethod: "captions",
        summary: {
          title: "Giới thiệu Langfuse v5 OTEL SDK",
          tldr: "Langfuse v5 chuyển sang chuẩn OpenTelemetry giúp gom trace linh hoạt hơn.",
          takeaways: ["Dùng OpenTelemetry exporter chuẩn."],
          tags: ["langfuse", "observability"],
          language: "vi",
        },
        thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      }).success
    ).toBe(true);

    expect(
      JobCompleteRequestSchema.safeParse({
        outcome: "partial",
        extractionError: "TikTok blocked media download (403)",
      }).success
    ).toBe(true);

    expect(
      JobCompleteRequestSchema.safeParse({
        outcome: "ready",
        extractionMethod: "captions",
        summary: { title: "Bad" },
      }).success
    ).toBe(false);
  });

  it("applies default origin='manual' to IngestRequestSchema", () => {
    const parsed = IngestRequestSchema.parse({ url: "https://youtube.com/watch?v=abc123" });
    expect(parsed.origin).toBe("manual");
  });
});
