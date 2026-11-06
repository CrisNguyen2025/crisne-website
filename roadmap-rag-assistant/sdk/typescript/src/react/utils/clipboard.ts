/**
 * Copies text and resolves true when it worked.
 *
 * `navigator.clipboard` exists only in a secure context (HTTPS or localhost), so on a phone
 * opening the dev server by LAN IP (http://192.168.x.x) it is undefined and copy silently did
 * nothing. The fallback copies from a hidden textarea with `execCommand("copy")`, which still
 * works there as long as it runs inside the tap's handler.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or document not focused: try the fallback below
    }
  }
  return copyWithTextarea(text);
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  // Off-screen and read-only: no layout shift, and iOS does not open the keyboard
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  // The composer may hold focus; give it back afterwards so the keyboard state does not change
  const previousFocus = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  previousFocus?.focus?.({ preventScroll: true });
  return copied;
}
