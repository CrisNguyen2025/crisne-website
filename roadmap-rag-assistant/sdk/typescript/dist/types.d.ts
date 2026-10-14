/**
 * TypeScript types for the Roadmap RAG Assistant SDK.
 * Mirrors the Python Pydantic schemas from rag_service/api/schemas.py.
 */
export interface ToolCallResult {
    name: string;
    args: Record<string, unknown>;
    result: string;
}
export interface ChatRequest {
    message: string;
    thread_id?: string;
    context?: PageContext;
}
/** Page the user is viewing; lets the assistant resolve "này" / "đây" references. */
export interface PageContext {
    roadmapSlug?: string;
    layerId?: string;
    itemId?: string;
}
export interface ChatResponse {
    message: string;
    tool_calls: ToolCallResult[];
}
export interface WebMcpToolSpec {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export interface PlanResponse {
    tool: string | null;
    args: Record<string, unknown>;
    reply: string;
}
export interface HealthResponse {
    status: string;
    adapter_mode: string;
    llm_model: string;
    tools_count: number;
}
/**
 * Action chip metadata for interactive generative UI.
 * Compatible with the action tag protocol [[action:type|id|label]].
 */
export interface ChatActionChip {
    type: 'project' | 'roadmap' | 'contact' | 'link';
    id: string;
    label: string;
    data?: Record<string, unknown>;
    action?: string;
    payload?: Record<string, unknown>;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: ToolCallResult[];
    actionChips?: ChatActionChip[];
    status?: 'sending' | 'streaming' | 'complete' | 'error';
    timestamp: Date;
}
