'use client';

import { useCanWrite } from '@/hooks/use-can-write';
import { useRoadmapWebMcpTools } from '@/hooks/use-roadmap-webmcp';

function RoadmapWebMcpMount() {
  useRoadmapWebMcpTools();
  return null;
}

// Renders nothing; exists only to mount the WebMCP tool registration in the layout.
export function RoadmapWebMcpRegistrar() {
  const canWrite = useCanWrite();
  if (!canWrite) return null;
  return <RoadmapWebMcpMount />;
}
