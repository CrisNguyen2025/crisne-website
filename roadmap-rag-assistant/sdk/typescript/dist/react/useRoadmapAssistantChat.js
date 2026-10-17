"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRoadmapAssistantChat = useRoadmapAssistantChat;
const react_1 = require("react");
const smoothStream_1 = require("./utils/smoothStream");
const errors_1 = require("./errors");
const storage_1 = require("./storage");
const welcome_1 = require("./welcome");
const client_1 = require("../client");
/**
 * Merge a step event into the step already shown under that id.
 * Times use the client clock for the start and the server's `duration_ms` for the length,
 * so the timeline matches what the server measured.
 */
function mergeStep(prev, next) {
    const now = Date.now();
    const merged = { ...prev, ...next };
    if (next.status === 'running') {
        merged.startedAt = prev?.startedAt ?? now;
        merged.endedAt = undefined;
    }
    else {
        merged.startedAt = prev?.startedAt;
        merged.endedAt =
            prev?.endedAt ??
                (merged.startedAt !== undefined && next.duration_ms !== undefined
                    ? merged.startedAt + next.duration_ms
                    : now);
    }
    return merged;
}
function upsertSteps(current, incoming) {
    const steps = [...current];
    for (const step of incoming) {
        const idx = steps.findIndex((s) => s.id === step.id);
        if (idx >= 0)
            steps[idx] = mergeStep(steps[idx], step);
        else
            steps.push(mergeStep(undefined, step));
    }
    return steps;
}
function generateConversationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
function useRoadmapAssistantChat(options = {}) {
    const { baseUrl = 'http://localhost:8000', threadId, conversationId: initialConversationId, initialMessages, onToolExecuted, getContext, onWebMcpMessage, canWrite = false, } = options;
    // Read once per mount: the saved conversation (if any) is shown and continued
    const storageKey = (0, storage_1.conversationKey)(baseUrl);
    const [restored] = (0, react_1.useState)(() => (initialMessages?.length ? null : (0, storage_1.loadConversation)(storageKey)));
    const [conversationId, setConversationId] = (0, react_1.useState)(() => initialConversationId || threadId || restored?.conversationId || generateConversationId());
    (0, react_1.useEffect)(() => {
        if (initialConversationId) {
            setConversationId(initialConversationId);
        }
        else if (threadId) {
            setConversationId(threadId);
        }
    }, [initialConversationId, threadId]);
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
        if (restored)
            return restored.messages;
        return [(0, welcome_1.buildWelcomeMessage)(getContext?.(), canWrite)];
    });
    // Access is often confirmed after mount: rebuild the greeting only while nothing was sent yet
    const canWriteRef = (0, react_1.useRef)(canWrite);
    (0, react_1.useEffect)(() => {
        if (canWriteRef.current === canWrite)
            return;
        canWriteRef.current = canWrite;
        setMessages((prev) => prev.length === 1 && prev[0].id === welcome_1.WELCOME_MESSAGE_ID
            ? [(0, welcome_1.buildWelcomeMessage)(getContextRef.current?.(), canWrite)]
            : prev);
    }, [canWrite]);
    const [input, setInput] = (0, react_1.useState)('');
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [isStreaming, setIsStreaming] = (0, react_1.useState)(false);
    const [activeTool, setActiveTool] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    // Save after each finished turn (not per token), and only the settled messages
    (0, react_1.useEffect)(() => {
        if (isLoading)
            return;
        const timer = setTimeout(() => {
            const settled = messages.filter((m) => m.status !== 'streaming' && m.status !== 'sending');
            (0, storage_1.saveConversation)(storageKey, { conversationId, messages: settled });
        }, 300);
        return () => clearTimeout(timer);
    }, [messages, conversationId, isLoading, storageKey]);
    // Pure useMemo instantiates client reactively without render-phase ref mutations/reads
    const client = (0, react_1.useMemo)(() => new client_1.RoadmapChatClient({ baseUrl }), [baseUrl]);
    const abortControllerRef = (0, react_1.useRef)(null);
    const smoothRef = (0, react_1.useRef)(null);
    // Clean up in-flight abort controller on unmount
    (0, react_1.useEffect)(() => {
        return () => {
            smoothRef.current?.cancel();
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);
    const stopStreaming = (0, react_1.useCallback)(() => {
        smoothRef.current?.flush();
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setMessages((prev) => prev.map((msg) => msg.status === 'streaming'
            ? { ...msg, isThinking: false, status: 'complete', stopped: true }
            : msg));
        setIsStreaming(false);
        setIsLoading(false);
        setActiveTool(null);
    }, []);
    const sendMessage = (0, react_1.useCallback)(async (textToSend) => {
        const content = (textToSend ?? input).trim();
        if (!content)
            return;
        // Abort any in-flight stream before starting new message
        smoothRef.current?.flush();
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
            thinking: '',
            isThinking: true,
            thinkingDurationMs: undefined,
            toolCalls: [],
            status: 'streaming',
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
                setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                    ? { ...msg, content: reply, isThinking: false, status: 'complete' }
                    : msg));
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định';
                setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                    ? {
                        ...msg,
                        content: `⚠️ **Lỗi WebMCP**: ${errMsg}`,
                        isThinking: false,
                        status: 'error',
                    }
                    : msg));
            }
            finally {
                setIsLoading(false);
            }
            return;
        }
        setIsLoading(true);
        setIsStreaming(true);
        // Tokens arrive in bursts; reveal them at a steady pace.
        const smooth = (0, smoothStream_1.createSmoothStream)((chunk) => {
            setMessages((prev) => prev.map((msg) => {
                if (msg.id !== botMsgId)
                    return msg;
                const now = Date.now();
                const firstTokenAt = msg.firstTokenAt ?? now;
                const thinkingDurationMs = msg.thinkingDurationMs ??
                    (msg.thinking || msg.isThinking
                        ? Math.max(0, firstTokenAt - (msg.timestamp ? msg.timestamp.getTime() : now))
                        : undefined);
                return {
                    ...msg,
                    content: msg.content + chunk,
                    firstTokenAt,
                    isThinking: false,
                    thinkingDurationMs: thinkingDurationMs ?? msg.thinkingDurationMs,
                    status: 'streaming',
                };
            }));
        });
        smoothRef.current = smooth;
        try {
            abortControllerRef.current = client.streamChat(content, {
                onThinking: (delta) => {
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        return {
                            ...msg,
                            thinking: (msg.thinking || '') + delta,
                            isThinking: true,
                            status: 'streaming',
                        };
                    }));
                },
                onToolStart: (name, args) => {
                    setActiveTool(name);
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        const currentCalls = msg.toolCalls || [];
                        return {
                            ...msg,
                            toolCalls: [
                                ...currentCalls,
                                {
                                    name,
                                    args: args || {},
                                    result: 'Đang thực thi...',
                                    status: 'running',
                                    startedAt: Date.now(),
                                },
                            ],
                        };
                    }));
                },
                onToolEnd: (name, result) => {
                    setActiveTool(null);
                    const isFailed = Boolean(typeof result === 'string' &&
                        (result.toLowerCase().startsWith('error') ||
                            result.toLowerCase().includes('failed') ||
                            result.toLowerCase().includes('thất bại') ||
                            result.toLowerCase().startsWith('exception')));
                    const status = isFailed ? 'failed' : 'success';
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        const currentCalls = msg.toolCalls || [];
                        // Close the oldest still-running call with this name.
                        const idx = currentCalls.findIndex((tc) => tc.name === name && (tc.endedAt === undefined || tc.status === 'running'));
                        const updated = currentCalls.map((tc, i) => i === idx
                            ? {
                                ...tc,
                                result,
                                status,
                                error: isFailed ? result : undefined,
                                endedAt: Date.now(),
                            }
                            : tc);
                        return { ...msg, toolCalls: updated };
                    }));
                    onToolExecutedRef.current?.(name, result);
                },
                onStep: (stepEvt) => {
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? { ...msg, steps: upsertSteps(msg.steps ?? [], [stepEvt]) }
                        : msg));
                },
                onToken: (delta) => smooth.push(delta),
                onDone: (finalResp) => smooth.finish(() => {
                    setMessages((prev) => prev.map((msg) => {
                        if (msg.id !== botMsgId)
                            return msg;
                        const now = Date.now();
                        const firstTokenAt = msg.firstTokenAt ?? now;
                        const finalThinking = finalResp.thinking || msg.thinking;
                        const durationMs = msg.thinkingDurationMs ??
                            (finalThinking
                                ? Math.max(0, firstTokenAt - (msg.timestamp ? msg.timestamp.getTime() : now))
                                : undefined);
                        return {
                            ...msg,
                            content: finalResp.message || msg.content,
                            thinking: finalThinking,
                            isThinking: false,
                            thinkingDurationMs: durationMs,
                            status: 'complete',
                            // Keep streamed calls: they carry the step timings.
                            toolCalls: msg.toolCalls?.length
                                ? msg.toolCalls
                                : finalResp.tool_calls,
                            // `done` has the final state of every step: fills in any event missed mid-stream
                            steps: finalResp.steps?.length
                                ? upsertSteps(msg.steps ?? [], finalResp.steps)
                                : msg.steps,
                        };
                    }));
                    setIsLoading(false);
                    setIsStreaming(false);
                    setActiveTool(null);
                }),
                onError: (err) => {
                    smooth.flush();
                    const { text } = (0, errors_1.friendlyError)(err);
                    setError(text);
                    setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                        ? {
                            ...msg,
                            // Keep what already streamed; the note goes after it
                            content: msg.content ? `${msg.content}\n\n⚠️ ${text}` : `⚠️ ${text}`,
                            isThinking: false,
                            status: 'error',
                        }
                        : msg));
                    setIsLoading(false);
                    setIsStreaming(false);
                    setActiveTool(null);
                },
            }, conversationId, getContextRef.current?.());
        }
        catch (err) {
            const { text } = (0, errors_1.friendlyError)(err);
            setError(text);
            setMessages((prev) => prev.map((msg) => msg.id === botMsgId
                ? { ...msg, content: `⚠️ ${text}`, isThinking: false, status: 'error' }
                : msg));
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [input, isLoading, conversationId, client, baseUrl]);
    /**
     * Send again the question that produced an error reply. The failed pair (question + error)
     * is removed first, so the conversation shows one attempt, not a trail of failures.
     */
    const retry = (0, react_1.useCallback)((errorMessageId) => {
        const index = messages.findIndex((m) => m.id === errorMessageId);
        const question = index > 0 ? messages[index - 1] : undefined;
        if (!question || question.role !== 'user')
            return;
        setMessages((prev) => prev.filter((m) => m.id !== errorMessageId && m.id !== question.id));
        void sendMessage(question.content);
    }, [messages, sendMessage]);
    const clearMessages = (0, react_1.useCallback)(() => {
        // Stop anything still streaming so its tokens can't land in the new conversation
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsLoading(false);
        setIsStreaming(false);
        setActiveTool(null);
        setError(null);
        setMessages([(0, welcome_1.buildWelcomeMessage)(getContextRef.current?.(), canWriteRef.current)]);
        setConversationId(generateConversationId());
        (0, storage_1.clearConversation)(storageKey);
    }, [storageKey]);
    return {
        messages,
        setMessages,
        input,
        setInput,
        isLoading,
        isStreaming,
        activeTool,
        error,
        conversationId,
        sendMessage,
        stopStreaming,
        clearMessages,
        retry,
    };
}
