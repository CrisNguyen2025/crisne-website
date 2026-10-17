import { StreamTimeoutError } from '../client';

export interface FriendlyError {
  /** Shown to the reader in Vietnamese. Never contains URLs, ports or stack details. */
  text: string;
  /** Whether sending the same question again can plausibly succeed. */
  retryable: boolean;
}

/**
 * Turn a transport or server error into a sentence a reader can act on.
 * The raw message is for the developer console only.
 */
export function friendlyError(err: unknown): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (typeof console !== 'undefined') console.error('[Abot]', raw);

  if (err instanceof StreamTimeoutError) {
    return { text: 'Abot trả lời quá lâu. Bạn thử lại nhé.', retryable: true };
  }
  if (/\(429\)/.test(raw)) {
    return { text: 'Bạn gửi hơi nhanh, đợi một chút rồi thử lại nhé.', retryable: true };
  }
  if (/\(413\)|\(422\)/.test(raw)) {
    return { text: 'Câu hỏi quá dài. Bạn rút gọn giúp mình nhé.', retryable: false };
  }
  if (err instanceof TypeError || /failed to fetch|network|connect|timeout/i.test(raw)) {
    return { text: 'Abot đang gặp sự cố kết nối. Bạn thử lại sau ít phút nhé.', retryable: true };
  }
  return { text: 'Có lỗi xảy ra khi trả lời. Bạn thử lại nhé.', retryable: true };
}
