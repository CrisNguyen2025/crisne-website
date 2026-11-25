import { trimChar } from '@/lib/utils';

const CALLOUT_TYPES = new Set(['success', 'info', 'warning', 'error']);

function extractLeadingCalloutType(inner: string): string | null {
  let cursor = 0;
  while (cursor < inner.length) {
    while (cursor < inner.length && /\s/.test(inner[cursor])) cursor++;
    if (inner[cursor] === '<') {
      const close = inner.indexOf('>', cursor + 1);
      if (close === -1) break;
      cursor = close + 1;
      continue;
    }
    break;
  }
  const rest = inner.slice(cursor);
  if (!rest.startsWith('[!')) return null;
  const endBracket = rest.indexOf(']', 2);
  if (endBracket === -1) return null;
  const candidate = rest.slice(2, endBracket).toLowerCase();
  return CALLOUT_TYPES.has(candidate) ? candidate : null;
}

function stripCalloutMarkers(inner: string): string {
  return inner.replace(/\[!(?:success|info|warning|error)\][ \t]*/gi, '');
}

/**
 * Utility to convert raw content (HTML or plain text) into formatted HTML 
 * with support for Notion-style Callout boxes ([!info], [!success], [!warning], [!error])
 */
export function contentToHtml(content: string): string {
  if (!content) return '';

  let html: string;
  // If already contains HTML tags, use as-is
  if (/<[a-z][\s\S]*>/i.test(content)) {
    html = content;
  } else {
    // Split by double newlines into paragraphs, single newlines into <br>
    html = content
      .split(/\n\n+/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  // Collapse nested <pre><pre>...</pre></pre> from legacy Lexical round-trips
  while (/<pre\b([^>]*)>\s*<pre\b[^>]*>([\s\S]*?)<\/pre>\s*<\/pre>/i.test(html)) {
    html = html.replace(/<pre\b([^>]*)>\s*<pre\b[^>]*>([\s\S]*?)<\/pre>\s*<\/pre>/gi, '<pre$1>$2</pre>');
  }

  // Transform blockquotes with data-callout-type attribute or [!type] markers
  html = html.replace(
    /<blockquote([^>]*)>([\s\S]*?)<\/blockquote>/gi,
    (_match, attrs: string, inner: string) => {
      const typeAttrMatch = /data-callout-type="(success|info|warning|error)"/i.exec(attrs);
      const type = typeAttrMatch ? typeAttrMatch[1].toLowerCase() : extractLeadingCalloutType(inner);

      if (type) {
        // Clean all duplicate or lingering markers like [!error] while preserving opening tags
        const cleanInner = stripCalloutMarkers(inner);
        return `<div class="callout callout-${type}"><div class="callout-content">${cleanInner}</div></div>`;
      }
      return `<blockquote${attrs}>${inner}</blockquote>`;
    }
  );

  // Also handle plain text with [!type] markers (not in blockquote)
  html = html.replace(
    /(<p[^<>]*>)([\s\S]*?)(<\/p>)/gi,
    (fullMatch, _openTag: string, inner: string) => {
      const markerType = /^\s*\[!(success|info|warning|error)\]\s*/i.exec(inner);
      if (!markerType) return fullMatch;
      const cleanInner = stripCalloutMarkers(inner.slice(markerType[0].length));
      return `<div class="callout callout-${markerType[1].toLowerCase()}"><div class="callout-content">${cleanInner}</div></div>`;
    }
  );

  // Ensure all links open in a new tab with target="_blank" and rel="noopener noreferrer"
  html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    let newAttrs = attrs;
    if (!/target\s*=/i.test(newAttrs)) {
      newAttrs += ' target="_blank"';
    } else {
      newAttrs = newAttrs.replace(/target\s*=\s*["'][^"']*["']/i, 'target="_blank"');
    }
    if (!/rel\s*=/i.test(newAttrs)) {
      newAttrs += ' rel="noopener noreferrer"';
    } else {
      newAttrs = newAttrs.replace(/rel\s*=\s*["'][^"']*["']/i, 'rel="noopener noreferrer"');
    }
    return `<a${newAttrs}>`;
  });

  // Ensure all images have exact constrained sizing and square borders matching edit mode
  html = html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    // Extract existing width/height from style or attributes if present
    const widthMatch = /width:\s*(\d+)px/i.exec(attrs) || /\bwidth=["']?(\d+)["']?/i.exec(attrs);
    const heightMatch = /height:\s*(\d+)px/i.exec(attrs) || /\bheight=["']?(\d+)["']?/i.exec(attrs);

    const strippedAttrs = attrs
      .replace(/(?:^|\s)style\s*=\s*["'][^"']*["']/gi, '')
      .replace(/(?:^|\s)width\s*=\s*["']?[^"'\s>]*["']?/gi, '')
      .replace(/(?:^|\s)height\s*=\s*["']?[^"'\s>]*["']?/gi, '')
      .trim();
    const cleanAttrs = strippedAttrs ? ` ${strippedAttrs}` : '';

    let style = 'max-width:100%;object-fit:contain;border-radius:0;display:block;margin:0.5rem 0;cursor:zoom-in;';
    if (widthMatch && Number(widthMatch[1]) > 0) {
      style += `width:${widthMatch[1]}px;`;
    } else {
      style += 'max-width:min(100%, 420px);width:auto;';
    }
    if (heightMatch && Number(heightMatch[1]) > 0) {
      style += `height:${heightMatch[1]}px;`;
    } else {
      style += 'max-height:320px;height:auto;';
    }

    return `<img${cleanAttrs} style="${style}">`;
  });

  // Sanitize dangerous HTML elements and event handlers
  html = sanitizeDangerousHtml(html);

  return html;
}

/**
 * Strips malicious tags, event handlers, and javascript protocols to prevent XSS
 */
export function sanitizeDangerousHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  let safe = rawHtml;
  // Remove script, iframe, object, embed, form tags and contents
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  safe = safe.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  safe = safe.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  safe = safe.replace(/<embed\b[^>]*>/gi, '');
  safe = safe.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');

  // Remove dangerous inline event handlers (e.g. onclick=, onerror=, onload=)
  safe = safe.replace(/(?<=\s)on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Remove javascript: or unsafe data: URIs in href or src (allow safe data:image/)
  safe = safe.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
  safe = safe.replace(/src\s*=\s*["']\s*javascript:[^"']*["']/gi, 'src=""');

  return safe;
}

export interface ContentHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const WORDS_PER_MINUTE = 200;

function plainText(html: string): string {
  return html
    .replace(/<[^<>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function plainTextExcerpt(content?: string | null, maxLength = 160): string {
  if (!content) return '';
  const text = plainText(content);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export interface ContentStats {
  words: number;
  characters: number;
  readingMinutes: number;
}

export function contentStats(content?: string | null): ContentStats {
  if (!content) return { words: 0, characters: 0, readingMinutes: 0 };
  const text = plainText(content);
  if (!text) return { words: 0, characters: 0, readingMinutes: 0 };
  const words = text.split(' ').filter(Boolean).length;
  const characters = text.length;
  const mins = words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return { words, characters, readingMinutes: mins };
}

/** Minutes to read a lesson's content, at least 1; 0 when there is no content. */
export function readingMinutes(content?: string | null): number {
  return contentStats(content).readingMinutes;
}

/** Anchor slug of a heading's text (ADR-0014): no Vietnamese diacritics, lowercase, kebab-case. */
function headingSlug(text: string): string {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-');
  return trimChar(normalized, '-');
}

/**
 * The h2/h3 headings of rendered content, each given an id so a table of contents can link to it.
 * The id is the slug of the heading's text, so it stays the same when other headings change;
 * a repeated slug gets `-2`, `-3`, ... Returns the html with those ids and the headings in order.
 */
export function withHeadingIds(html: string): { html: string; headings: ContentHeading[] } {
  const headings: ContentHeading[] = [];
  const usedIds = new Set<string>();
  const out = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, attrs: string, inner: string) => {
    const text = plainText(inner);
    if (!text) return _m;
    const base = headingSlug(text) || 'section';
    let id = base;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    usedIds.add(id);
    headings.push({ id, text, level: Number(lvl) as 2 | 3 });
    const cleanAttrs = attrs.replace(/\sid="[^"]*"/i, '');
    return `<h${lvl}${cleanAttrs} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, headings };
}

/**
 * Longest text of one lesson chunk; a longer section is cut at paragraph, then sentence, boundaries. Kept under
 * the 1,000 characters the Roadmap Assistant embeds per document, so the whole chunk counts in its vector.
 */
export const CHUNK_MAX_CHARS = 900;

export interface LessonChunk {
  /** Id of the h2/h3 the chunk sits under (ADR-0014); null for the text before the first heading. */
  anchor: string | null;
  heading: string | null;
  text: string;
}

// Closing a block (or a line break) ends a paragraph of plain text
const BLOCK_END = /<\/(?:p|li|pre|div|blockquote|h[1-6]|tr|ul|ol|table)>|<br\s*\/?>/gi;
const HEADING_WITH_ID = /<h([23])\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi;

function paragraphsOf(html: string): string[] {
  return html
    .split(BLOCK_END)
    .map(plainText)
    .filter(Boolean);
}

/** Splits text longer than `max` at sentence ends, and a sentence still longer than `max` at `max`. */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    for (let start = 0; start < sentence.length; start += max) {
      const piece = sentence.slice(start, start + max);
      if (current && current.length + 1 + piece.length > max) {
        parts.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Packs paragraphs into texts of at most `max` characters, keeping paragraphs whole when they fit. */
function packParagraphs(paragraphs: string[], max: number): string[] {
  const texts: string[] = [];
  let current = '';
  for (const paragraph of paragraphs.flatMap((p) => splitLong(p, max))) {
    if (current && current.length + 1 + paragraph.length > max) {
      texts.push(current);
      current = paragraph;
    } else {
      current = current ? `${current} ${paragraph}` : paragraph;
    }
  }
  if (current) texts.push(current);
  return texts;
}

/**
 * A lesson's content as plain-text chunks, one per h2/h3 section, for the Roadmap Assistant's index.
 * Anchors come from the same pipeline as the lesson page (contentToHtml → withHeadingIds), so a link
 * `/[topicSlug]/[lessonSlug]#[anchor]` lands on the section the chunk came from. Provenance markers are
 * empty spans and drop out with the other tags (ADR-0017).
 */
export function lessonChunks(content: string | null | undefined, max = CHUNK_MAX_CHARS): LessonChunk[] {
  if (!content) return [];
  const { html } = withHeadingIds(contentToHtml(content));

  const sections: { anchor: string | null; heading: string | null; html: string }[] = [];
  let anchor: string | null = null;
  let heading: string | null = null;
  let last = 0;
  for (const match of html.matchAll(HEADING_WITH_ID)) {
    sections.push({ anchor, heading, html: html.slice(last, match.index) });
    anchor = match[2];
    heading = plainText(match[3]);
    last = (match.index ?? 0) + match[0].length;
  }
  sections.push({ anchor, heading, html: html.slice(last) });

  return sections.flatMap((section) =>
    packParagraphs(paragraphsOf(section.html), max).map((text) => ({
      anchor: section.anchor,
      heading: section.heading,
      text,
    }))
  );
}
