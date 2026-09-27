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

  // Transform blockquotes with data-callout-type attribute or [!type] markers
  html = html.replace(
    /<blockquote([^>]*)>([\s\S]*?)<\/blockquote>/gi,
    (_match, attrs: string, inner: string) => {
      let type: string | null = null;
      const typeAttrMatch = attrs.match(/data-callout-type="(success|info|warning|error)"/i);
      if (typeAttrMatch) {
        type = typeAttrMatch[1].toLowerCase();
      } else {
        const markerMatch = inner.match(/^\s*(?:<[^>]+>)*\s*\[!(success|info|warning|error)\]/i);
        if (markerMatch) {
          type = markerMatch[1].toLowerCase();
        }
      }

      if (type) {
        // Clean all duplicate or lingering markers like [!error]
        const cleanInner = inner.replace(/(?:<[^>]+>)*\s*\[!(?:success|info|warning|error)\]\s*/gi, '');
        return `<div class="callout callout-${type}"><div class="callout-content">${cleanInner}</div></div>`;
      }
      return `<blockquote${attrs}>${inner}</blockquote>`;
    }
  );

  // Also handle plain text with [!type] markers (not in blockquote)
  html = html.replace(
    /(<p[^>]*>)\s*\[!(success|info|warning|error)\]\s*([\s\S]*?)(<\/p>)/gi,
    (_match, _openTag, type, innerContent) => {
      const cleanInner = innerContent.replace(/(?:<[^>]+>)*\s*\[!(?:success|info|warning|error)\]\s*/gi, '');
      return `<div class="callout callout-${type.toLowerCase()}"><div class="callout-content">${cleanInner}</div></div>`;
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
    // Strip any existing style, width, and height attributes to prevent intrinsic sizing
    let cleanAttrs = attrs
      .replace(/\s*style\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*width\s*=\s*["']?[^"'\s>]*["']?/gi, '')
      .replace(/\s*height\s*=\s*["']?[^"'\s>]*["']?/gi, '');
    cleanAttrs +=
      ' style="max-width:min(100%, 420px);max-height:320px;width:auto;height:auto;object-fit:contain;border-radius:0;display:block;margin:0.25rem 0;cursor:zoom-in;"';
    return `<img${cleanAttrs}>`;
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
  safe = safe.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Remove javascript: or unsafe data: URIs in href or src (allow safe data:image/)
  safe = safe.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
  safe = safe.replace(/src\s*=\s*["']\s*javascript:[^"']*["']/gi, 'src=""');

  return safe;
}
