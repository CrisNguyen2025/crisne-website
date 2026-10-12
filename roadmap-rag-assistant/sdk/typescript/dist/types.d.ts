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
}
export interface ChatResponse {
    message: string;
    tool_calls: ToolCallResult[];
}
export interface HealthResponse {
    status: string;
    adapter_mode: string;
    llm_model: string;
    tools_count: number;
}
