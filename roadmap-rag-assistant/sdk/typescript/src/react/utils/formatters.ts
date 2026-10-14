import React from 'react';

export function renderInlineStyles(text: string, isUser = false): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return React.createElement(
        'strong',
        {
          key: i,
          className: `font-semibold ${isUser ? 'text-white' : 'text-slate-900'}`,
        },
        part.slice(2, -2)
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return React.createElement(
        'code',
        {
          key: i,
          className: `rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
            isUser
              ? 'bg-white/20 text-white border border-white/25'
              : 'bg-slate-100 text-[#1e88e5] border border-slate-200/80'
          }`,
        },
        part.slice(1, -1)
      );
    }
    return part;
  });
}

export function formatMarkdownText(content: string, isUser = false): React.ReactNode {
  const lines = content.split('\n');

  return lines.map((line, lineIdx) => {
    if (!line.trim()) {
      return React.createElement('div', { key: lineIdx, className: 'h-1.5' });
    }

    // Bullet point
    if (
      line.startsWith('- ') ||
      line.startsWith('• ') ||
      line.startsWith('* ')
    ) {
      const text = line.replace(/^[-•*]\s+/, '');
      return React.createElement(
        'div',
        { key: lineIdx, className: 'flex items-start gap-2 my-0.5 pl-0.5' },
        React.createElement(
          'span',
          {
            className: `font-bold leading-relaxed shrink-0 ${isUser ? 'text-white/80' : 'text-[#2AABEE]'}`,
          },
          '•'
        ),
        React.createElement('span', null, renderInlineStyles(text, isUser))
      );
    }

    // Numbered list
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      return React.createElement(
        'div',
        { key: lineIdx, className: 'flex items-start gap-1.5 my-0.5 pl-0.5' },
        React.createElement(
          'span',
          {
            className: `font-semibold shrink-0 ${isUser ? 'text-white/90' : 'text-[#2AABEE]'}`,
          },
          `${numbered[1]}.`
        ),
        React.createElement('span', null, renderInlineStyles(numbered[2], isUser))
      );
    }

    // Headers
    if (line.startsWith('### ')) {
      return React.createElement(
        'h4',
        {
          key: lineIdx,
          className: `text-xs font-bold mt-2 mb-1 ${isUser ? 'text-white' : 'text-slate-900'}`,
        },
        renderInlineStyles(line.slice(4), isUser)
      );
    }
    if (line.startsWith('## ')) {
      return React.createElement(
        'h3',
        {
          key: lineIdx,
          className: `text-sm font-bold mt-2.5 mb-1 pb-0.5 border-b ${isUser ? 'text-white border-white/20' : 'text-slate-900 border-slate-200'}`,
        },
        renderInlineStyles(line.slice(3), isUser)
      );
    }

    return React.createElement(
      'p',
      {
        key: lineIdx,
        className: `my-0.5 leading-relaxed ${isUser ? 'text-white' : 'text-slate-800'}`,
      },
      renderInlineStyles(line, isUser)
    );
  });
}

export function formatTime(date?: Date | string | number): string {
  if (!date) return '';
  const d =
    typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatToolDisplayName(name: string): string {
  switch (name) {
    case 'search_live_knowledge':
      return '🔍 Tra cứu cơ sở tri thức Live';
    case 'create_topic':
    case 'create_topics_batch':
      return '🗺️ Tạo Topic Roadmap';
    case 'create_layer':
    case 'create_layers_batch':
      return '📑 Tạo Layer mảng kiến thức';
    case 'create_group':
      return '🏷️ Tạo Nhóm phân loại (Group)';
    case 'create_item':
    case 'create_items_batch':
      return '📖 Thêm Bài học (Item)';
    case 'delete_topic':
    case 'delete_layer':
    case 'delete_group':
    case 'delete_item':
      return '🗑️ Xóa thực thể Roadmap';
    case 'preview_roadmap_plan':
      return '📋 Phác thảo kế hoạch Roadmap (/plan)';
    case 'generate_roadmap_from_template':
      return '⚡ Sinh nhanh từ Blueprint (/goal)';
    case 'list_topics':
      return '📚 Liệt kê danh sách Topic';
    default:
      return name;
  }
}
