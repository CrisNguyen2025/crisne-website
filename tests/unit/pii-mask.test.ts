import { describe, expect, it } from "vitest";
import { maskPII } from "@/lib/ai/pii-mask";

describe("maskPII", () => {
  it.each([
    ["email", "liên hệ mình qua an.nguyen+job@gmail.com nhé", "liên hệ mình qua [email] nhé"],
    ["VN mobile", "sđt 0912345678", "sđt [phone]"],
    ["VN mobile with spaces", "gọi 0912 345 678 giúp", "gọi [phone] giúp"],
    ["VN mobile with dots", "0912.345.678", "[phone]"],
    ["VN +84", "+84 912 345 678", "[phone]"],
    ["VN 84 prefix", "84912345678", "[phone]"],
    ["VN landline", "028 3823 4567", "[phone]"],
    ["international", "my number is +1 415-555-0132", "my number is [phone]"],
    ["CCCD", "CCCD 012345678901 nhé", "CCCD [cccd] nhé"],
    ["card with spaces", "thẻ 4111 1111 1111 1111", "thẻ [card]"],
    ["card with dashes", "thẻ 4111-1111-1111-1111 hết hạn", "thẻ [card] hết hạn"],
    ["OpenAI-style key", "key sk-abc123def456ghi789jkl", "key [secret]"],
    ["project and Groq keys", "sk-proj-AbCdEf0123456789xyz và gsk_0123456789abcdefghij", "[secret] và [secret]"],
    ["Langfuse public key", "pk-lf-0123456789abcdef01", "[secret]"],
    ["Google API key", "AIzaSyA1234567890abcdefghijklmnopqrstuv", "[secret]"],
    ["AWS access key", "AKIAABCDEFGHIJKLMNOP", "[secret]"],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijk", "[secret]"],
  ])("masks %s", (_, input, expected) => {
    expect(maskPII(input)).toBe(expected);
  });

  it("masks inside serialized JSON (how Langfuse passes span attributes)", () => {
    const input = JSON.stringify({ message: "email tôi: x@y.io, sđt 0987654321" });
    expect(maskPII(input)).toBe(JSON.stringify({ message: "email tôi: [email], sđt [phone]" }));
  });

  it.each([
    ["retrieval scores", JSON.stringify([{ score: 0.8067538583655738, vectorScore: 0.7423384778207651 }])],
    ["dates", "Tháng 3/2024 - Hiện tại, 2026-10-14T01:44:41.623Z"],
    ["token counts", JSON.stringify({ input: 1432, output: 174, total: 1606 })],
    ["trace id", "a159474aacdc6e27ed985fc04ca02a1b"],
    ["uuid", "550e8400-e29b-41d4-a716-446655440000"],
    ["urls", "https://github.com/crisne https://crisne.blog"],
    ["ranges", "4-12 tuần, 10+ dự án, 5+ năm"],
    ["versions", "Next.js 16.2.9, React 19.2.4"],
    ["card-like number failing Luhn", "4111 1111 1111 1112"],
    ["13-digit count failing Luhn", "1234567890123 lượt xem"],
    ["unknown key prefix", "task-abcdefghijklmnopqrstuv"],
  ])("keeps %s untouched", (_, input) => {
    expect(maskPII(input)).toBe(input);
  });
});
