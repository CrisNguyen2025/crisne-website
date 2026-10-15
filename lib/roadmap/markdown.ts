import { marked, type Token } from "marked";
import sanitizeHtml from "sanitize-html";

// Whitelist for lesson content: everything else (script, style, iframe, event handlers,
// javascript: links, ...) is dropped
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "em", "code", "pre",
    "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel"],
    // Language label of fenced code blocks, e.g. "language-ts"
    code: ["class"],
    th: ["align"],
    td: ["align"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

/**
 * Markdown (e.g. an LLM-written lesson) to HTML that is safe to render with
 * dangerouslySetInnerHTML. Raw HTML inside the Markdown is sanitized too.
 */
export function markdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function inlineText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      // Raw inline HTML is not text
      if (token.type === "html") return "";
      if ("tokens" in token && token.tokens) return inlineText(token.tokens);
      return "text" in token ? token.text : "";
    })
    .join("");
}

/** Plain text of the first paragraph, cut to `maxLength` characters ("" when there is none). */
export function markdownToPlainText(markdown: string, maxLength: number): string {
  const paragraph = marked.lexer(markdown).find((token) => token.type === "paragraph");
  if (!paragraph || !("tokens" in paragraph) || !paragraph.tokens) return "";

  const text = inlineText(paragraph.tokens).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join("").trimEnd()}…` : text;
}
