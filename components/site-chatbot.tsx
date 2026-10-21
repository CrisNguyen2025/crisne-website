"use client";

import { usePathname } from "next/navigation";
import { FloatingChatBot } from "@/components/floating-bot/FloatingChatBotWrapper";
import { RoadmapAssistantChatbot } from "@/components/roadmap/RoadmapAssistantChatbotWrapper";

// One bot per page: portfolio visitors get Cris AI, roadmap pages get the Roadmap Assistant
export function SiteChatbot() {
  const pathname = usePathname();

  if (pathname?.startsWith("/portfolio")) {
    return <FloatingChatBot uiStyle="style2-drawer" />;
    return <FloatingChatBot />;
  }

  return <RoadmapAssistantChatbot position="bottom-right" />;
}
