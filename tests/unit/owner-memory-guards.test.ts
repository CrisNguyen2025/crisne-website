import { describe, expect, it } from "vitest";
import { containsSecret, hasMeaningfulText, maskPII } from "@/lib/ai/pii-mask";
import {
  OWNER_MEMORY_SOURCES,
  cleanEvidenceSnippet,
  parseConfidence,
  parseSourceThreadId,
  parseValidTo,
  sanitizeMemoryTextForStorage,
} from "@/lib/roadmap/owner-memory";

describe("owner memory secret & PII guards", () => {
  it("detects API keys, PEM keys, credentialed URLs, high-entropy Bearer, and secret env assignments", () => {
    expect(containsSecret("sk-proj-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
    expect(containsSecret("-----BEGIN RSA PRIVATE KEY-----\nabc")).toBe(true);
    expect(containsSecret("postgres://admin:superSecretPass@db.internal:5432/app")).toBe(true);
    expect(containsSecret("Authorization: Bearer mF_9.B5f-4.1JqM99")).toBe(true);
    expect(containsSecret("BOT_ADMIN_KEY=my-very-secret-admin-key")).toBe(true);
  });

  it("does not false-positive on harmless study notes", () => {
    expect(containsSecret("Dùng Bearer JWT trong Authorization header")).toBe(false);
    expect(containsSecret("Kết nối local postgres://localhost:5432/app")).toBe(false);
    expect(containsSecret("Đọc biến API_KEY từ process.env")).toBe(false);
    expect(containsSecret("Học TypeScript strict mode và React Query")).toBe(false);
  });

  it("masks PII and distinguishes meaningful text from placeholder-only text", () => {
    const maskedEmailOnly = maskPII("Email: owner@example.com");
    expect(maskedEmailOnly).toBe("Email: [email]");
    expect(hasMeaningfulText(maskedEmailOnly)).toBe(false);
    expect(hasMeaningfulText("0912345678")).toBe(true);
    expect(hasMeaningfulText(maskPII("0912345678"))).toBe(false);
    expect(hasMeaningfulText("Học Go")).toBe(true);
    expect(hasMeaningfulText(maskPII("Dùng email owner@example.com cho môi trường staging"))).toBe(
      true,
    );
  });

  it("sanitizes memory text and parses provenance metadata", () => {
    expect(OWNER_MEMORY_SOURCES).toEqual(["explicit", "suggested", "observed"]);

    const rejected = sanitizeMemoryTextForStorage("ghp_1234567890abcdef123456");
    expect(rejected.ok).toBe(false);

    const piiOnly = sanitizeMemoryTextForStorage("SĐT: 0912345678");
    expect(piiOnly.ok).toBe(false);

    const valid = sanitizeMemoryTextForStorage("  Email test owner@example.com dùng cho CI  ");
    expect(valid).toEqual({
      ok: true,
      content: "Email test [email] dùng cho CI",
    });

    expect(cleanEvidenceSnippet("sk-proj-abcdefghijklmnopqrstuvwxyz123456")).toBeNull();
    expect(cleanEvidenceSnippet("Liên hệ owner@example.com khi deploy")).toBe(
      "Liên hệ [email] khi deploy",
    );

    expect(parseConfidence(0.8567)).toEqual({ ok: true, value: 0.857 });
    expect(parseConfidence(1.5).ok).toBe(false);
    expect(parseValidTo("2026-12-31T00:00:00.000Z").ok).toBe(true);
    expect(parseValidTo("not-a-date").ok).toBe(false);
    expect(parseSourceThreadId("thread_abc-123:01")).toBe("thread_abc-123:01");
    expect(parseSourceThreadId("bad thread id!")).toBeNull();
  });
});
