import { afterEach, describe, expect, it, vi } from "vitest";
import { getOwnerEmails, hasValidAdminKey, isOwnerEmail } from "@/lib/auth/owner-access";

const withAdminKey = (key?: string) =>
  new Request("http://localhost/api/x", { headers: key ? { "x-admin-key": key } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("owner emails", () => {
  it("parses a comma-separated, case-insensitive allowlist", () => {
    vi.stubEnv("AUTH_OWNER_EMAILS", " Owner@Example.com , second@example.com,");
    expect(getOwnerEmails()).toEqual(["owner@example.com", "second@example.com"]);
    expect(isOwnerEmail("OWNER@example.com")).toBe(true);
    expect(isOwnerEmail("stranger@example.com")).toBe(false);
  });

  it("allows nobody when the allowlist is empty (fail-closed)", () => {
    vi.stubEnv("AUTH_OWNER_EMAILS", "");
    expect(isOwnerEmail("owner@example.com")).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });
});

describe("hasValidAdminKey", () => {
  it("accepts only the exact configured key", () => {
    vi.stubEnv("ADMIN_API_KEY", "s3cret-key");
    expect(hasValidAdminKey(withAdminKey("s3cret-key"))).toBe(true);
    expect(hasValidAdminKey(withAdminKey("s3cret-kez"))).toBe(false);
    expect(hasValidAdminKey(withAdminKey("short"))).toBe(false);
    expect(hasValidAdminKey(withAdminKey())).toBe(false);
  });

  it("rejects every request when ADMIN_API_KEY is not configured (fail-closed)", () => {
    vi.stubEnv("ADMIN_API_KEY", "");
    expect(hasValidAdminKey(withAdminKey(""))).toBe(false);
    expect(hasValidAdminKey(withAdminKey("anything"))).toBe(false);
  });
});
