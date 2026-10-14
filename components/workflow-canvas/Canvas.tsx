"use client";

import React, { useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "@/lib/workflow/canvas-store";
import { nodeTypes } from "./WorkflowNode";
import { toFlow, isValidConnection as validateConnection } from "@/lib/workflow/canvas-mapping";
import type { NodeType } from "@/lib/workflow/dsl-types";

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useCanvasStore((s) => s.graph);
  const ui = useCanvasStore((s) => s.ui);
  const moveNode = useCanvasStore((s) => s.moveNode);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const connectAction = useCanvasStore((s) => s.connect);
  const removeElements = useCanvasStore((s) => s.removeElements);
  const lastRun = useCanvasStore((s) => s.lastRun);

  // Compute flow representation
  const flowData = useMemo(() => toFlow(graph, ui), [graph, ui]);

  // Style edges based on source node status in lastRun
  const edgesWithStyles = useMemo(() => {
    return flowData.edges.map((edge) => {
      let strokeColor = "var(--border)";
      let strokeWidth = 1.5;
      let strokeDasharray = undefined;

      if (lastRun) {
        const sourceNodeRun = lastRun.nodes.find((n) => n.nodeId === edge.source);
        if (sourceNodeRun) {
          switch (sourceNodeRun.status) {
            case "SUCCEEDED":
              strokeColor = "#10b981"; // emerald-500
              strokeWidth = 2;
              break;
            case "SKIPPED":
              strokeColor = "#94a3b8"; // slate-400
              strokeDasharray = "4 4";
              break;
            case "FAILED":
              strokeColor = "#ef4444"; // red-500
              break;
            case "CANCELLED":
              strokeColor = "#f59e0b"; // amber-500
              strokeDasharray = "2 2";
              break;
          }
        }
      }

      return {
        ...edge,
        animated: lastRun?.status === "RUNNING",
        style: {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
        },
      };
    });
  }, [flowData.edges, lastRun]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          moveNode(change.id, change.position);
        }
      }
    },
    [moveNode]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedEdgeIds = changes
        .filter((c) => c.type === "remove")
        .map((c) => c.id);
      if (removedEdgeIds.length > 0) {
        removeElements([], removedEdgeIds);
      }
    },
    [removeElements]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      connectAction({
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      });
    },
    [connectAction]
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      return validateConnection(
        {
          source: connection.source,
          sourceHandle: connection.sourceHandle,
          target: connection.target,
          targetHandle: connection.targetHandle,
        },
        graph.nodes,
        graph.edges
      );
    },
    [graph.nodes, graph.edges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type") as NodeType;
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={flowData.nodes}
        edges={edgesWithStyles}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={16} size={1} />
        <Controls className="!bg-card !border-border !rounded-xl !shadow-sm" />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-card/70 !border-border !rounded-xl !overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
