export type SlashSubPickerKind = 'quiz-topic' | 'status-filter';

export interface SlashCommandSpec {
  name: string;
  label: string;
  description: string;
  argsHint?: string;
  ownerOnly?: boolean;
  immediate?: boolean;
  insertText?: string;
  subPicker?: SlashSubPickerKind;
}

export interface StatusFilterOption {
  value: '' | 'target' | 'learning' | 'known';
  label: string;
  description: string;
  prompt: string;
}

export const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
  {
    value: '',
    label: 'Tổng quan tất cả',
    description: 'Thống kê Lesson Status toàn bộ Topic',
    prompt: '/status',
  },
  {
    value: 'learning',
    label: 'Đang học (learning)',
    description: 'Các bài học đang đánh dấu learning',
    prompt: '/status learning',
  },
  {
    value: 'target',
    label: 'Chưa học (target)',
    description: 'Các bài học đang ở trạng thái target',
    prompt: '/status target',
  },
  {
    value: 'known',
    label: 'Đã nắm (known)',
    description: 'Các bài học đã đạt trạng thái known',
    prompt: '/status known',
  },
];

const SLASH_COMMANDS: SlashCommandSpec[] = [
  {
    name: '/quiz',
    label: 'Kiểm tra theo Topic',
    description: 'Chọn Topic để lấy danh sách quiz phù hợp',
    argsHint: '<Topic>',
    ownerOnly: true,
    subPicker: 'quiz-topic',
  },
  {
    name: '/topics',
    label: 'Danh sách Topic',
    description: 'Xem các Topic hiện có và tiến độ học',
    immediate: true,
  },
  {
    name: '/status',
    label: 'Thống kê trạng thái',
    description: 'Xem số lượng Lesson theo từng Lesson Status',
    argsHint: 'target | learning | known',
    ownerOnly: true,
    subPicker: 'status-filter',
  },
  {
    name: '/review',
    label: 'Cần ôn tập hôm nay',
    description: 'Xem danh sách bài học đến hạn ôn tập SM-2',
    ownerOnly: true,
    immediate: true,
  },
  {
    name: '/next',
    label: 'Gợi ý bài tiếp theo',
    description: 'Đề xuất 1–2 bài học nên học tiếp',
    ownerOnly: true,
    immediate: true,
  },
  {
    name: '/draft',
    label: 'Nháp bài học mới',
    description: 'Soạn Preview tạo Topic hoặc Lesson mới',
    argsHint: '<Chủ đề>',
    ownerOnly: true,
    insertText: '/draft ',
  },
  {
    name: '/remember',
    label: 'Ghi nhớ vào bộ nhớ',
    description: 'Lưu ngữ cảnh học tập vào Owner Memory',
    argsHint: '<Nội dung>',
    ownerOnly: true,
    insertText: '/remember ',
  },
  {
    name: '/gmail',
    label: 'Hỏi với Gmail',
    description: 'Tìm trong Gmail đã kết nối cho câu hỏi này',
    argsHint: '<Câu hỏi>',
    ownerOnly: true,
    insertText: '/gmail ',
  },
  {
    name: '/webmcp',
    label: 'Công cụ trình duyệt',
    description: 'Chạy một công cụ WebMCP trên trang hiện tại',
    argsHint: '<Yêu cầu>',
    insertText: '/webmcp ',
  },
];

export type ParsedSlashInput =
  | { mode: 'none' }
  | { mode: 'commands'; query: string }
  | { mode: 'quiz-topic'; query: string }
  | { mode: 'status-filter'; query: string };

export function parseSlashInput(rawInput: string): ParsedSlashInput {
  if (!rawInput || rawInput.includes('\n')) return { mode: 'none' };
  const quizMatch = rawInput.match(/^\s*\/quiz\s+(.*)$/i);
  if (quizMatch) {
    return { mode: 'quiz-topic', query: (quizMatch[1] ?? '').trim() };
  }
  const statusMatch = rawInput.match(/^\s*\/status\s+(.*)$/i);
  if (statusMatch) {
    return { mode: 'status-filter', query: (statusMatch[1] ?? '').trim() };
  }
  const cmdMatch = rawInput.match(/^\s*\/([a-zA-Z0-9_-]*)$/);
  if (cmdMatch) {
    return { mode: 'commands', query: (cmdMatch[1] ?? '').toLowerCase() };
  }
  return { mode: 'none' };
}

export function getVisibleSlashCommands(options: {
  canWrite?: boolean;
  hasWebMcp?: boolean;
}): SlashCommandSpec[] {
  const { canWrite = false, hasWebMcp = false } = options;
  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.ownerOnly && !canWrite) return false;
    if (cmd.name === '/webmcp' && !hasWebMcp) return false;
    return true;
  });
}

export function filterSlashCommands(
  commands: SlashCommandSpec[],
  query: string
): SlashCommandSpec[] {
  const q = query.trim().toLowerCase().replace(/^\//, '');
  if (!q) return commands;
  return commands.filter(
    (cmd) =>
      cmd.name.slice(1).toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q)
  );
}
