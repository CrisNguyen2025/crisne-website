"use client";

import React, { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBotWrapper";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbotWrapper";

function ChatbotInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isReaderOpen = Boolean(searchParams?.get("item"));

  if (pathname?.startsWith("/portfolio")) {
    return <FloatingChatBot />;
  }

  // On phones: when reading a lesson (?item=), bottom nav is hidden, so anchor lower.
  // When in topic/home list, lift above the bottom nav bar.
  const bottomOffsetClass =
    pathname === "/"
      ? isReaderOpen
        ? "max-md:!bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"
        : "max-md:!bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      : "";

  return (
    <RoadmapAssistantChatbot
      position="bottom-right"
      className={bottomOffsetClass}
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
