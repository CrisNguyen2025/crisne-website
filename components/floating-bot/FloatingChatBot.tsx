"use client";

import { useState } from "react";
import { useFloatingChat } from "@/hooks/use-floating-chat";
import { cn } from "@/lib/utils";
import { ChatTriggerButton, type ChatTriggerVariant } from "./ChatTriggerButton";
import { FloatingChatPopup } from "./FloatingChatPopup";
import { FloatingQuickBar } from "./FloatingQuickBar";
import { FloatingChatDrawer } from "./FloatingChatDrawer";

export type AssistantUiStyle = "style1-popup" | "style2-drawer";

export interface FloatingChatBotProps {
  /**
   * Style của Float Trigger Button (cho Style 1):
   * - 'capsule': Glassmorphism Capsule bo tròn "Ask AI ✨" (Mặc định - V1)
   * - 'mascot': 3D Robot Avatar Chibi thân thiện (V2)
   */
  triggerVariant?: ChatTriggerVariant;
  /**
   * UI Style Concept:
   * - 'style1-popup': Bottom-right launcher button + floating popup window (Mặc định)
   * - 'style2-drawer': 2-phase Langfuse UI (Floating Quick Bar ở đáy giữa + Full-height right drawer)
   */
  uiStyle?: AssistantUiStyle;
  initialOpen?: boolean;
}

export function FloatingChatBot({
  triggerVariant = "capsule",
  uiStyle = "style1-popup",
  initialOpen = false,
}: FloatingChatBotProps = {}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const chat = useFloatingChat();

  if (uiStyle === "style2-drawer") {
    return (
      <>
        <FloatingQuickBar
          isVisible={!isOpen}
          input={chat.input}
          onInputChange={chat.setInput}
          onSubmit={(query) => {
            setIsOpen(true);
            void chat.sendMessage(query);
          }}
          onOpenDrawer={() => setIsOpen(true)}
          hasMessages={chat.messages.length > 0}
        />
        <FloatingChatDrawer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          chat={chat}
        />
      </>
    );
  }

  // Default: Style 1 (Capsule/Mascot Launcher + Bottom-Right Popup Modal)
  return (
    <aside
      aria-label="AI Assistant"
      className={cn(
        "pointer-events-none fixed z-[9999] flex flex-col font-sans",
        isOpen
          ? "inset-0 md:inset-auto md:bottom-6 md:right-6 md:items-end"
          : "bottom-4 right-4 items-end md:bottom-6 md:right-6"
      )}
    >
      <FloatingChatPopup
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        chat={chat}
      />

      <ChatTriggerButton
        variant={triggerVariant}
        isOpen={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        greetingText={
          triggerVariant === "mascot"
            ? "Hi there! Cris có thể giúp gì cho bạn? ✨"
            : undefined
        }
      />
    </aside>
  );
}
