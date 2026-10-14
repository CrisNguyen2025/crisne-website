"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRoadmapAssistantChat = useRoadmapAssistantChat;
const react_1 = require("react");
const client_1 = require("../client");
function useRoadmapAssistantChat(options = {}) {
    const { baseUrl = 'http://localhost:8000', threadId = 'roadmap-web-session', initialMessages, onToolExecuted, getContext, onWebMcpMessage, } = options;
    // React 19 compliance: Synchronize callbacks and getters in useEffect
    const onWebMcpRef = (0, react_1.useRef)(onWebMcpMessage);
    (0, react_1.useEffect)(() => {
        onWebMcpRef.current = onWebMcpMessage;
    }, [onWebMcpMessage]);
    const getContextRef = (0, react_1.useRef)(getContext);
    (0, react_1.useEffect)(() => {
        getContextRef.current = getContext;
    }, [getContext]);
    const onToolExecutedRef = (0, react_1.useRef)(onToolExecuted);
    (0, react_1.useEffect)(() => {
        onToolExecutedRef.current = onToolExecuted;
    }, [onToolExecuted]);
    const [messages, setMessages] = (0, react_1.useState)(() => {
        if (initialMessages && initialMessages.length > 0) {
            return initialMessages;
        }
        return [
            {
                id: 'welcome-msg',
                role: 'assistant',
                content: 'Xin chào! Tôi là **Roadmap AI Assistant** ⚡\nTrợ lý thông minh hỗ trợ quản trị lộ trình học tập và tra cứu kiến thức chuyên sâu.\n\n**Thao tác nhanh**\n```text\ntạo 2 layer mock 1 và 2 trong be topic\n```\n**Tra cứu tri thức**\n```text\nWebsite có bài nào về Docker hay Database không?\n```\n**Lập kế hoạch**\n```text\n/plan lộ trình Next.js Fullstack\n```\n_Hỗ trợ tương tác tự nhiên cả Tiếng Việt & English._',
                timestamp: new Date(),
            },
        ];
    });
    const [input, setInput] = (0, react_1.useState)('');
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [isStreaming, setIsStreaming] = (0, react_1.useState)(false);
    const [activeTool, setActiveTool] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    // Pure useMemo instantiates client reactively without render-phase ref mutations/reads
    const client = (0, react_1.useMemo)(() => new client_1.RoadmapChatClient({ baseUrl }), [baseUrl]);
    const abortControllerRef = (0, react_1.useRef)(null);
    // Clean up in-flight abort controller on unmount
    (0, react_1.useEffect)(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);
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
        setError(null);
        setActiveTool(null);
        // "/webmcp <request>" runs one WebMCP tool in the browser instead of the server chat
        if (/^\/webmcp\b/i.test(content) && onWebMcpRef.current) {
            const request = content.replace(/^\/webmcp\b\s*/i, '');
            setIsLoading(true);
            try {
                const reply = await onWebMcpRef.current(request);
                setMessages((prev) => prev.map((msg) => (msg.id === botMsgId ? { ...msg, content: reply } : msg)));
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định';
                setMessages((prev) => prev.map((msg) => msg.id === botMsgId ? { ...msg, content: `⚠️ **Lỗi WebMCP**: ${errMsg}` } : msg));
            }
            finally {
                setIsLoading(false);
            }
            return;
        }
        setIsLoading(true);
        setIsStreaming(true);
        try {
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
                                { name, args: {}, result: 'Đang thực thi...', startedAt: Date.now() },
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
                        // Close the oldest still-running call with this name.
                        const idx = currentCalls.findIndex((tc) => tc.name === name && tc.endedAt === undefined);
                        const updated = currentCalls.map((tc, i) => i === idx ? { ...tc, result, endedAt: Date.now() } : tc);
                        return { ...msg, toolCalls: updated };
                    }));
                    onToolExecutedRef.current?.(name, result);
                },
                onToken: (delta) => {
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? {
                            ...msg,
                            content: msg.content + delta,
                            firstTokenAt: msg.firstTokenAt ?? Date.now(),
                        }
                        : msg));
                },
                onDone: (finalResp) => {
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? {
                            ...msg,
                            content: finalResp.message || msg.content,
                            // Keep streamed calls: they carry the step timings.
                            toolCalls: msg.toolCalls?.length
                                ? msg.toolCalls
                                : finalResp.tool_calls,
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
            }, threadId, getContextRef.current?.());
        }
        catch (err) {
            const errMsg = err instanceof Error
                ? err.message
                : 'Không thể kết nối tới server Assistant (:8000).';
            setError(errMsg);
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [input, isLoading, threadId, client, baseUrl]);
    const clearMessages = (0, react_1.useCallback)(() => {
        setMessages([]);
        setError(null);
    }, []);
    return {
        messages,
        setMessages,
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
