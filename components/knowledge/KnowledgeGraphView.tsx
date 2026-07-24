"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { KnowledgeGraphData, EntityType } from "@/types/knowledge";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  BookOpen,
  Sparkles,
  Cpu,
  Bot,
  Layers,
  Briefcase,
  ExternalLink,
  Info,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeGraphViewProps {
  graphData: KnowledgeGraphData;
  className?: string;
  onNodeClick?: (type: string, slug: string) => void;
}

export function KnowledgeGraphView({ graphData, className, onNodeClick }: KnowledgeGraphViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Filter nodes based on active type filter
  const filteredNodes = useMemo(() => {
    if (activeTypeFilter === "all") return graphData.nodes;
    return graphData.nodes.filter((n) => n.type === activeTypeFilter);
  }, [graphData.nodes, activeTypeFilter]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  // Filter edges to only include edges where both source & target exist in filtered nodes
  const filteredEdges = useMemo(() => {
    return graphData.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );
  }, [graphData.edges, filteredNodeIds]);

  // Calculate 2D coordinates for nodes (Circular/Clustered Layout for clean stability)
  const nodePositions = useMemo(() => {
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const positions: Record<string, { x: number; y: number }> = {};
    const total = filteredNodes.length;

    if (total === 0) return positions;

    // Group nodes by entity type for organic cluster distribution
    const typeGroups: Record<string, typeof filteredNodes> = {};
    filteredNodes.forEach((node) => {
      if (!typeGroups[node.type]) typeGroups[node.type] = [];
      typeGroups[node.type].push(node);
    });

    const types = Object.keys(typeGroups);
    const typeCount = types.length;

    types.forEach((type, typeIdx) => {
      const typeAngle = (typeIdx / typeCount) * Math.PI * 2 - Math.PI / 2;
      const typeDistance = 180; // Distance of cluster center from canvas center
      const clusterX = centerX + Math.cos(typeAngle) * typeDistance;
      const clusterY = centerY + Math.sin(typeAngle) * typeDistance;

      const groupNodes = typeGroups[type];
      groupNodes.forEach((node, nodeIdx) => {
        if (groupNodes.length === 1) {
          positions[node.id] = { x: clusterX, y: clusterY };
        } else {
          const subAngle = (nodeIdx / groupNodes.length) * Math.PI * 2;
          const subRadius = Math.min(60, 20 + groupNodes.length * 8);
          positions[node.id] = {
            x: clusterX + Math.cos(subAngle) * subRadius,
            y: clusterY + Math.sin(subAngle) * subRadius,
          };
        }
      });
    });

    return positions;
  }, [filteredNodes]);

  // Connected nodes & edges relative to hovered or selected node
  const activeFocusId = hoveredNodeId || selectedNodeId;

  const connectedEdgeKeys = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>();
    filteredEdges.forEach((e) => {
      if (e.source === activeFocusId || e.target === activeFocusId) {
        set.add(`${e.source}->${e.target}`);
      }
    });
    return set;
  }, [activeFocusId, filteredEdges]);

  const connectedNodeIds = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>([activeFocusId]);
    filteredEdges.forEach((e) => {
      if (e.source === activeFocusId) set.add(e.target);
      if (e.target === activeFocusId) set.add(e.source);
    });
    return set;
  }, [activeFocusId, filteredEdges]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "graph-canvas-bg") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Entity Type styling dictionary
  const typeConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
    topic: { label: "Topic", color: "#8b5cf6", bg: "bg-purple-500/10", border: "border-purple-500/30", icon: BookOpen },
    skill: { label: "Skill", color: "#10b981", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: Sparkles },
    mcp: { label: "MCP", color: "#06b6d4", bg: "bg-cyan-500/10", border: "border-cyan-500/30", icon: Cpu },
    agent: { label: "Agent", color: "#f59e0b", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: Bot },
    architecture: { label: "Architecture", color: "#f43f5e", bg: "bg-rose-500/10", border: "border-rose-500/30", icon: Layers },
    project: { label: "Project", color: "#3b82f6", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Briefcase },
  };

  const selectedNode = useMemo(
    () => graphData.nodes.find((n) => n.id === selectedNodeId) || null,
    [graphData.nodes, selectedNodeId]
  );

  const selectedNodeRelationships = useMemo(() => {
    if (!selectedNodeId) return [];
    return graphData.edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
  }, [graphData.edges, selectedNodeId]);

  return (
    <div className={cn("relative w-full rounded-2xl border border-zinc-200 bg-zinc-950 text-zinc-100 shadow-xl overflow-hidden min-h-[600px] flex flex-col md:flex-row", className)}>
      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative flex-1 h-[500px] md:h-[650px] cursor-grab active:cursor-grabbing select-none overflow-hidden"
      >
        {/* Graph Header Toolbar */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/90 p-1 backdrop-blur-md font-mono text-xs shadow-lg">
            <button
              type="button"
              onClick={() => setActiveTypeFilter("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 transition-colors cursor-pointer",
                activeTypeFilter === "all" ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              All ({graphData.nodes.length})
            </button>
            {Object.keys(typeConfig).map((type) => {
              const count = graphData.nodes.filter((n) => n.type === type).length;
              if (count === 0) return null;
              const cfg = typeConfig[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveTypeFilter(type)}
                  className={cn(
                    "rounded-lg px-2 py-1 transition-colors flex items-center gap-1 cursor-pointer",
                    activeTypeFilter === type ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* View Controls Toolbar */}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/90 p-1 backdrop-blur-md text-zinc-300 shadow-lg">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(2, z + 0.15))}
            className="rounded-lg p-2 hover:bg-zinc-800 transition-colors"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.15))}
            className="rounded-lg p-2 hover:bg-zinc-800 transition-colors"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="rounded-lg p-2 hover:bg-zinc-800 transition-colors"
            title="Reset View"
            aria-label="Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* SVG Graph Canvas */}
        <svg
          id="graph-canvas-bg"
          className="w-full h-full"
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2 2" />
            </pattern>
            {/* Arrow marker for edge direction */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#52525b" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
            </marker>
          </defs>

          {/* Grid background */}
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Transform group for Pan/Zoom */}
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
            {/* Draw Edges */}
            {filteredEdges.map((edge) => {
              const sourcePos = nodePositions[edge.source];
              const targetPos = nodePositions[edge.target];

              if (!sourcePos || !targetPos) return null;

              const isEdgeConnected = connectedEdgeKeys.has(`${edge.source}->${edge.target}`);
              const isDimmed = activeFocusId && !isEdgeConnected;

              return (
                <g key={`${edge.source}-${edge.target}-${edge.relationship}`}>
                  <line
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={targetPos.x}
                    y2={targetPos.y}
                    stroke={isEdgeConnected ? "#38bdf8" : "#3f3f46"}
                    strokeWidth={isEdgeConnected ? 2 : 1}
                    strokeDasharray={edge.relationship.includes("uses") ? "4 4" : undefined}
                    opacity={isDimmed ? 0.15 : isEdgeConnected ? 0.9 : 0.4}
                    markerEnd={isEdgeConnected ? "url(#arrow-active)" : "url(#arrow)"}
                    className="transition-all duration-300"
                  />
                  {/* Relationship Label on Edge when connected */}
                  {isEdgeConnected && (
                    <text
                      x={(sourcePos.x + targetPos.x) / 2}
                      y={(sourcePos.y + targetPos.y) / 2 - 4}
                      fill="#71717a"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                      className="pointer-events-none fill-zinc-400 font-mono text-[9px]"
                    >
                      {edge.relationship}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Draw Nodes */}
            {filteredNodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;

              const isSelected = selectedNodeId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const isConnected = connectedNodeIds.has(node.id);
              const isDimmed = activeFocusId && !isConnected;

              const typeInfo = typeConfig[node.type] || {
                color: "#a1a1aa",
                bg: "bg-zinc-800",
                border: "border-zinc-700",
                label: node.type,
              };

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    if (onNodeClick) onNodeClick(node.type, node.slug);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                  style={{ opacity: isDimmed ? 0.25 : 1, transition: "opacity 0.2s" }}
                >
                  {/* Outer Pulsing Aura when selected */}
                  {(isSelected || isHovered) && (
                    <circle
                      r={24}
                      fill={typeInfo.color}
                      opacity={0.25}
                      className="animate-ping"
                    />
                  )}

                  {/* Node Circle Base */}
                  <circle
                    r={isSelected ? 16 : isHovered ? 14 : 11}
                    fill="#18181b"
                    stroke={isSelected ? "#38bdf8" : typeInfo.color}
                    strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5}
                    className="transition-all duration-200"
                  />

                  {/* Inner color dot */}
                  <circle r={4} fill={typeInfo.color} />

                  {/* Node Title Label */}
                  <text
                    y={22}
                    fill={isSelected ? "#f4f4f5" : "#a1a1aa"}
                    fontSize={isSelected ? "11" : "10"}
                    fontFamily="monospace"
                    fontWeight={isSelected ? "bold" : "normal"}
                    textAnchor="middle"
                    className="pointer-events-none select-none transition-all"
                  >
                    {node.title.length > 22 ? `${node.title.substring(0, 20)}...` : node.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Node Detail Inspector Sidebar */}
      {selectedNode ? (
        <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/90 p-5 backdrop-blur-md flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium border"
                style={{
                  backgroundColor: `${typeConfig[selectedNode.type]?.color}15`,
                  borderColor: `${typeConfig[selectedNode.type]?.color}40`,
                  color: typeConfig[selectedNode.type]?.color,
                }}
              >
                {typeConfig[selectedNode.type]?.label.toUpperCase()}
              </span>

              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-zinc-500 hover:text-zinc-300 font-mono text-xs"
              >
                Close ✕
              </button>
            </div>

            <div>
              <h3 className="font-mono text-base font-semibold text-zinc-100">{selectedNode.title}</h3>
              <p className="font-mono text-xs text-zinc-400 mt-1">{selectedNode.category}</p>
            </div>

            {/* Connected Relationships List */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <h4 className="font-mono text-xs font-medium text-zinc-300 uppercase tracking-wider">
                Graph Connections ({selectedNodeRelationships.length})
              </h4>
              {selectedNodeRelationships.length === 0 ? (
                <p className="font-mono text-xs text-zinc-500 italic">No direct connections.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {selectedNodeRelationships.map((rel, idx) => {
                    const otherId = rel.source === selectedNode.id ? rel.target : rel.source;
                    const otherNode = graphData.nodes.find((n) => n.id === otherId);
                    if (!otherNode) return null;

                    return (
                      <button
                        key={`${rel.source}-${rel.target}-${idx}`}
                        type="button"
                        onClick={() => setSelectedNodeId(otherNode.id)}
                        className="w-full text-left rounded-lg bg-zinc-950/60 p-2 border border-zinc-800/80 hover:border-zinc-700 transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400">
                          <span className="text-sky-400">{rel.relationship}</span>
                          <span>{otherNode.type}</span>
                        </div>
                        <p className="font-mono text-xs text-zinc-200 group-hover:text-sky-300 truncate mt-0.5">
                          {otherNode.title}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <Link
            href={`/knowledge/${selectedNode.type}/${selectedNode.slug}`}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 font-mono text-xs font-semibold text-zinc-900 hover:bg-white transition-colors"
          >
            <span>Open Entity Details</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </aside>
      ) : (
        <aside className="w-full md:w-72 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-md flex flex-col justify-center items-center text-center">
          <Info className="h-8 w-8 text-zinc-600 mb-2" />
          <p className="font-mono text-xs font-medium text-zinc-300">Interactive Knowledge Graph</p>
          <p className="font-mono text-[11px] text-zinc-500 mt-1 max-w-xs">
            Click on any node to view entity connections, dependencies, and machine metadata. Drag to pan, scroll to zoom.
          </p>
        </aside>
      )}
    </div>
  );
}
