/**
 * Roadmap Chat SDK — TypeScript client for the Roadmap RAG Assistant.
 *
 * @module roadmap-chat-sdk
 */

export { RoadmapChatClient } from './client';
export type { RoadmapChatClientOptions } from './client';
export type { ChatResponse, ChatRequest, HealthResponse, ToolCallResult, PageContext } from './types';

// React Chatbot Widget & Hooks
export { RoadmapChatbotWidget } from './react/RoadmapChatbotWidget';
export { useRoadmapAssistantChat } from './react/useRoadmapAssistantChat';
export type {
  ChatbotConfig,
  ChatbotPosition,
  ChatMessage,
  UseRoadmapAssistantChatOptions,
} from './react';

