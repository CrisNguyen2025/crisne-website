"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRoadmapAssistantChat = useRoadmapAssistantChat;
const react_1 = require("react");
const client_1 = require("../client");
function useRoadmapAssistantChat(options = {}) {
    const { baseUrl = 'http://localhost:8000', threadId = 'roadmap-web-session', onToolExecuted, } = options;
    const [messages, setMessages] = (0, react_1.useState)([
        {
            id: 'welcome-msg',
            role: 'assistant',
            content: 'Xin chào! Tôi là **Roadmap AI Assistant** ⚡\nTrợ lý thông minh hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức chuyên sâu.\n\n💡 **Bạn có thể yêu cầu tôi:**\n• **Thao tác nhanh**: `tạo ABC topic`, `tạo 2 layer mock 1 và 2 trong be topic`\n• **Tra cứu tri thức**: `Website có bài nào về Docker hay Database không?`\n• **Lập kế hoạch**: `/plan lộ trình Next.js Fullstack`\n\n_Hỗ trợ tương tác tự nhiên cả Tiếng Việt & English._',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = (0, react_1.useState)('');
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [isStreaming, setIsStreaming] = (0, react_1.useState)(false);
    const [activeTool, setActiveTool] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const clientRef = (0, react_1.useRef)(null);
    if (!clientRef.current) {
        clientRef.current = new client_1.RoadmapChatClient({ baseUrl });
    }
    const abortControllerRef = (0, react_1.useRef)(null);
    const stopStreaming = (0, react_1.useCallback)(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsStreaming(false);
        setIsLoading(false);
        setActiveTool(null);
    }, []);
    const sendMessage = (0, react_1.useCallback)(async (textToSend) => {
        const content = (textToSend ?? input).trim();
        if (!content)
            return;
        // Abort any in-flight stream before starting new message
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        const userMsg = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            timestamp: new Date(),
        };
        const botMsgId = `bot-${Date.now()}`;
        const initialBotMsg = {
            id: botMsgId,
            role: 'assistant',
            content: '',
            toolCalls: [],
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg, initialBotMsg]);
        setInput('');
        setIsLoading(true);
        setIsStreaming(true);
        setError(null);
        setActiveTool(null);
        try {
            const client = clientRef.current;
            abortControllerRef.current = client.streamChat(content, {
                onToolStart: (name) => {
                    setActiveTool(name);
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        const currentCalls = msg.toolCalls || [];
                        return {
                            ...msg,
                            toolCalls: [
                                ...currentCalls,
                                { name, args: {}, result: 'Đang thực thi...' },
                            ],
                        };
                    }));
                },
                onToolEnd: (name, result) => {
                    setActiveTool(null);
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        const currentCalls = msg.toolCalls || [];
                        const updated = currentCalls.map((tc) => tc.name === name ? { ...tc, result } : tc);
                        return { ...msg, toolCalls: updated };
                    }));
                    onToolExecuted?.(name, result);
                },
                onToken: (delta) => {
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? { ...msg, content: msg.content + delta }
                        : msg));
                },
                onDone: (finalResp) => {
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? {
                            ...msg,
                            content: finalResp.message || msg.content,
                            toolCalls: finalResp.tool_calls || msg.toolCalls,
                        }
                        : msg));
                    setIsLoading(false);
                    setIsStreaming(false);
                    setActiveTool(null);
                },
                onError: (err) => {
                    const errMsg = err.message || 'Lỗi kết nối tới Assistant service';
                    setError(errMsg);
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? {
                            ...msg,
                            content: msg.content ||
                                `⚠️ **Lỗi kết nối**: ${errMsg}\n\n_Hãy đảm bảo server FastAPI đang chạy tại ${baseUrl}._`,
                        }
                        : msg));
                    setIsLoading(false);
                    setIsStreaming(false);
                    setActiveTool(null);
                },
            }, threadId);
        }
        catch (err) {
            const errMsg = err instanceof Error
                ? err.message
                : 'Không thể kết nối tới server Assistant (:8000).';
            setError(errMsg);
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [input, isLoading, threadId, onToolExecuted, baseUrl]);
    const clearMessages = (0, react_1.useCallback)(() => {
        setMessages([]);
        setError(null);
    }, []);
    return {
        messages,
        input,
        setInput,
        isLoading,
        isStreaming,
        activeTool,
        error,
        sendMessage,
        stopStreaming,
        clearMessages,
    };
}
