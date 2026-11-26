"use client";

import {
  getRoadmapPageContext,
  isRoadmapWriteTool,
  ROADMAP_ASSISTANT_BASE_URL,
  runWebMcpCommand,
} from "@/logic/roadmap/roadmapAssistantService";
import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/hooks/use-can-write";
import { useToast } from "@/components/ui/toast";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";
import type { ChatbotPosition } from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

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
   * Optional active pathname / route key so the widget refreshes its page context indicator on SPA transitions.
   */
  routeKey?: string;

  /**
   * Optional callback fired when a tool executes.
   */
  onToolExecuted?: (toolName: string, result: string, isFailed?: boolean) => void;
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
  routeKey,
  onToolExecuted,
}: RoadmapAssistantChatbotProps) {
  const handleToolExecuted = (
    toolName: string,
    result: string,
    isFailed?: boolean
  ) => {
    // Notify custom callback
    if (onToolExecuted) {
      onToolExecuted(toolName, result, isFailed);
    }

    if (
      typeof window !== "undefined" &&
      !isFailed &&
      isRoadmapWriteTool(toolName)
    ) {
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { toolName, result },
        })
      );
    }
  };

  // Same-origin proxy: it checks who the caller is before forwarding to the Python service
  const baseUrl = ROADMAP_ASSISTANT_BASE_URL;

  const canWrite = useCanWrite();
  const { toast } = useToast();
  const router = useRouter();
  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  return (
    <RoadmapChatbotWidget
      position={position}
      offsetX={offsetX}
      offsetY={offsetY}
      zIndex={zIndex}
      title={title}
      baseUrl={baseUrl}
      canWrite={canWrite}
      restoreLatestThread={canWrite}
      className={className}
      onToolExecuted={handleToolExecuted}
      onNotify={toast}
      onNavigate={handleNavigate}
      routeKey={routeKey}
      getContext={getRoadmapPageContext}
      onWebMcpMessage={runWebMcpCommand}
    />
  );
}
