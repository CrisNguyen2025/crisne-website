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

  // On phones the roadmap page has a bottom nav: lift the launcher above it
  return (
    <RoadmapAssistantChatbot
      position="bottom-right"
      className={pathname === "/" ? "max-md:!bottom-[calc(4.5rem+env(safe-area-inset-bottom))]" : ""}
    />
  );
}
