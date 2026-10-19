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
  AssistantStepEvent,
  AssistantStepItem,
  AssistantStepKind,
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

// Rich Markdown Engine & Components
export {
  ChatMarkdown,
  parseBlocks,
  renderInline,
  StreamingCaret,
} from './react/ChatMarkdown';
export type { ChatMarkdownProps, Block, ListItem } from './react/ChatMarkdown';
export { CodeBlock } from './react/components/CodeBlock';
export type { CodeBlockProps } from './react/components/CodeBlock';
export { MarkdownTable } from './react/components/MarkdownTable';
export type { MarkdownTableProps } from './react/components/MarkdownTable';
export { CalloutAlert } from './react/components/CalloutAlert';
export type { CalloutAlertProps, CalloutType } from './react/components/CalloutAlert';
export { ThoughtProcess } from './react/components/ThoughtProcess';
export type { ThoughtProcessProps } from './react/components/ThoughtProcess';
export { ToolExecutionCard } from './react/components/ToolExecutionCard';
export type { ToolExecutionCardProps } from './react/components/ToolExecutionCard';

// Icons & Formatters for UI customizers
export * from './react/icons';
export * from './react/utils/formatters';
