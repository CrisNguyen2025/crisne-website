"use client";

import React, { useState, useEffect } from "react";
import {
  Compass,
  ArrowRight,
  BookOpen,
  Sparkles,
  Plus,
  HardDrive,
  Trash2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { RoadmapMeta, CreateRoadmapDto } from "@/lib/roadmap/types";
import { useToast } from "@/components/ui/toast";
import { Popconfirm } from "antd";
import { CreateTopicModal } from "./CreateTopicModal";
import {
  fetchStorageScan,
  triggerCleanupUnused,
  formatBytes,
  getCachedStorageScan,
  StorageScanResult,
} from "@/logic/storage/storageService";

interface HomeDashboardProps {
  roadmaps: RoadmapMeta[];
  isLoading?: boolean;
  onSelectRoadmap: (slug: string) => void;
  onCreateRoadmap: (payload: CreateRoadmapDto) => Promise<void>;
  isCreateModalOpen?: boolean;
  onOpenCreateModal?: () => void;
  onCloseCreateModal?: () => void;
}

export function HomeDashboard({
  roadmaps,
  isLoading = false,
  onSelectRoadmap,
  onCreateRoadmap,
  isCreateModalOpen: controlledIsOpen,
  onOpenCreateModal: controlledOnOpen,
  onCloseCreateModal: controlledOnClose,
}: HomeDashboardProps) {
  const { toast } = useToast();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [storageScan, setStorageScan] = useState<StorageScanResult | null>(() =>
    getCachedStorageScan()
  );
  const [isCleaning, setIsCleaning] = useState(false);

  const loadScan = () => {
    fetchStorageScan()
      .then((data) => setStorageScan(data))
      .catch((err) => console.error("Failed to fetch storage scan:", err));
  };

  useEffect(() => {
    loadScan();
  }, []);

  const handleCleanup = async () => {
    setIsCleaning(true);
    const count = storageScan?.unusedFiles.length || 0;
    try {
      await triggerCleanupUnused();
      const updated = await fetchStorageScan();
      setStorageScan(updated);
      toast(`Cleaned up ${count} unused file(s) successfully`, "success");
    } catch (err) {
      console.error("Failed to clean up unused files:", err);
      toast("Failed to clean up unused files. Please try again.", "error");
    } finally {
      setIsCleaning(false);
    }
  };

  const isModalOpen =
    controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const openModal = controlledOnOpen || (() => setInternalIsOpen(true));
  const closeModal = controlledOnClose || (() => setInternalIsOpen(false));

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-white/55 p-6 md:p-12 space-y-10 select-none">
      {/* ── Top Hero Banner centered ─────────────── */}
      <div className="w-full flex flex-col items-center text-center space-y-3 pb-8 border-b border-border/50">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Knowledge & Architecture Hub</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-3xl">
          Architecture Roadmaps & Topics
        </h1>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Structured system blueprints, engineering patterns, and comprehensive
          production guides across domains.
        </p>
      </div>

      {/* ── Available Topics Grid (Full Width) ───────────────────────────────────── */}
      <div className="w-full space-y-4">
        {/* Header row: Active Roadmaps on the left, Create Topic + Storage Tracker on the right */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" />
            <span>
              Active Roadmaps{" "}
              {isLoading && roadmaps.length === 0
                ? "…"
                : `(${roadmaps.length})`}
            </span>
          </h2>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={openModal}
              className="h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Topic</span>
            </button>

            {/* 1-Line Storage Usage & Upload Limit Tracker (unified h-8 & rounded-xl size) */}
            {!storageScan ? (
              <div className="h-8 w-48 rounded-xl bg-muted/40 border border-border/40 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent shrink-0" />
            ) : (
              <div className="h-8 inline-flex items-center gap-2 px-3 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground transition-all duration-300 hover:border-border shadow-2xs animate-in fade-in shrink-0">
                <div
                  className="flex items-center gap-1.5 text-foreground font-semibold cursor-help"
                  title={`Max upload: ${formatBytes(storageScan.maxFileSizeBytes, 0)}/file • Storage: ${storageScan.isR2 ? "Cloudflare R2" : "Local"}`}
                >
                  <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>
                    {formatBytes(
                      storageScan.usedBytes + storageScan.unusedBytes
                    )}{" "}
                    / {formatBytes(storageScan.totalLimitBytes)}
                  </span>
                </div>

                <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/40">
                  {storageScan.totalFiles.length} file
                  {storageScan.totalFiles.length === 1 ? "" : "s"}
                </span>

                {storageScan.unusedFiles.length > 0 ? (
                  <>
                    <span className="text-border/80">•</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-500 font-medium text-[11px]">
                        {storageScan.unusedFiles.length} unused
                      </span>
                      <Popconfirm
                        title="Clear unused files?"
                        description={`Permanently delete ${storageScan.unusedFiles.length} file(s) (${formatBytes(
                          storageScan.unusedBytes
                        )})?`}
                        onConfirm={handleCleanup}
                        okText="Clear Unused"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true, size: "small", loading: isCleaning }}
                        cancelButtonProps={{ size: "small", disabled: isCleaning }}
                        icon={<Trash2 className="w-4 h-4 text-rose-500 mr-1.5 shrink-0 inline-block" />}
                        placement="bottomRight"
                        zIndex={9999}
                      >
                        <button
                          type="button"
                          disabled={isCleaning}
                          className="h-5 inline-flex items-center gap-1 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold text-[10px] border border-rose-500/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          title="Clean up orphaned files"
                        >
                          {isCleaning ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Clear</span>
                        </button>
                      </Popconfirm>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-border/80">•</span>
                    <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>All clean</span>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading && roadmaps.length === 0 ? (
            <>
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl border border-border/60 bg-card/60 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent flex flex-col justify-between gap-4 h-[190px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-muted/60" />
                      <div className="w-20 h-3 rounded bg-muted/40" />
                    </div>
                    <div className="w-3/4 h-5 rounded-lg bg-muted/70" />
                    <div className="w-full h-3 rounded bg-muted/40" />
                    <div className="w-2/3 h-3 rounded bg-muted/30" />
                  </div>
                  <div className="pt-3 border-t border-border/30 flex items-center justify-between">
                    <div className="w-24 h-3 rounded bg-muted/40" />
                    <div className="w-12 h-3 rounded bg-muted/30" />
                  </div>
                </div>
              ))}
            </>
          ) : (
            roadmaps.map((r) => {
              const code = (
                r.shortCode || r.slug.substring(0, 2)
              ).toUpperCase();

              return (
                <div
                  key={r.slug}
                  onClick={() => onSelectRoadmap(r.slug)}
                  className="group relative p-6 rounded-2xl border border-border/70 bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`w-10 h-10 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center p-1 border border-primary/20 shrink-0 text-center truncate ${
                          code.length <= 2
                            ? "text-sm"
                            : code.length === 3
                              ? "text-xs"
                              : "text-[10px]"
                        }`}
                        title={code}
                      >
                        {code}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                        Open workspace
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.description ||
                        "Explore architecture patterns, core foundations, and checklist items."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3 text-muted-foreground/70" />
                      Interactive View
                    </span>
                    <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[10px]">
                      {r.slug}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Modal for Creating New Topic ────────────────────────────── */}
      <CreateTopicModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={onCreateRoadmap}
      />
    </div>
  );
}
