"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCanvasStore } from "@/lib/workflow/canvas-store";
import {
  saveWorkflowDraftApi,
  type ProjectDocumentItem,
  type WorkflowVersionItem,
} from "@/logic/workflow/api";
import { Palette } from "./Palette";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { SaveIndicator } from "./SaveIndicator";
import { ErrorList } from "./ErrorList";
import { RunPanel } from "./RunPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { VersionPanel } from "./VersionPanel";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, Database, GitBranch, Loader2, Tag } from "lucide-react";
import type { WorkflowGraph, WorkflowUi } from "@/lib/workflow/dsl-types";
import type { ValidationError } from "@/lib/workflow/dsl-validator";
import { graphHash } from "@/lib/workflow/graph-hash";

const CanvasWithNoSSR = dynamic(
  () => import("./Canvas").then((mod) => mod.Canvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

interface WorkflowEditorProps {
  workflow: {
    id: string;
    name: string;
    projectId: string;
    graph: WorkflowGraph;
    ui: WorkflowUi;
    draftGraphHash: string;
  };
  initialErrors: ValidationError[];
  initialDocuments?: ProjectDocumentItem[];
  initialVersions?: WorkflowVersionItem[];
}

export function WorkflowEditor({
  workflow,
  initialErrors,
  initialDocuments = [],
  initialVersions = [],
}: WorkflowEditorProps) {
  const initialize = useCanvasStore((s) => s.initialize);
  const setSaveState = useCanvasStore((s) => s.setSaveState);
  const setErrors = useCanvasStore((s) => s.setErrors);

  const graph = useCanvasStore((s) => s.graph);
  const ui = useCanvasStore((s) => s.ui);

  const [documents, setDocuments] = useState<ProjectDocumentItem[]>(initialDocuments);
  const [versions, setVersions] = useState<WorkflowVersionItem[]>(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [isKbOpen, setIsKbOpen] = useState(false);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);

  const latestVersion = versions.length > 0 ? versions[0] : null;
  let currentDraftHash = workflow.draftGraphHash;
  try {
    if (graph && graph.nodes) currentDraftHash = graphHash(graph);
  } catch {}
  const isModifiedFromLatest = Boolean(latestVersion && latestVersion.graphHash !== currentDraftHash);

  const isInitializedRef = useRef(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize store on mount
  useEffect(() => {
    initialize(workflow.graph, workflow.ui, initialErrors);
    isInitializedRef.current = true;
  }, [workflow, initialErrors, initialize]);

  // Debounced autosave (1s)
  useEffect(() => {
    if (!isInitializedRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSaveState("saving");

    saveTimerRef.current = setTimeout(async () => {
      try {
        const result = await saveWorkflowDraftApi(workflow.id, graph, ui);
        setSaveState("saved");
        setErrors(result.errors);
      } catch {
        setSaveState("error");
      }
    }, 1000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [graph, ui, workflow.id, setSaveState, setErrors]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-card/80 px-4 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/workflows"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to workflows"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-foreground tracking-tight">
              {workflow.name}
            </span>
          </div>

          <SaveIndicator />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsVersionPanelOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Workflow Versions"
          >
            <Tag className="h-3.5 w-3.5 text-primary" />
            {latestVersion ? (
              <span className="flex items-center gap-1.5">
                <span>v{latestVersion.versionNumber}</span>
                {isModifiedFromLatest && (
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    modified
                  </span>
                )}
              </span>
            ) : (
              <span>Publish v1</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsKbOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Open Project Knowledge Base"
          >
            <Database className="h-3.5 w-3.5 text-amber-500" />
            <span>Knowledge Base ({documents.length})</span>
          </button>
          <ErrorList />
          <ThemeToggle className="h-8 w-8 rounded-lg border border-border/60 text-foreground" />
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Palette */}
        <Palette />

        {/* Center: Canvas */}
        <div className="relative flex-1 bg-muted/10">
          <CanvasWithNoSSR />
        </div>

        {/* Right: Node Config Panel */}
        <NodeConfigPanel documents={documents} />
      </div>

      {/* Bottom: Run & Debug Panel */}
      <RunPanel
        workflowId={workflow.id}
        versionId={selectedVersionId}
        versionNumber={versions.find((v) => v.id === selectedVersionId)?.versionNumber}
        onClearVersion={() => setSelectedVersionId(null)}
      />

      {/* Knowledge Base Drawer/Modal */}
      <DocumentsPanel
        projectId={workflow.projectId}
        documents={documents}
        isOpen={isKbOpen}
        onClose={() => setIsKbOpen(false)}
        onDocumentsChange={(updated) => setDocuments(updated)}
      />

      {/* Version Management Drawer/Modal */}
      <VersionPanel
        workflowId={workflow.id}
        versions={versions}
        latestVersion={latestVersion}
        draftGraphHash={currentDraftHash}
        isOpen={isVersionPanelOpen}
        onClose={() => setIsVersionPanelOpen(false)}
        onPublishSuccess={(newVer) => {
          setVersions((prev) => [newVer, ...prev]);
          setIsVersionPanelOpen(false);
        }}
        selectedVersionId={selectedVersionId}
        onSelectVersionId={(id) => {
          setSelectedVersionId(id);
          setIsVersionPanelOpen(false);
        }}
      />
    </div>
  );
}
