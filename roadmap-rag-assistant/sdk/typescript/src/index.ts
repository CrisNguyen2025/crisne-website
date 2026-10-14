/**
 * Roadmap Chat SDK — TypeScript client and Headless React SDK for the Roadmap RAG Assistant.
 *
 * @module roadmap-chat-sdk
 */

// Core HTTP & Streaming Client
export { RoadmapChatClient } from './client';
export type { RoadmapChatClientOptions } from './client';

// Core Protocol & Schema Types
export type {
  ChatResponse,
  ChatRequest,
  HealthResponse,
  ToolCallResult,
  PageContext,
  PlanResponse,
  WebMcpToolSpec,
  ChatActionChip,
} from './types';

// React Chatbot Widget & Headless Hooks
export { RoadmapChatbotWidget } from './react/RoadmapChatbotWidget';
export { useRoadmapAssistantChat } from './react/useRoadmapAssistantChat';
export type {
  ChatbotConfig,
  ChatbotPosition,
  ChatMessage,
  UseRoadmapAssistantChatOptions,
  UseRoadmapAssistantChatReturn,
  ToolCall,
  FeedbackDetail,
} from './react';

// Icons & Formatters for UI customizers
export * from './react/icons';
export * from './react/utils/formatters';
