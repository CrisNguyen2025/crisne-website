import type { Metadata } from "next";
import { ToolsClient } from "./tools-client";

export const metadata: Metadata = {
  title: "Tools — Notes",
  description: "Personal notes organized by tags",
};

export default function ToolsPage() {
  return <ToolsClient />;
}
