"use client";

import dynamic from "next/dynamic";

export const FloatingChatBot = dynamic(
  () => import("./FloatingChatBot").then((mod) => mod.FloatingChatBot),
  { ssr: false }
);
