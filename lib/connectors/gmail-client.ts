import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import type { GmailLabelOption, SanitizedGmailMessage } from "./schemas";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const OAUTH_TIMEOUT_MS = 8000;
const GMAIL_TIMEOUT_MS = 8000;
const MAX_EMAIL_BODY_CHARS = 4000;

const SENSITIVE_SUBJECT_TERMS = [
  "otp",
  "one-time",
  "one time",
  "verification code",
  "security code",
  "mã xác minh",
  "mã xác thực",
  "mã otp",
  "reset password",
  "reset your password",
  "đặt lại mật khẩu",
  "two-factor",
  "two factor",
] as const;

const LONG_SECRET_NUMBER_RE = /\b\d{12,19}\b/g;

export class GmailAuthError extends Error {
  readonly code: "GMAIL_TOKEN_EXPIRED" | "GMAIL_OAUTH_CONFIG_MISSING" | "GMAIL_OAUTH_FAILED";

  constructor(
    code: "GMAIL_TOKEN_EXPIRED" | "GMAIL_OAUTH_CONFIG_MISSING" | "GMAIL_OAUTH_FAILED",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.AUTH_GOOGLE_ID?.trim() ?? "";
  const clientSecret = process.env.AUTH_GOOGLE_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new GmailAuthError("GMAIL_OAUTH_CONFIG_MISSING", "Google OAuth credentials are missing");
  }
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim());
}

export function createOAuthStateAndPkce(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export function buildGoogleGmailAuthUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const { clientId } = getGoogleOAuthCredentials();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
}

export interface GoogleTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string;
}

export async function exchangeGmailOAuthCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<GoogleTokenBundle> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!resp.ok || !data.access_token) {
    throw new GmailAuthError("GMAIL_OAUTH_FAILED", `Token exchange failed (${data.error ?? resp.status})`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSeconds: Number(data.expires_in ?? 3600),
    scope: data.scope ?? GMAIL_READONLY_SCOPE,
  };
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresInSeconds: number;
}> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!resp.ok || !data.access_token) {
    if (data.error === "invalid_grant" || resp.status === 400 || resp.status === 401) {
      throw new GmailAuthError("GMAIL_TOKEN_EXPIRED", "Gmail refresh token expired or revoked");
    }
    throw new GmailAuthError("GMAIL_OAUTH_FAILED", `Token refresh failed (${resp.status})`);
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: Number(data.expires_in ?? 3600),
  };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort remote revoke; local DB cleanup proceeds regardless.
  }
}

export async function fetchGmailProfileEmail(accessToken: string): Promise<string> {
  const resp = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
  if (resp.status === 401) {
    throw new GmailAuthError("GMAIL_TOKEN_EXPIRED", "Gmail access token unauthorized");
  }
  if (!resp.ok) {
    throw new Error(`Gmail profile fetch failed (${resp.status})`);
  }
  const data = (await resp.json()) as { emailAddress?: string };
  if (!data.emailAddress) {
    throw new Error("Gmail profile did not include emailAddress");
  }
  return data.emailAddress;
}

const ALLOWED_SYSTEM_LABELS = new Set(["INBOX", "STARRED", "IMPORTANT", "UNREAD"]);

export async function fetchGmailLabels(accessToken: string): Promise<GmailLabelOption[]> {
  const resp = await fetch(`${GMAIL_API_BASE}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
  if (resp.status === 401) {
    throw new GmailAuthError("GMAIL_TOKEN_EXPIRED", "Gmail access token unauthorized");
  }
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    labels?: { id?: string; name?: string; type?: string }[];
  };
  return (data.labels ?? [])
    .filter(
      (l): l is { id: string; name: string; type?: string } =>
        Boolean(l.id && l.name && (l.type === "user" || ALLOWED_SYSTEM_LABELS.has(l.id)))
    )
    .slice(0, 40)
    .map((l) => ({ id: l.id, name: l.name }));
}

export function isSensitiveEmailSubject(subject: string): boolean {
  const lower = subject.toLowerCase();
  if (/\b2fa\b/.test(lower)) return true;
  return SENSITIVE_SUBJECT_TERMS.some((term) => lower.includes(term));
}

export function sanitizeEmailText(raw: string, maxChars = MAX_EMAIL_BODY_CHARS): string {
  const normalizedLines = raw
    .replaceAll("[[", "")
    .replaceAll("]]", "")
    .replace(LONG_SECRET_NUMBER_RE, "[****]")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalizedLines.slice(0, maxChars);
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeBase64UrlUtf8(encoded?: string): string {
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function extractPartText(part: GmailPart | undefined, mime: "text/plain" | "text/html"): string {
  if (!part) return "";
  if (part.mimeType === mime && part.body?.data) {
    return decodeBase64UrlUtf8(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = extractPartText(child, mime);
    if (found) return found;
  }
  return "";
}

export function extractSanitizedGmailBody(payload: GmailPart | undefined): string {
  const plain = extractPartText(payload, "text/plain");
  if (plain.trim()) {
    return sanitizeEmailText(plain);
  }
  const html = extractPartText(payload, "text/html");
  if (!html.trim()) return "";
  const stripped = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return sanitizeEmailText(stripped);
}

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string
): string {
  const target = name.toLowerCase();
  return headers?.find((h) => h.name?.toLowerCase() === target)?.value?.trim() ?? "";
}

interface GmailRawMessage {
  id?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
}

async function fetchGmailMessageDetail(
  id: string,
  accessToken: string
): Promise<GmailRawMessage | null> {
  const msgResp = await fetch(`${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
  if (msgResp.status === 401) {
    throw new GmailAuthError("GMAIL_TOKEN_EXPIRED", "Gmail access token unauthorized");
  }
  if (!msgResp.ok) return null;
  return (await msgResp.json()) as GmailRawMessage;
}

function toSanitizedGmailMessage(
  item: GmailRawMessage | null,
  filterSensitive: boolean
): SanitizedGmailMessage | null {
  if (!item?.id) return null;
  const headers = item.payload?.headers;
  const rawSubject = headerValue(headers, "Subject");
  const subject = (rawSubject ? sanitizeEmailText(rawSubject, 200) : "") || "(Không có tiêu đề)";
  if (filterSensitive && isSensitiveEmailSubject(subject)) {
    return null;
  }
  const rawFrom = headerValue(headers, "From");
  const from = (rawFrom ? sanitizeEmailText(rawFrom, 160) : "") || "(Không rõ người gửi)";
  const date = headerValue(headers, "Date");
  const body = extractSanitizedGmailBody(item.payload);
  const snippet = sanitizeEmailText(item.snippet ?? body, 240);
  return { id: item.id, subject, from, date, snippet, body: body || snippet };
}

export async function fetchGmailMessages(params: {
  accessToken: string;
  query: string;
  allowedLabelIds?: string[];
  maxResults?: number;
  excludeSensitiveSubjects?: boolean;
}): Promise<SanitizedGmailMessage[]> {
  const capped = Math.max(1, Math.min(params.maxResults ?? 5, 5));
  const safeQuery = `${params.query.trim()} -in:spam -in:trash`.trim();
  const listUrl = new URL(`${GMAIL_API_BASE}/messages`);
  listUrl.searchParams.set("maxResults", String(Math.min(capped + 3, 10)));
  if (safeQuery) {
    listUrl.searchParams.set("q", safeQuery);
  }
  for (const labelId of params.allowedLabelIds ?? []) {
    listUrl.searchParams.append("labelIds", labelId);
  }

  const listResp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
  if (listResp.status === 401) {
    throw new GmailAuthError("GMAIL_TOKEN_EXPIRED", "Gmail access token unauthorized");
  }
  if (!listResp.ok) {
    throw new Error(`Gmail messages list failed (${listResp.status})`);
  }
  const listData = (await listResp.json()) as { messages?: { id?: string }[] };
  const ids = (listData.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))
    .slice(0, Math.min(capped + 3, 8));

  const details = await Promise.all(
    ids.map((id) => fetchGmailMessageDetail(id, params.accessToken))
  );
  const filterSensitive = params.excludeSensitiveSubjects ?? true;
  return details
    .map((item) => toSanitizedGmailMessage(item, filterSensitive))
    .filter((msg): msg is SanitizedGmailMessage => msg !== null)
    .slice(0, capped);
}
