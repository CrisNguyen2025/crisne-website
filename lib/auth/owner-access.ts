import { timingSafeEqual } from "crypto";

/**
 * Emails allowed to sign in and write data, from `AUTH_OWNER_EMAILS` (comma-separated).
 * An empty list means nobody is allowed (fail-closed).
 */
export function getOwnerEmails(): string[] {
  return (process.env.AUTH_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getOwnerEmails().includes(email.trim().toLowerCase());
}

/**
 * Machine-to-machine access (Chrome clipper extension, scripts) via the `x-admin-key` header.
 * Fail-closed: when `ADMIN_API_KEY` is not configured, no key is ever accepted.
 */
export function hasValidAdminKey(req: Request): boolean {
  const expectedKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers.get("x-admin-key");
  if (!expectedKey || !providedKey) return false;

  const expected = Buffer.from(expectedKey);
  const provided = Buffer.from(providedKey);
  // timingSafeEqual throws on different lengths; a length mismatch is simply a wrong key
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
