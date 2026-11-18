"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBotWrapper";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbotWrapper";

function ChatbotInner() {
  const pathname = usePathname();

  if (pathname?.startsWith("/portfolio")) {
    return <FloatingChatBot />;
  }

  return (
    <RoadmapAssistantChatbot
      position="bottom-right"
      className="max-md:!bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"
    />
  );
}

// One bot per page: portfolio visitors get Cris AI, roadmap pages get the Roadmap Assistant
export function SiteChatbot() {
  return (
    <Suspense fallback={null}>
      <ChatbotInner />
    </Suspense>
  );
}
