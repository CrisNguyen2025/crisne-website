/**
 * Design system rules of docs/design-system.md (`DS-*`). All findings are `nit`: CI reports them but
 * does not block. Pure functions over file contents.
 */
import { classifyArea } from "./files";
import { lineOf } from "./source-checks";
import type { Finding, SourceFile } from "./types";

/** shadcn primitives (top level of components/ui) and ImageResponse files keep their raw values */
export function isDesignSystemFile(file: SourceFile): boolean {
  if (!file.path.endsWith(".tsx") || classifyArea(file.path, file.content) !== "ui") return false;
  if (/^components\/ui\/[^/]+\.tsx$/.test(file.path)) return false;
  return !/(^|\/)(opengraph-image|twitter-image|icon|apple-icon)\.tsx$/.test(file.path);
}

function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(line);
}

function perLine(
  file: SourceFile,
  checkId: string,
  pattern: RegExp,
  message: (match: RegExpMatchArray) => string | null
): Finding[] {
  if (!isDesignSystemFile(file)) return [];
  const findings: Finding[] = [];
  file.content.split("\n").forEach((line, index) => {
    if (isCommentLine(line)) return;
    for (const match of line.matchAll(pattern)) {
      const text = message(match);
      if (text) findings.push({ checkId, severity: "nit", file: file.path, line: index + 1, message: text });
    }
  });
  return findings;
}

// ── DS-RAW-COLOR ───────────────────────────────────────────────────────────────

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const PALETTE_CLASS = new RegExp(
  `\\b(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret|placeholder)-(?:${PALETTE})-(?:50|[1-9]00|950)\\b`,
  "g"
);
const LITERAL_COLOR = /(?<=["'`\[(\s,:])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch)\(/g;

/**
 * Literal colours that must stay literal: SVG artwork such as brand logos (`fill="#4285F4"`) and the
 * viewport `themeColor` (a meta tag, CSS variables do not apply there)
 */
function isLiteralColorAllowed(line: string): boolean {
  return /\b(fill|stroke|stopColor|floodColor)=["{]/.test(line) || /prefers-color-scheme/.test(line);
}

export function checkRawColor(file: SourceFile): Finding[] {
  return [
    ...perLine(file, "DS-RAW-COLOR", PALETTE_CLASS, (m) => `Màu palette thô "${m[0]}": dùng token màu`),
    ...perLine(file, "DS-RAW-COLOR", LITERAL_COLOR, (m) =>
      isLiteralColorAllowed(m.input ?? "") ? null : "Màu viết cứng (hex/rgb/hsl/oklch): dùng token màu"
    ),
  ];
}

// ── DS-DARK-VARIANT ────────────────────────────────────────────────────────────

const DARK_ALLOWED = new Set(["dark:prose-invert"]);

export function checkDarkVariant(file: SourceFile): Finding[] {
  return perLine(file, "DS-DARK-VARIANT", /\bdark:[^\s"'`]+/g, (m) =>
    DARK_ALLOWED.has(m[0]) ? null : `Variant "${m[0]}": token đã có giá trị cho .dark`
  );
}

// ── DS-ARBITRARY-VALUE ─────────────────────────────────────────────────────────

/** Only numeric arbitrary values: `text-[var(--status-learning)]` is a colour token, not a size */
const ARBITRARY =
  /\b(?:text|p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|z)-\[-?[\d.]+(?:px|rem|em)?\]/g;

export function checkArbitraryValue(file: SourceFile): Finding[] {
  return perLine(file, "DS-ARBITRARY-VALUE", ARBITRARY, (m) => `Giá trị tuỳ ý "${m[0]}": dùng thang Tailwind hoặc token trong @theme`);
}

// ── DS-RAW-BUTTON ──────────────────────────────────────────────────────────────

export function checkRawButton(file: SourceFile): Finding[] {
  return perLine(file, "DS-RAW-BUTTON", /<button\b/g, () => "<button> thô: dùng <Button> từ @/components/ui/button");
}

// ── DS-ICON-LIB ────────────────────────────────────────────────────────────────

const OTHER_ICON_LIBS = /from\s+["']((?:react-icons|@heroicons\/[^"']+|@tabler\/icons-react|@radix-ui\/react-icons|@phosphor-icons\/[^"']+)[^"']*)["']/g;

export function checkIconLib(file: SourceFile): Finding[] {
  return perLine(file, "DS-ICON-LIB", OTHER_ICON_LIBS, (m) => `Icon từ ${m[1]}: chỉ dùng lucide-react`);
}

// ── DS-STATIC-INLINE-STYLE ─────────────────────────────────────────────────────

function matchingBrace(content: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === quote && content[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

function topLevelParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const LITERAL_VALUE = /^(?:"[^"]*"|'[^']*'|`[^`$]*`|-?\d+(?:\.\d+)?)$/;

/** style={{ … }} whose values are all literals: that belongs in Tailwind classes */
export function checkStaticInlineStyle(file: SourceFile): Finding[] {
  if (!isDesignSystemFile(file)) return [];
  const findings: Finding[] = [];
  for (const match of file.content.matchAll(/style=\{\{/g)) {
    const open = (match.index ?? 0) + "style={".length;
    const close = matchingBrace(file.content, open);
    if (close < 0) continue;
    const parts = topLevelParts(file.content.slice(open + 1, close));
    const isStatic =
      parts.length > 0 &&
      parts.every((part) => {
        const colon = part.indexOf(":");
        return !part.startsWith("...") && colon > 0 && LITERAL_VALUE.test(part.slice(colon + 1).trim());
      });
    if (!isStatic) continue;
    findings.push({
      checkId: "DS-STATIC-INLINE-STYLE",
      severity: "nit",
      file: file.path,
      line: lineOf(file.content, match.index ?? 0),
      message: "style={{…}} chỉ có giá trị cố định: chuyển sang class Tailwind",
    });
  }
  return findings;
}
