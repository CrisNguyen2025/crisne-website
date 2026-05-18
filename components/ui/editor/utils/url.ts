const SUPPORTED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'sms:', 'tel:']);

export function sanitizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
      return 'about:blank';
    }
  } catch {
    return url;
  }
  return url;
}

export function validateUrl(url: string): boolean {
  if (url === 'https://') return true;

  try {
    const parsed = new URL(url);
    return SUPPORTED_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}
