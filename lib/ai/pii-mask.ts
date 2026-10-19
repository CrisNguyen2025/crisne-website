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

// Payment cards: 13–19 digits, optional space/dash groups; masked only when the Luhn checksum holds.
const CARD_PATTERN = /(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w-])/g;

// Vietnamese citizen ID (CCCD): exactly 12 digits standing alone.
const CCCD_PATTERN = /(?<![\w.-])\d{12}(?![\w.-])/g;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

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
    .replace(EMAIL_PATTERN, "[email]")
    .replace(CARD_PATTERN, (m) => (luhnOk(m.replace(/\D/g, "")) ? "[card]" : m))
    .replace(CCCD_PATTERN, "[cccd]")
    .replace(VN_PHONE_PATTERN, "[phone]")
    .replace(INTL_PHONE_PATTERN, "[phone]");
}
