import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isConnectorEncryptionConfigured,
} from "@/lib/connectors/crypto";
import {
  extractSanitizedGmailBody,
  isSensitiveEmailSubject,
  sanitizeEmailText,
} from "@/lib/connectors/gmail-client";
import {
  parseMessageContextMeta,
  serializeMessageContextMeta,
} from "@/lib/roadmap/thread-state";

const TEST_HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("connector crypto, Gmail sanitization & ThreadMessage contextJson", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts secrets using AES-256-GCM with fresh IVs and tamper checks", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", "");
    expect(isConnectorEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow();

    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", TEST_HEX_KEY);
    expect(isConnectorEncryptionConfigured()).toBe(true);

    const enc1 = encryptSecret("refresh-token-abc");
    const enc2 = encryptSecret("refresh-token-abc");
    expect(enc1).toMatch(/^v1:/);
    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1)).toBe("refresh-token-abc");
    expect(decryptSecret(enc2)).toBe("refresh-token-abc");

    const parts = enc1.split(":");
    parts[3] = "AAAA";
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("filters OTP / password reset subjects and sanitizes email HTML/bodies", () => {
    expect(isSensitiveEmailSubject("Your OTP code is 492011")).toBe(true);
    expect(isSensitiveEmailSubject("Mã xác minh đăng nhập")).toBe(true);
    expect(isSensitiveEmailSubject("Reset your password")).toBe(true);
    expect(isSensitiveEmailSubject("Next.js 16.1 Release Notes")).toBe(false);

    expect(sanitizeEmailText("Card 4111222233334444 [[spoof-id]]")).toBe(
      "Card [****] spoof-id"
    );

    const htmlPayload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from(
              "<h1>Weekly AI Digest</h1><script>alert(1)</script><p>Hello <b>Owner</b></p>",
              "utf8"
            ).toString("base64url"),
          },
        },
      ],
    };
    const body = extractSanitizedGmailBody(htmlPayload);
    expect(body).toContain("Weekly AI Digest");
    expect(body).toContain("Hello Owner");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("alert(1)");
  });

  it("validates and bounds ThreadMessage contextJson cleanly", () => {
    const serialized = serializeMessageContextMeta({
      connectors: ["gmail"],
      slashCommand: "/gmail",
      gmailRefs: [{ subject: "Weekly AI Digest", from: "digest@example.com" }],
    });
    expect(serialized).not.toBeNull();
    expect(parseMessageContextMeta(serialized)).toEqual({
      connectors: ["gmail"],
      slashCommand: "/gmail",
      gmailRefs: [{ subject: "Weekly AI Digest", from: "digest@example.com" }],
    });

    // Rejects unallowed extra fields such as raw email body
    expect(
      serializeMessageContextMeta({
        connectors: ["gmail"],
        body: "Raw email body should never be saved",
      })
    ).toBeNull();

    // Rejects oversized payloads > 4096 chars
    expect(parseMessageContextMeta("x".repeat(5000))).toBeNull();
  });
});
