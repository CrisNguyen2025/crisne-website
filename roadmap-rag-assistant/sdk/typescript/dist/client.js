"use strict";
/**
 * RoadmapChatClient — TypeScript SDK for the Roadmap RAG Assistant with SSE streaming.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadmapChatClient = exports.StreamTimeoutError = void 0;
/** The stream stopped sending data for too long; the request was cancelled. */
class StreamTimeoutError extends Error {
    kind = 'timeout';
    constructor(message = 'Stream idle timeout') {
        super(message);
        this.name = 'StreamTimeoutError';
    }
}
exports.StreamTimeoutError = StreamTimeoutError;
class RoadmapChatClient {
    baseUrl;
    timeout;
    idleTimeout;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || 'http://localhost:8000').replace(/\/$/, '');
        this.timeout = options.timeout || 120000;
        this.idleTimeout = options.idleTimeout || 30000;
    }
    /**
     * Real-time Server-Sent Events (SSE) streaming chat.
     *
     * @param message - User prompt
     * @param callbacks - Event callbacks for real-time tokens and tool events
     * @param threadId - Conversation thread ID
     * @param context - Optional page context (current roadmap, layer, item)
     * @returns AbortController to allow canceling the stream
     */
    streamChat(message, callbacks, threadId = 'default', context) {
        const controller = new AbortController();
        // Two guards: a silence limit between chunks (a stalled stream) and a cap on the whole request.
        // Either one aborts the fetch, and the error reaches onError as a StreamTimeoutError.
        let timedOut = false;
        let idleTimer;
        const cancelForTimeout = () => {
            timedOut = true;
            controller.abort();
        };
        const armIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(cancelForTimeout, this.idleTimeout);
        };
        const totalTimer = setTimeout(cancelForTimeout, this.timeout);
        (async () => {
            try {
                const resp = await fetch(`${this.baseUrl}/chat/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, thread_id: threadId, context }),
                    signal: controller.signal,
                });
                if (!resp.ok) {
                    const errorText = await resp.text().catch(() => resp.statusText);
                    throw new Error(`SSE streaming failed (${resp.status}): ${errorText}`);
                }
                if (!resp.body) {
                    throw new Error('Response body is null');
                }
                const reader = resp.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                let currentEvent = 'message';
                const accumulatedTools = [];
                const pendingToolArgs = new Map();
                let accumulatedMessage = '';
                let accumulatedThinking = '';
                let inThinkTag = false;
                const processTokenChunk = (chunk) => {
                    if (!chunk)
                        return;
                    let remaining = chunk;
                    while (remaining.length > 0) {
                        if (!inThinkTag) {
                            const thinkMatch = remaining.match(/<(?:think|thought)>/i);
                            if (thinkMatch && thinkMatch.index !== undefined) {
                                const before = remaining.slice(0, thinkMatch.index);
                                if (before) {
                                    accumulatedMessage += before;
                                    callbacks.onToken?.(before);
                                }
                                inThinkTag = true;
                                remaining = remaining.slice(thinkMatch.index + thinkMatch[0].length);
                            }
                            else {
                                accumulatedMessage += remaining;
                                callbacks.onToken?.(remaining);
                                remaining = '';
                            }
                        }
                        else {
                            const closeMatch = remaining.match(/<\/(?:think|thought)>/i);
                            if (closeMatch && closeMatch.index !== undefined) {
                                const thinkContent = remaining.slice(0, closeMatch.index);
                                if (thinkContent) {
                                    accumulatedThinking += thinkContent;
                                    callbacks.onThinking?.(thinkContent);
                                }
                                inThinkTag = false;
                                remaining = remaining.slice(closeMatch.index + closeMatch[0].length);
                            }
                            else {
                                accumulatedThinking += remaining;
                                callbacks.onThinking?.(remaining);
                                remaining = '';
                            }
                        }
                    }
                };
                armIdle();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    armIdle();
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) {
                            currentEvent = 'message';
                            continue;
                        }
                        if (trimmed.startsWith('event:')) {
                            currentEvent = trimmed.slice(6).trim();
                        }
                        else if (trimmed.startsWith('data:')) {
                            const dataRaw = trimmed.slice(5).trim();
                            try {
                                const data = JSON.parse(dataRaw);
                                if (currentEvent === 'thinking' || currentEvent === 'reasoning') {
                                    const delta = typeof data === 'object' && data !== null
                                        ? (data.delta ?? data.content ?? '')
                                        : (typeof data === 'string' ? data : '');
                                    if (delta) {
                                        accumulatedThinking += delta;
                                        callbacks.onThinking?.(delta);
                                    }
                                }
                                else if (currentEvent === 'token') {
                                    const rawDelta = typeof data === 'object' && data !== null
                                        ? (data.delta ?? data.content ?? '')
                                        : (typeof data === 'string' ? data : '');
                                    processTokenChunk(rawDelta);
                                }
                                else if (currentEvent === 'tool_start') {
                                    const args = (data.args && typeof data.args === 'object') ? data.args : {};
                                    pendingToolArgs.set(data.name, args);
                                    callbacks.onToolStart?.(data.name, args);
                                }
                                else if (currentEvent === 'tool_end') {
                                    const resolvedArgs = (data.args && Object.keys(data.args).length > 0)
                                        ? data.args
                                        : (pendingToolArgs.get(data.name) || {});
                                    pendingToolArgs.delete(data.name);
                                    const isFailed = Boolean(data.status === 'failed' ||
                                        data.error ||
                                        (typeof data.result === 'string' &&
                                            (data.result.toLowerCase().startsWith('error') ||
                                                data.result.toLowerCase().includes('failed') ||
                                                data.result.toLowerCase().includes('thất bại') ||
                                                data.result.toLowerCase().startsWith('exception'))));
                                    const toolItem = {
                                        name: data.name,
                                        args: resolvedArgs,
                                        result: data.result || '',
                                        status: isFailed ? 'failed' : 'success',
                                        error: data.error || (isFailed ? data.result : undefined),
                                    };
                                    accumulatedTools.push(toolItem);
                                    callbacks.onToolEnd?.(data.name, data.result || '');
                                }
                                else if (currentEvent === 'step') {
                                    callbacks.onStep?.(data);
                                }
                                else if (currentEvent === 'done') {
                                    const finalResp = {
                                        message: data.message || accumulatedMessage,
                                        thinking: data.thinking || (accumulatedThinking ? accumulatedThinking : undefined),
                                        tool_calls: data.tool_calls || accumulatedTools,
                                        steps: Array.isArray(data.steps) ? data.steps : undefined,
                                    };
                                    callbacks.onDone?.(finalResp);
                                }
                                else if (currentEvent === 'error') {
                                    callbacks.onError?.(new Error(data.error || 'Stream error'));
                                }
                            }
                            catch (e) {
                                console.error('[RoadmapChatClient] Failed to parse SSE data:', e, dataRaw);
                            }
                        }
                    }
                }
            }
            catch (err) {
                if (timedOut) {
                    callbacks.onError?.(new StreamTimeoutError());
                    return;
                }
                if (err instanceof Error && err.name === 'AbortError') {
                    return;
                }
                callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
            finally {
                clearTimeout(idleTimer);
                clearTimeout(totalTimer);
            }
        })();
        return controller;
    }
    /**
     * Synchronous chat request (waits until response completes).
     */
    async chat(message, threadId = 'default', context) {
        return new Promise((resolve, reject) => {
            this.streamChat(message, {
                onDone: (resp) => resolve(resp),
                onError: (err) => reject(err),
            }, threadId, context);
        });
    }
    /**
     * Ask the service to choose one WebMCP tool for a message. Nothing is executed server-side.
     */
    async plan(message, tools, context) {
        const resp = await fetch(`${this.baseUrl}/chat/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, tools, context }),
        });
        if (!resp.ok) {
            throw new Error(`Plan request failed (${resp.status})`);
        }
        return (await resp.json());
    }
    /**
     * Check health of the Assistant service.
     */
    async health() {
        const resp = await fetch(`${this.baseUrl}/health`);
        if (!resp.ok) {
            throw new Error(`Health check failed: ${resp.statusText}`);
        }
        return (await resp.json());
    }
}
exports.RoadmapChatClient = RoadmapChatClient;
