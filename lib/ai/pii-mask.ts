// Same patterns as roadmap-rag-assistant/rag_service/pii.py; keep the two in sync.

// API keys and tokens by their well-known prefixes (OpenAI/Anthropic sk-, Langfuse sk-lf-/pk-lf-, Groq gsk_,
// GitHub, Slack, Google AIza, AWS AKIA) plus JWTs. Checked first: they contain digits the number patterns would eat.
const SECRET_PATTERN = new RegExp(
  [
    String.raw`\b(?:sk-(?:proj-|ant-|lf-)?|pk-lf-|gsk_|ghp_|gho_|ghs_|github_pat_|xox[abposr]-)[A-Za-z0-9_-]{16,}`,
    String.raw`\bAIza[0-9A-Za-z_-]{35}`,
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    String.raw`\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`,
  ].join("|"),
  "g",
);

const ADDITIONAL_SECRET_PATTERN = /\b(?:glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|ASIA[0-9A-Z]{16})\b/;
const PEM_PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/;
const URL_CANDIDATE_PATTERN = /\b[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi;
const BEARER_EXTRACT_PATTERN = /\bBearer\s+([^\s"'`,;)\]<>]+)/g;
const ENV_ASSIGN_EXTRACT_PATTERN = /\b([A-Z][A-Z0-9_]{2,})\s*[:=]\s*["']?([^\s"'`,;)]{12,})/g;
const SECRET_ENV_KEYWORDS = [
  "SECRET",
  "PASSWORD",
  "PASSWD",
  "API_KEY",
  "ADMIN_KEY",
  "ACCESS_TOKEN",
  "PRIVATE_KEY",
] as const;
const PII_PLACEHOLDER_PATTERN = /\[(?:secret|email|phone|cccd|card)\]/g;

// Payment cards: 13–19 digits, optional space/dash groups; masked only when the Luhn checksum holds.
const CARD_PATTERN = /(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w-])/g;

// Vietnamese citizen ID (CCCD): exactly 12 digits standing alone.
const CCCD_PATTERN = /(?<![\w.-])\d{12}(?![\w.-])/g;

const EMAIL_PATTERN = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

function hasAlphaTld(email: string): boolean {
  const lastDot = email.lastIndexOf(".");
  if (lastDot < 0) return false;
  const tld = email.slice(lastDot + 1);
  return tld.length >= 2 && /^[A-Za-z]+$/.test(tld);
}

// Vietnamese numbers: 0xxx / 84xxx / +84xxx, 9–11 digits, optional space/dot/dash separators.
// Must start with 0 or 84 directly followed by 1–9, so decimals like retrieval scores (0.8067…) never match.
const VN_PHONE_PATTERN = /(?<![\w.+])(?:\+?84|0)[1-9](?:[\s.-]?\d){7,9}(?!\d)/g;

// Other international numbers written with a leading "+"
const INTL_PHONE_PATTERN = /(?<![\w.])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)/g;

function luhnOk(digits: string): boolean {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d > 4 ? d * 2 - 9 : d * 2;
    total += d;
  }
  return total % 10 === 0;
}

/**
 * Replaces secrets, emails, card numbers, CCCD numbers and phone numbers typed by visitors
 * before traces leave the server.
 */
export function maskPII(text: string): string {
  return text
    .replace(SECRET_PATTERN, "[secret]")
    .replace(EMAIL_PATTERN, (m) => (hasAlphaTld(m) ? "[email]" : m))
    .replace(CARD_PATTERN, (m) => (luhnOk(m.replace(/\D/g, "")) ? "[card]" : m))
    .replace(CCCD_PATTERN, "[cccd]")
    .replace(VN_PHONE_PATTERN, "[phone]")
    .replace(INTL_PHONE_PATTERN, "[phone]");
}

function isHighEntropyBearerToken(token: string): boolean {
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(token)) {
    return false;
  }
  if (token.length >= 28) {
    return true;
  }
  return token.length >= 16 && /\d/.test(token) && /[A-Za-z]/.test(token);
}

function hasCredentialedUrl(text: string): boolean {
  for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
    try {
      const parsed = new URL(match[0]);
      if (parsed.password) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export function containsSecret(text: string): boolean {
  if (!text) {
    return false;
  }
  if (
    new RegExp(SECRET_PATTERN.source).test(text) ||
    ADDITIONAL_SECRET_PATTERN.test(text) ||
    PEM_PRIVATE_KEY_PATTERN.test(text) ||
    hasCredentialedUrl(text)
  ) {
    return true;
  }
  for (const match of text.matchAll(BEARER_EXTRACT_PATTERN)) {
    if (match[1] && isHighEntropyBearerToken(match[1])) {
      return true;
    }
  }
  for (const match of text.matchAll(ENV_ASSIGN_EXTRACT_PATTERN)) {
    const keyName = match[1];
    if (keyName && SECRET_ENV_KEYWORDS.some((kw) => keyName.includes(kw))) {
      return true;
    }
  }
  return false;
}

export function hasMeaningfulText(text: string): boolean {
  const hasPlaceholder = new RegExp(PII_PLACEHOLDER_PATTERN.source).test(text);
  const withoutPlaceholders = text.replace(PII_PLACEHOLDER_PATTERN, "");
  const meaningfulChars = withoutPlaceholders.replace(/[^\p{L}\p{N}]+/gu, "");
  return meaningfulChars.length >= (hasPlaceholder ? 6 : 3);
}
