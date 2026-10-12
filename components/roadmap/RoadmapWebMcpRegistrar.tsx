'use client';

import { useRoadmapWebMcpTools } from '@/hooks/use-roadmap-webmcp';

// Renders nothing; exists only to mount the WebMCP tool registration in the layout.
export function RoadmapWebMcpRegistrar() {
  useRoadmapWebMcpTools();
  return null;
}
