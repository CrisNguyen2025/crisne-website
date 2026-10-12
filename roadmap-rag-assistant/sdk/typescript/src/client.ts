/**
 * RoadmapChatClient — TypeScript SDK for the Roadmap RAG Assistant with SSE streaming.
 */

import type { ChatResponse, HealthResponse, ToolCallResult } from './types';

export interface RoadmapChatClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export interface StreamCallbacks {
  onToken?: (delta: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: string) => void;
  onDone?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
}

export class RoadmapChatClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: RoadmapChatClientOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:8000').replace(
      /\/$/,
      ''
    );
    this.timeout = options.timeout || 120000;
  }

  /**
   * Real-time Server-Sent Events (SSE) streaming chat.
   *
   * @param message - User prompt
   * @param callbacks - Event callbacks for real-time tokens and tool events
   * @param threadId - Conversation thread ID
   * @returns AbortController to allow canceling the stream
   */
  streamChat(
    message: string,
    callbacks: StreamCallbacks,
    threadId: string = 'default'
  ): AbortController {
    const controller = new AbortController();

    (async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, thread_id: threadId }),
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

        const accumulatedTools: ToolCallResult[] = [];
        let accumulatedMessage = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

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
            } else if (trimmed.startsWith('data:')) {
              const dataRaw = trimmed.slice(5).trim();
              try {
                const data = JSON.parse(dataRaw);

                if (currentEvent === 'token') {
                  const delta = data.delta || '';
                  accumulatedMessage += delta;
                  callbacks.onToken?.(delta);
                } else if (currentEvent === 'tool_start') {
                  callbacks.onToolStart?.(data.name, data.args || {});
                } else if (currentEvent === 'tool_end') {
                  const toolItem: ToolCallResult = {
                    name: data.name,
                    args: {},
                    result: data.result || '',
                  };
                  accumulatedTools.push(toolItem);
                  callbacks.onToolEnd?.(data.name, data.result || '');
                } else if (currentEvent === 'done') {
                  const finalResp: ChatResponse = {
                    message: data.message || accumulatedMessage,
                    tool_calls: data.tool_calls || accumulatedTools,
                  };
                  callbacks.onDone?.(finalResp);
                } else if (currentEvent === 'error') {
                  callbacks.onError?.(new Error(data.error || 'Stream error'));
                }
              } catch (e) {
                console.error('[RoadmapChatClient] Failed to parse SSE data:', e, dataRaw);
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    })();

    return controller;
  }

  /**
   * Synchronous chat request (waits until response completes).
   */
  async chat(
    message: string,
    threadId: string = 'default'
  ): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      this.streamChat(
        message,
        {
          onDone: (resp) => resolve(resp),
          onError: (err) => reject(err),
        },
        threadId
      );
    });
  }

  /**
   * Check health of the Assistant service.
   */
  async health(): Promise<HealthResponse> {
    const resp = await fetch(`${this.baseUrl}/health`);
    if (!resp.ok) {
      throw new Error(`Health check failed: ${resp.statusText}`);
    }
    return (await resp.json()) as HealthResponse;
  }
}
