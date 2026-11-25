const SUPPORTED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'sms:', 'tel:']);

export function validateUrl(url: string): boolean {
  if (url === 'https://') return true;

  try {
    const parsed = new URL(url);
    return SUPPORTED_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}
