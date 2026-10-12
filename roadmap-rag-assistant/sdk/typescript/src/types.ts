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

export interface HealthResponse {
  status: string;
  adapter_mode: string;
  llm_model: string;
  tools_count: number;
}
