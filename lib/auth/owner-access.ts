function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

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
 * Machine-to-machine access (script gọi máy) via the `x-admin-key` header.
 * Fail-closed: when `ADMIN_API_KEY` is not configured, no key is ever accepted.
 */
export function hasValidAdminKey(req: Request): boolean {
  const expectedKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers.get("x-admin-key");
  if (!expectedKey || !providedKey) return false;

  return constantTimeEqual(expectedKey, providedKey);
}
