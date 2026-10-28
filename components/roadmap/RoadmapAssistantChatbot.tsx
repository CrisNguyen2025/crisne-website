"use client";

import {
  getRoadmapPageContext,
  ROADMAP_ASSISTANT_BASE_URL,
  runWebMcpCommand,
} from "@/logic/roadmap/roadmapAssistantService";
import { submitChatFeedback } from "@/logic/roadmap/knowledgeTriageService";
import React from "react";
import { useCanWrite } from "@/hooks/use-can-write";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import type {
  ChatbotPosition,
  FeedbackDetail,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

export interface RoadmapAssistantChatbotProps {
  /**
   * Corner placement on screen.
   * Options: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
   * Default: 'bottom-right'
   */
  position?: ChatbotPosition;

  /**
   * Offset from horizontal screen edge in px.
   * Default: 24 (or e.g. 96 to avoid colliding with other buttons)
   */
  offsetX?: number;

  /**
   * Offset from vertical screen edge in px.
   * Default: 24
   */
  offsetY?: number;

  /**
   * Custom z-index.
   * Default: 9999
   */
  zIndex?: number;

  /**
   * Optional custom className.
   */
  className?: string;

  /**
   * Custom title for the bot header.
   */
  title?: string;

  /**
   * Optional callback fired when a tool executes.
   */
  onToolExecuted?: (toolName: string, result: string) => void;
}

/**
 * Roadmap Assistant Chatbot Component
 *
 * Floating AI Chatbot widget powered by Python LangChain Mini-RAG.
 * Allows users to CUD topics, layers, groups, items and generate documents
 * using natural language prompts.
 *
 * Position is fully configurable via props:
 *   position="bottom-right" | "bottom-left" | "top-right" | "top-left"
 *   offsetX={24} offsetY={24}
 *
 * Automatically dispatches a custom event 'roadmap:updated' on CUD operations
 * so any Roadmap UI views can re-fetch and refresh instantly.
 */
export function RoadmapAssistantChatbot({
  position = "bottom-right",
  offsetX = 24,
  offsetY = 24,
  zIndex = 9999,
  className = "",
  title = "Abot",
  onToolExecuted,
}: RoadmapAssistantChatbotProps) {
  const handleToolExecuted = (toolName: string, result: string) => {
    // Notify custom callback
    if (onToolExecuted) {
      onToolExecuted(toolName, result);
    }

    // If a tool modified data, dispatch a window event for real-time roadmap updates
    if (
      typeof window !== "undefined" &&
      (toolName.startsWith("create_") ||
        toolName.startsWith("update_") ||
        toolName.startsWith("delete_") ||
        toolName.startsWith("generate_"))
    ) {
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { toolName, result },
        })
      );
    }
  };

  // A failed request rejects: the widget then shows the previous vote again
  const handleFeedback = async (
    _msgId: string,
    value: 0 | 1 | null,
    detail?: FeedbackDetail
  ) => {
    // Without the turn's Langfuse trace (service running without tracing) there is nothing to score
    if (!detail?.traceId) return;
    await submitChatFeedback({
      traceId: detail.traceId,
      value,
      reason: detail.reason,
      comment: detail.comment,
      // Triage imports this assistant's 👎 by it
      source: "roadmap-assistant",
    });
  };

  // Same-origin proxy: it checks who the caller is before forwarding to the Python service
  const baseUrl = ROADMAP_ASSISTANT_BASE_URL;

  const canWrite = useCanWrite();

  return (
    <RoadmapChatbotWidget
      position={position}
      offsetX={offsetX}
      offsetY={offsetY}
      zIndex={zIndex}
      title={title}
      baseUrl={baseUrl}
      canWrite={canWrite}
      className={className}
      onToolExecuted={handleToolExecuted}
      onFeedback={handleFeedback}
      getContext={getRoadmapPageContext}
      onWebMcpMessage={runWebMcpCommand}
    />
  );
}
