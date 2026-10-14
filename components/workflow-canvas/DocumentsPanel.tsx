"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  FileText,
  Upload,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Database,
  FileCheck,
} from "lucide-react";
import {
  fetchProjectDocumentsApi,
  uploadProjectDocumentApi,
  deleteProjectDocumentApi,
  type ProjectDocumentItem,
} from "@/logic/workflow/api";

interface DocumentsPanelProps {
  projectId: string;
  documents: ProjectDocumentItem[];
  isOpen: boolean;
  onClose: () => void;
  onDocumentsChange: (docs: ProjectDocumentItem[]) => void;
}

export function DocumentsPanel({
  projectId,
  documents,
  isOpen,
  onClose,
  onDocumentsChange,
}: DocumentsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const docs = await fetchProjectDocumentsApi(projectId);
      onDocumentsChange(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project documents.");
    } finally {
      setLoading(false);
    }
  }, [projectId, onDocumentsChange]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be uploaded again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (file.size > 1024 * 1024) {
      setError("File size exceeds 1 MB limit.");
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".md") && !lowerName.endsWith(".txt") && !lowerName.endsWith(".markdown")) {
      setError("Only Markdown (.md) and plain text (.txt) files are supported.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await uploadProjectDocumentApi(projectId, file);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccessMsg(
          res.skipped
            ? `Identical document "${file.name}" was already uploaded (skipped re-embedding).`
            : `Successfully ingested "${file.name}" (${res.document?.chunksCount ?? 0} chunks).`
        );
        await loadDocuments();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? Chunks will be deleted immediately.`)) {
      return;
    }

    setDeletingId(docId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await deleteProjectDocumentApi(projectId, docId);
      if (!res.ok) {
        setError(res.error || "Failed to delete document.");
      } else {
        setSuccessMsg(`Deleted "${filename}".`);
        await loadDocuments();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Project Knowledge Base</h2>
              <p className="text-xs text-muted-foreground">
                Documents indexed for RAG retrieval in this project (max 50 files, &le; 1 MB each).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Upload Zone */}
        <div className="mt-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-5 hover:bg-muted/40 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.markdown"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Parsing, chunking and embedding document...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <Upload className="h-6 w-6 text-muted-foreground mb-1.5" />
                <span className="text-xs font-medium text-foreground">
                  Click to upload Markdown (.md) or Text (.txt) file
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Max file size: 1 MB. Headings (#, ##) will segment chunks automatically.
                </span>
              </div>
            )}
          </label>
        </div>

        {/* Documents List */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
          <div className="flex items-center justify-between pb-1 text-xs text-muted-foreground">
            <span>Documents ({documents.length})</span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>

          {documents.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/10 p-8 text-center text-xs text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40 mb-2" />
              <p>No documents uploaded yet in this project.</p>
              <p className="mt-1 text-[11px]">Upload documents above to enable RAG retrieval.</p>
            </div>
          )}

          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-card p-3 text-xs transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{doc.filename}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                    <span>·</span>
                    <span>{doc.chunksCount} chunks</span>
                    <span>·</span>
                    <span
                      className={`font-semibold ${
                        doc.status === "READY"
                          ? "text-emerald-500"
                          : doc.status === "FAILED"
                          ? "text-destructive"
                          : "text-amber-500"
                      }`}
                    >
                      {doc.status}
                    </span>
                    {doc.error && <span className="text-destructive truncate">({doc.error})</span>}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(doc.id, doc.filename)}
                disabled={deletingId === doc.id}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                title="Delete document"
              >
                {deletingId === doc.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/70 bg-muted/40 px-4 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
