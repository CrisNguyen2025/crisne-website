import { describe, it, expect } from "vitest";
import {
  cleanAntiSlopText,
  countWords,
  getFirstSentence,
  isDirectAnswerCompliant,
  createAntiSlopTransformStream,
  THROAT_CLEARING_OPENERS,
  SYCOPHANTIC_PRAISE,
  ROBOTIC_META_DISCOURSE,
  SUMMARY_RECAP_KICKERS,
  BANNED_BUZZWORDS,
} from "@/lib/ai/anti-slop";

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function createMockStringStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<any>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      result += typeof value === "string" ? value : decoder.decode(value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
}

describe("lib/ai/anti-slop — Pattern Catalogs", () => {
  it("defines non-empty catalogs for all anti-slop categories", () => {
    expect(THROAT_CLEARING_OPENERS.length).toBeGreaterThanOrEqual(10);
    expect(SYCOPHANTIC_PRAISE.length).toBeGreaterThanOrEqual(4);
    expect(ROBOTIC_META_DISCOURSE.length).toBeGreaterThanOrEqual(4);
    expect(SUMMARY_RECAP_KICKERS.length).toBeGreaterThanOrEqual(6);
    expect(BANNED_BUZZWORDS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("lib/ai/anti-slop — Text Helpers", () => {
  it("counts words accurately across whitespace variations", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("Cris Nguyen")).toBe(2);
    expect(countWords("Cris   Nguyen   Software   Engineer")).toBe(4);
  });

  it("extracts the first sentence cleanly, respecting punctuation and tech abbreviations", () => {
    expect(getFirstSentence("")).toBe("");
    expect(getFirstSentence("Cris có hơn 5 năm kinh nghiệm.")).toBe("Cris có hơn 5 năm kinh nghiệm.");
    expect(getFirstSentence("Cris xây dựng Next.js và React. Anh ấy chuyên AI RAG.")).toBe(
      "Cris xây dựng Next.js và React."
    );
    expect(getFirstSentence("Tuyệt vời! Cris là kỹ sư phần mềm.")).toBe("Tuyệt vời!");
  });

  it("checks direct answer compliance within the 20-word constraint", () => {
    const validAnswer = "Cris có 5 năm kinh nghiệm chuyên sâu về Next.js và AI RAG.";
    expect(isDirectAnswerCompliant(validAnswer, 20)).toBe(true);

    const tooLongAnswer =
      "Cris là một kỹ sư phần mềm rất giàu kinh nghiệm với hơn năm năm làm việc liên tục trong các dự án công nghệ lớn nhỏ khác nhau trên toàn quốc và quốc tế.";
    expect(isDirectAnswerCompliant(tooLongAnswer, 20)).toBe(false);

    expect(isDirectAnswerCompliant("", 20)).toBe(false);

    const answerWithTagPunctuation =
      "Cris có 5 năm kinh nghiệm chuyên sâu về Next.js và hệ thống AI [[action:roadmap|layer-03|Tầng 03 RAG]].";
    expect(isDirectAnswerCompliant(answerWithTagPunctuation, 20)).toBe(true);
  });
});

describe("lib/ai/anti-slop — cleanAntiSlopText", () => {
  it("strips Vietnamese conversational openers", () => {
    const samples = [
      "Chào bạn! Cris có thể tư vấn kiến trúc.",
      "Xin chào! Cris có thể tư vấn kiến trúc.",
      "Chào mừng bạn đến với Cris AI! Cris có thể tư vấn kiến trúc.",
      "Rất vui được hỗ trợ bạn! Cris có thể tư vấn kiến trúc.",
      "Rất vui được hỗ trợ! Cris có thể tư vấn kiến trúc.",
      "Cảm ơn bạn đã đặt câu hỏi! Cris có thể tư vấn kiến trúc.",
      "Về câu hỏi của bạn, Cris có thể tư vấn kiến trúc.",
      "Dưới đây là thông tin: Cris có thể tư vấn kiến trúc.",
    ];

    for (const sample of samples) {
      const cleaned = cleanAntiSlopText(sample);
      expect(cleaned).toBe("Cris có thể tư vấn kiến trúc.");
    }
  });

  it("strips English throat-clearing openers", () => {
    const samples = [
      "Hello there! Cris is a Senior Frontend Engineer.",
      "Hi! Cris is a Senior Frontend Engineer.",
      "Great question! Cris is a Senior Frontend Engineer.",
      "Thanks for asking! Cris is a Senior Frontend Engineer.",
      "I'd be happy to help! Cris is a Senior Frontend Engineer.",
      "To answer your question, Cris is a Senior Frontend Engineer.",
    ];

    for (const sample of samples) {
      const cleaned = cleanAntiSlopText(sample);
      expect(cleaned).toBe("Cris is a Senior Frontend Engineer.");
    }
  });

  it("strips chained sycophantic praise and multiple openers", () => {
    const input = "Chào bạn! Tuyệt vời! Rất vui được gặp bạn. Cris có 5 năm kinh nghiệm chuyên môn.";
    const cleaned = cleanAntiSlopText(input);
    expect(cleaned).toBe("Cris có 5 năm kinh nghiệm chuyên môn.");
  });

  it("strips robotic meta-discourse openers", () => {
    const input = "Dựa vào tài liệu được cung cấp, Cris đã phát triển nền tảng Kamala.";
    const cleaned = cleanAntiSlopText(input);
    expect(cleaned).toBe("Cris đã phát triển nền tảng Kamala.");

    const inputCompound = "Dựa vào tài liệu được cung cấp ở trên, Cris đã phát triển nền tảng Kamala.";
    expect(cleanAntiSlopText(inputCompound)).toBe("Cris đã phát triển nền tảng Kamala.");
  });

  it("strips trailing summary kickers in Vietnamese and English", () => {
    const samples = [
      {
        raw: "Cris chuyên về Next.js.\n\nTóm lại, nếu bạn có thắc mắc hãy liên hệ nhé!",
        expected: "Cris chuyên về Next.js.",
      },
      {
        raw: "Cris chuyên về Next.js. Hy vọng câu trả lời này sẽ giúp ích cho bạn!",
        expected: "Cris chuyên về Next.js.",
      },
      {
        raw: "Cris chuyên về Next.js. Chúc bạn một ngày tốt lành!",
        expected: "Cris chuyên về Next.js.",
      },
      {
        raw: "Cris specializes in Next.js.\n\nIn conclusion, feel free to reach out anytime.",
        expected: "Cris specializes in Next.js.",
      },
      {
        raw: "Cris specializes in Next.js. Hope this helps!",
        expected: "Cris specializes in Next.js.",
      },
    ];

    for (const { raw, expected } of samples) {
      expect(cleanAntiSlopText(raw)).toBe(expected);
    }
  });

  it("preserves already clean content without changes", () => {
    const clean = "Kamala là nền tảng thương mại điện tử kết hợp cổng du lịch thực tế.";
    expect(cleanAntiSlopText(clean)).toBe(clean);
  });

  it("preserves trailing action tags while removing preceding kickers", () => {
    const raw =
      "Cris đã phát triển Kamala. Tóm lại, bạn có thể xem thêm chi tiết. [[action:project|kamala-commerce-tour|Xem Kamala]]";
    const cleaned = cleanAntiSlopText(raw);
    expect(cleaned).not.toContain("Tóm lại");
    expect(cleaned).toContain("[[action:project|kamala-commerce-tour|Xem Kamala]]");
  });

  it("preserves mid-sentence kickers and code block comments without false-positive truncation", () => {
    const midSentence1 = "Dự án này nhìn chung, được chia làm 3 phần: backend, frontend, devops.";
    expect(cleanAntiSlopText(midSentence1)).toBe(midSentence1);

    const midSentence2 = "The overall, design is good.";
    expect(cleanAntiSlopText(midSentence2)).toBe(midSentence2);

    const codeSnippet = "Cris đã viết code sau:\n```typescript\n// in summary: return true;\nreturn true;\n```";
    expect(cleanAntiSlopText(codeSnippet)).toBe(codeSnippet);
  });

  it("safely handles repetitive whitespace without catastrophic backtracking ReDoS", () => {
    const input = "Cris " + " \n ".repeat(20) + "abc";
    const start = performance.now();
    const result = cleanAntiSlopText(input);
    const duration = performance.now() - start;
    expect(result).toBe(input);
    expect(duration).toBeLessThan(15);
  });
});

describe("lib/ai/anti-slop — createAntiSlopTransformStream", () => {
  it("streams binary Uint8Array chunks and purges leading greeting", async () => {
    const stream = createMockStream(["Xin chào bạn! ", "Cris có thể hỗ trợ ", "bạn về AI RAG."]);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream());
    const result = await readStream(transformed);
    expect(result.trim()).toBe("Cris có thể hỗ trợ bạn về AI RAG.");
  });

  it("streams string chunks without requiring binary conversion", async () => {
    const stream = createMockStringStream(["Tuyệt vời! ", "Cris chuyên về ", "Next.js App Router."]);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream<string>());
    const result = await readStream(transformed);
    expect(result.trim()).toBe("Cris chuyên về Next.js App Router.");
  });

  it("handles extreme tokenization (1-char chunks) without corrupting Vietnamese UTF-8 or tags", async () => {
    const text = "Chào bạn! Kamala [[action:project|kamala-commerce-tour|Kamala]]";
    const chars = Array.from(text);
    const stream = createMockStream(chars);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream());
    const result = await readStream(transformed);
    expect(result.trim()).toBe("Kamala [[action:project|kamala-commerce-tour|Kamala]]");
  });

  it("safely handles stream containing only greetings by outputting empty stream", async () => {
    const stream = createMockStream(["Chào bạn, rất vui được hỗ trợ bạn! "]);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream());
    const result = await readStream(transformed);
    expect(result.trim()).toBe("");
  });

  it("emits immediately when content is clean without delay or buffering lock", async () => {
    const stream = createMockStream(["Cris ", "Nguyen"]);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream());
    const reader = transformed.getReader();
    const firstChunk = await reader.read();
    expect(firstChunk.done).toBe(false);
    const decoder = new TextDecoder();
    const text = typeof firstChunk.value === "string" ? firstChunk.value : decoder.decode(firstChunk.value);
    expect(text).toBe("Cris ");
  });

  it("emits chunks immediately without stalling when trigger phrases appear mid-sentence", async () => {
    const stream = createMockStream(["Cris khuyên nếu bạn muốn ", "xây dựng web, hãy chọn Next.js."]);
    const transformed = stream.pipeThrough(createAntiSlopTransformStream());
    const reader = transformed.getReader();

    const chunk1 = await reader.read();
    expect(chunk1.done).toBe(false);
    const decoder = new TextDecoder();
    const text1 = typeof chunk1.value === "string" ? chunk1.value : decoder.decode(chunk1.value);
    expect(text1).toBe("Cris khuyên nếu bạn muốn ");

    const chunk2 = await reader.read();
    expect(chunk2.done).toBe(false);
    const text2 = typeof chunk2.value === "string" ? chunk2.value : decoder.decode(chunk2.value);
    expect(text2).toBe("xây dựng web, hãy chọn Next.js.");
  });
});
