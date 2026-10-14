"use client";

import React, { useState } from "react";
import {
  Tag,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  History,
  Play,
  FileCode2,
} from "lucide-react";
import {
  publishWorkflowVersionApi,
  type WorkflowVersionItem,
} from "@/logic/workflow/api";
import type { ValidationError } from "@/lib/workflow/dsl-validator";

interface VersionPanelProps {
  workflowId: string;
  versions: WorkflowVersionItem[];
  latestVersion: WorkflowVersionItem | null;
  draftGraphHash: string;
  isOpen: boolean;
  onClose: () => void;
  onPublishSuccess: (newVersion: WorkflowVersionItem) => void;
  selectedVersionId: string | null;
  onSelectVersionId: (versionId: string | null) => void;
}

export function VersionPanel({
  workflowId,
  versions,
  latestVersion,
  draftGraphHash,
  isOpen,
  onClose,
  onPublishSuccess,
  selectedVersionId,
  onSelectVersionId,
}: VersionPanelProps) {
  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<ValidationError[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isModified = Boolean(latestVersion && latestVersion.graphHash !== draftGraphHash);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishErrors(null);
    setGeneralError(null);

    try {
      const res = await publishWorkflowVersionApi(workflowId);
      if (res.errors) {
        setPublishErrors(res.errors);
      } else if (res.error) {
        setGeneralError(res.error);
      } else if (res.version) {
        onPublishSuccess(res.version);
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "Failed to publish version.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Tag className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Workflow Versions</h2>
              <p className="text-xs text-muted-foreground">
                Immutable published snapshots for production execution.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Callout */}
        <div className="mt-4">
          {latestVersion ? (
            isModified ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Current draft has changed compared to <strong>v{latestVersion.versionNumber}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600 dark:bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                >
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                  <span>Publish v{latestVersion.versionNumber + 1}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Current draft is identical to <strong>v{latestVersion.versionNumber}</strong>
                  </span>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-3 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>No versions published yet. Create your first production version.</span>
              </div>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                <span>Publish v1</span>
              </button>
            </div>
          )}
        </div>

        {/* Errors */}
        {generalError && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {generalError}
          </div>
        )}
        {publishErrors && publishErrors.length > 0 && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            <p className="font-semibold">Cannot publish: Graph validation failed</p>
            <ul className="list-disc pl-4 text-[11px] space-y-0.5">
              {publishErrors.map((err, i) => (
                <li key={i}>{err.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Run Target Switcher */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/70 bg-card p-3 text-xs">
          <div>
            <span className="font-semibold text-foreground">Execution Run Target</span>
            <p className="text-[11px] text-muted-foreground">
              {selectedVersionId
                ? `Running published v${versions.find((v) => v.id === selectedVersionId)?.versionNumber ?? "?"}`
                : "Running latest working draft"}
            </p>
          </div>
          {selectedVersionId && (
            <button
              type="button"
              onClick={() => onSelectVersionId(null)}
              className="rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Reset to Draft
            </button>
          )}
        </div>

        {/* Version List */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
          <span className="text-xs text-muted-foreground">Published History ({versions.length})</span>

          {versions.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/10 p-8 text-center text-xs text-muted-foreground">
              <FileCode2 className="h-7 w-7 opacity-40 mb-1.5" />
              <p>No published versions found.</p>
            </div>
          )}

          {versions.map((ver) => {
            const isSelected = selectedVersionId === ver.id;
            return (
              <div
                key={ver.id}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border/70 bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 font-mono font-bold text-primary">
                    v{ver.versionNumber}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">Version {ver.versionNumber}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {ver.graphHash.slice(0, 10)}...
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Published {new Date(ver.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectVersionId(isSelected ? null : ver.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/70 bg-muted/40 text-foreground hover:bg-muted"
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{isSelected ? "Active Target" : "Select Target"}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/70 bg-muted/40 px-4 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
