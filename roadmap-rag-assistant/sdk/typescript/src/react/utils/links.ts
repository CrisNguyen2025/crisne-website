/** A link the chat may render: web pages, in-app paths, anchors and mail. Anything else (e.g. `javascript:`) is refused. */
export function safeHref(url: string): { href: string; external: boolean } | null {
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  if (/^(\/|#|mailto:)/i.test(url)) return { href: url, external: false };
  return null;
}

/** True for same-origin app routes (`/topic/lesson`, `/?topic=x`), excluding protocol-relative `//host`. */
export function isInternalRouteHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export interface LinkClickLikeEvent {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

/** Plain primary-button click with no modifier keys (let Cmd/Ctrl/Shift/middle-click open tabs natively). */
export function isPlainLeftClick(event: LinkClickLikeEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
