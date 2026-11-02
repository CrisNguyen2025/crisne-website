import type { PageContext } from '../types';
import type { ChatMessage } from './types';

export const WELCOME_MESSAGE_ID = 'welcome-msg';

export interface WelcomeSuggestion {
  label: string;
  prompt: string;
}

/**
 * One example per thing the assistant does. Each prompt is sent verbatim when tapped,
 * so it must read as a complete request the server can act on.
 */
export function getWelcomeSuggestions(context?: PageContext, _canWrite = false): WelcomeSuggestion[] {
  // Read-only and the same for everyone: no chip writes or names a subject. The widget does not know which
  // topics and lessons exist; the help reply does (the server builds its examples from the live roadmap),
  // so it is one tap away, writing commands included for the owner.
  const topic = context?.roadmapSlug;
  return [
    {
      label: 'Xem lộ trình',
      prompt: topic ? `Topic ${topic} có những layer nào?` : 'Có những lộ trình nào trên website?',
    },
    { label: 'Tra cứu & gợi ý', prompt: 'Bạn làm được gì?' },
  ];
}

export function buildWelcomeMessage(context?: PageContext, canWrite = false): ChatMessage {
  return {
    id: WELCOME_MESSAGE_ID,
    role: 'assistant',
    content:
      'Xin chào! Tôi là **Abot** ⚡\n' +
      'Trợ lý hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức.\n\n' +
      '_Bạn có thể hỏi bằng tiếng Việt hoặc tiếng Anh, hoặc chọn một gợi ý bên dưới._',
    suggestions: getWelcomeSuggestions(context, canWrite),
    timestamp: new Date(),
  };
}
