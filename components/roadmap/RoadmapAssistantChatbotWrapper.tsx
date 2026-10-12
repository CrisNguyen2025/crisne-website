"use client";

import dynamic from "next/dynamic";
import type { RoadmapAssistantChatbotProps } from "./RoadmapAssistantChatbot";

export const RoadmapAssistantChatbot = dynamic<RoadmapAssistantChatbotProps>(
  () =>
    import("./RoadmapAssistantChatbot").then(
      (mod) => mod.RoadmapAssistantChatbot
    ),
  { ssr: false }
);
