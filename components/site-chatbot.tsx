"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { isPublicPagePath } from "@/lib/auth/public-paths";
import { FEED_INGESTION_PATH } from "@/lib/news/paths";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBotWrapper";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbotWrapper";

function ChatbotInner() {
  const pathname = usePathname();

  // `/news` is open to signed-out Visitors, who cannot reach the Abot proxy
  if (
    pathname?.startsWith(FEED_INGESTION_PATH) ||
    pathname?.startsWith("/share") ||
    (pathname && isPublicPagePath(pathname))
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
