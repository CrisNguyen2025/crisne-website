"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderInlineStyles = renderInlineStyles;
exports.formatMarkdownText = formatMarkdownText;
exports.formatTime = formatTime;
exports.formatToolDisplayName = formatToolDisplayName;
const react_1 = __importDefault(require("react"));
const ChatMarkdown_1 = require("../ChatMarkdown");
/** Inline Markdown (**bold**, *italic*, `code`, [links](url)) as React nodes. */
function renderInlineStyles(text) {
    return (0, ChatMarkdown_1.renderInline)(text);
}
/**
 * Block Markdown for a chat message. Kept for SDK consumers; new code can use
 * `<ChatMarkdown>` directly (it also supports a streaming caret).
 */
function formatMarkdownText(content) {
    return react_1.default.createElement(ChatMarkdown_1.ChatMarkdown, { content });
}
function formatTime(date) {
    if (!date)
        return '';
    const d = typeof date === 'string' || typeof date === 'number'
        ? new Date(date)
        : date;
    if (isNaN(d.getTime()))
        return '';
    return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}
function formatToolDisplayName(name) {
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
