"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_STORED_MESSAGES = void 0;
exports.conversationKey = conversationKey;
exports.loadConversation = loadConversation;
exports.saveConversation = saveConversation;
exports.clearConversation = clearConversation;
// The conversation lives in sessionStorage: it survives a reload or a page change in the same
// tab, and is gone when the tab closes. Storage can be blocked (private mode), so every access
// is guarded and the widget works without it.
/** Keep the stored history short: older turns are not needed to answer the next question. */
exports.MAX_STORED_MESSAGES = 50;
function conversationKey(baseUrl) {
    return `abot:conversation:${baseUrl}`;
}
function isStoredMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const m = value;
    return (typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        typeof m.timestamp === 'string');
}
function loadConversation(key) {
    try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw)
            return null;
        const data = JSON.parse(raw);
        if (typeof data.conversationId !== 'string' || !Array.isArray(data.messages))
            return null;
        const messages = data.messages
            .filter(isStoredMessage)
            .map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
        return messages.length > 0 ? { conversationId: data.conversationId, messages } : null;
    }
    catch {
        return null;
    }
}
function saveConversation(key, conversation) {
    try {
        const messages = conversation.messages.slice(-exports.MAX_STORED_MESSAGES);
        window.sessionStorage.setItem(key, JSON.stringify({ conversationId: conversation.conversationId, messages }));
    }
    catch {
        // Quota exceeded or storage blocked: the conversation stays in memory only
    }
}
function clearConversation(key) {
    try {
        window.sessionStorage.removeItem(key);
    }
    catch {
        // Storage blocked: nothing was stored
    }
}
