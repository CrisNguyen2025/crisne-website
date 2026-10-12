"use client";

import React from "react";
import {
  RoadmapChatbotWidget,
  ChatbotPosition,
} from "@/roadmap-rag-assistant/sdk/typescript/src";

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
  title = "AI Assistant",
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

  const baseUrl =
    process.env.NEXT_PUBLIC_RAG_SERVICE_URL || "http://localhost:8000";

  return (
    <RoadmapChatbotWidget
      position={position}
      offsetX={offsetX}
      offsetY={offsetY}
      zIndex={zIndex}
      title={title}
      baseUrl={baseUrl}
      className={className}
      onToolExecuted={handleToolExecuted}
    />
  );
}
