const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Vietnamese numbers: 0xxx / 84xxx / +84xxx, 9–11 digits, optional space/dot/dash separators.
// Must start with 0 or 84 directly followed by 1–9, so decimals like retrieval scores (0.8067…) never match.
const VN_PHONE_PATTERN = /(?<![\w.+])(?:\+?84|0)[1-9](?:[\s.-]?\d){7,9}(?!\d)/g;

// Other international numbers written with a leading "+"
const INTL_PHONE_PATTERN = /(?<![\w.])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)/g;

/**
 * Replaces emails and phone numbers typed by visitors before traces leave the server.
 */
export function maskPII(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[email]")
    .replace(VN_PHONE_PATTERN, "[phone]")
    .replace(INTL_PHONE_PATTERN, "[phone]");
}
