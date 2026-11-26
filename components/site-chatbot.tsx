"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NEWS_PATH } from "@/lib/news/paths";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBotWrapper";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbotWrapper";

function ChatbotInner() {
  const pathname = usePathname();

  // Abot stays off the News inbox and the share target, as before ADR-0019
  if (
    pathname === NEWS_PATH ||
    pathname?.startsWith(`${NEWS_PATH}/`) ||
    pathname?.startsWith("/share")
  ) {
    return null;
  }

  if (pathname?.startsWith("/portfolio")) {
    return <FloatingChatBot />;
  }

  return (
    <RoadmapAssistantChatbot
      position="bottom-right"
      zIndex={60}
      routeKey={pathname ?? undefined}
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
