"use client";

import { useState } from "react";
import { useFloatingChat } from "@/hooks/use-floating-chat";
import { FloatingQuickBar } from "./FloatingQuickBar";
import { FloatingChatDrawer } from "./FloatingChatDrawer";

export interface FloatingChatBotProps {
  initialOpen?: boolean;
}

export function FloatingChatBot({
  initialOpen = false,
}: FloatingChatBotProps = {}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const chat = useFloatingChat();

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
