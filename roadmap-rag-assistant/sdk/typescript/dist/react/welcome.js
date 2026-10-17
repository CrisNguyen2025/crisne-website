"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WELCOME_MESSAGE_ID = void 0;
exports.getWelcomeSuggestions = getWelcomeSuggestions;
exports.buildWelcomeMessage = buildWelcomeMessage;
exports.WELCOME_MESSAGE_ID = 'welcome-msg';
/**
 * One example per thing the assistant does. Each prompt is sent verbatim when tapped,
 * so it must read as a complete request the server can act on.
 */
function getWelcomeSuggestions(context, canWrite = false) {
    // Readers (no write access) get only read-only examples: a write example would only
    // bounce back with "owner only". Writing examples are offered to the owner alone.
    const topic = context?.roadmapSlug;
    const quickAction = canWrite
        ? {
            label: 'Thao tác nhanh',
            prompt: topic
                ? `Tạo 2 layer Mock 1 và Mock 2 trong topic ${topic}`
                : 'Tạo 2 layer Mock 1 và Mock 2',
        }
        : {
            label: 'Xem lộ trình',
            prompt: topic ? `Topic ${topic} có những layer nào?` : 'Có những lộ trình nào trên website?',
        };
    return [
        quickAction,
        { label: 'Tra cứu tri thức', prompt: 'Website có bài nào về Docker hoặc Database không?' },
        { label: 'Lập kế hoạch', prompt: '/plan Lộ trình Next.js Fullstack' },
    ];
}
function buildWelcomeMessage(context, canWrite = false) {
    const suggestions = getWelcomeSuggestions(context, canWrite)
        .map(({ label, prompt }) => `**${label}**\n\`\`\`text\n${prompt}\n\`\`\``)
        .join('\n');
    return {
        id: exports.WELCOME_MESSAGE_ID,
        role: 'assistant',
        content: 'Xin chào! Tôi là **Abot** ⚡\n' +
            'Trợ lý hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức.\n\n' +
            `${suggestions}\n` +
            '_Bạn có thể hỏi bằng tiếng Việt hoặc tiếng Anh._',
        timestamp: new Date(),
    };
}
