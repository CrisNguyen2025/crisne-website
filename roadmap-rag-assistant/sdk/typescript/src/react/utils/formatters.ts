import React from 'react';
import type { AssistantStepEvent } from '../../types';
import type { StepItem } from '../ToolStepRow';
import { ChatMarkdown, renderInline } from '../ChatMarkdown';

/** Inline Markdown (**bold**, *italic*, `code`, [links](url)) as React nodes. */
export function renderInlineStyles(text: string): React.ReactNode {
  return renderInline(text);
}

/**
 * Block Markdown for a chat message. Kept for SDK consumers; new code can use
 * `<ChatMarkdown>` directly (it also supports a streaming caret).
 */
export function formatMarkdownText(content: string): React.ReactNode {
  return React.createElement(ChatMarkdown, { content });
}

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatTime(date?: Date | string | number): string {
  if (!date) return '';
  const d = dayjs(date);
  if (!d.isValid()) return '';
  return d.fromNow();
}

export function formatToolDisplayName(name: string): string {
  switch (name) {
    case 'search_live_knowledge':
      return 'Tra cứu cơ sở tri thức Live';
    case 'create_topic':
    case 'create_topics_batch':
      return 'Tạo Topic Roadmap';
    case 'create_layer':
    case 'create_layers_batch':
      return 'Tạo Layer mảng kiến thức';
    case 'create_group':
      return 'Tạo Nhóm phân loại (Group)';
    case 'create_item':
    case 'create_items_batch':
      return 'Thêm Bài học (Item)';
    case 'delete_topic':
    case 'delete_layer':
    case 'delete_group':
    case 'delete_item':
      return 'Xóa thực thể Roadmap';
    case 'preview_roadmap_plan':
      return 'Phác thảo kế hoạch Roadmap (/plan)';
    case 'generate_roadmap_from_template':
      return 'Sinh nhanh từ Blueprint (/goal)';
    case 'list_topics':
      return 'Liệt kê danh sách Topic';
    default:
      return name;
  }
}

const INTENT_LABELS: Record<string, string> = {
  knowledge_query: 'Tra cứu tri thức',
  roadmap_cud: 'Thao tác roadmap',
  plan_goal: 'Lập kế hoạch',
  chitchat: 'Trò chuyện',
  out_of_scope: 'Ngoài phạm vi',
};

/** Row title for a step; the server sends data only (contract: rag_service/steps.py). */
export function formatStepLabel(step: AssistantStepEvent): string {
  const running = step.status === 'running';
  switch (step.kind) {
    case 'routing':
      return running ? 'Đang phân loại câu hỏi…' : 'Phân loại câu hỏi';
    case 'retrieval':
      return running ? 'Đang tra cứu cơ sở tri thức…' : 'Tra cứu cơ sở tri thức';
    case 'tool':
      return formatToolDisplayName(step.name ?? 'tool');
    case 'generation':
      return running ? 'Đang soạn câu trả lời…' : 'Soạn câu trả lời';
    case 'guard':
      return 'Kiểm tra câu trả lời';
    default:
      return step.kind;
  }
}

/** Short result shown next to the title once the step has finished. */
export function formatStepSummary(step: AssistantStepEvent): string | undefined {
  if (step.status === 'error') return 'Lỗi';
  if (step.status === 'running') return undefined;
  switch (step.kind) {
    case 'routing':
      return step.intent ? INTENT_LABELS[step.intent] ?? step.intent : undefined;
    case 'retrieval':
      return step.count ? `${step.count} tài liệu` : 'Không có tài liệu phù hợp';
    case 'generation':
      if (step.mode === 'llm') return 'AI tổng hợp';
      if (step.mode === 'no_match') return 'Không có dữ liệu để trả lời';
      if (step.mode === 'template') return step.fallback_reason ? 'Câu trả lời mẫu · AI lỗi' : 'Câu trả lời mẫu';
      if (step.mode === 'context') return step.fallback_reason ? 'Dữ liệu gốc · AI lỗi' : 'Dữ liệu gốc';
      return undefined;
    case 'guard':
      return step.grounding === 'issues' ? 'Cần xem lại' : 'Ổn';
    default:
      return undefined;
  }
}

/** Expanded body of a step (retrieval items are rendered separately as links). */
export function formatStepDetail(step: AssistantStepEvent): string | undefined {
  if (step.kind === 'tool') return step.result || undefined;
  if (step.kind === 'guard' && step.grounding === 'issues') {
    const lines = [
      step.ungrounded_terms?.length && `Tên không có trong dữ liệu: ${step.ungrounded_terms.join(', ')}`,
      step.invalid_links?.length && `Đã gỡ link tới topic không tồn tại: ${step.invalid_links.join(', ')}`,
      step.future_promise?.length && `Hứa hẹn ngoài dữ liệu: ${step.future_promise.join('; ')}`,
    ];
    return lines.filter(Boolean).join('\n') || undefined;
  }
  return undefined;
}

/** Timeline rows for a message's step events. */
export function toStepItems(msgId: string, steps: AssistantStepEvent[], isLive: boolean): StepItem[] {
  return steps.map((st) => {
    // A step left running after the stream stopped (stop button, dropped connection)
    const interrupted = !isLive && st.status === 'running';
    return {
      id: `${msgId}-${st.id}`,
      label: formatStepLabel(interrupted ? { ...st, status: 'done' } : st),
      summary: interrupted ? 'Đã dừng' : formatStepSummary(st),
      tone:
        st.status === 'error'
          ? 'error'
          : interrupted || st.grounding === 'issues'
            ? 'warning'
            : 'default',
      startedAt: st.startedAt,
      endedAt: st.endedAt,
      running: isLive && st.status === 'running',
      detail: formatStepDetail(st),
      items: st.items,
    };
  });
}
