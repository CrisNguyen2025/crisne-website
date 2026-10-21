/** A link the chat may render: web pages, in-app paths, anchors and mail. Anything else (e.g. `javascript:`) is refused. */
export function safeHref(url: string): { href: string; external: boolean } | null {
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  if (/^(\/|#|mailto:)/i.test(url)) return { href: url, external: false };
  return null;
}
