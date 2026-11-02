'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  ArrowRight,
  Layers,
  Sparkles,
  Plus,
  HardDrive,
  Trash2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { RoadmapMeta } from '@/lib/roadmap/types';
import { useToast } from '@/components/ui/toast';
import { ConfirmPopover } from '@/components/ui/confirm-popover';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCanWrite } from '@/hooks/use-can-write';
import {
  fetchStorageScan,
  triggerCleanupUnused,
  formatBytes,
  getCachedStorageScan,
  StorageScanResult,
} from '@/logic/storage/storageService';

interface HomeDashboardProps {
  roadmaps: RoadmapMeta[];
  isLoading?: boolean;
  onSelectRoadmap: (slug: string) => void;
  onOpenCreateModal: () => void;
}

export function HomeDashboard({
  roadmaps,
  isLoading = false,
  onSelectRoadmap,
  onOpenCreateModal,
}: HomeDashboardProps) {
  const { toast } = useToast();
  const [storageScan, setStorageScan] = useState<StorageScanResult | null>(() => getCachedStorageScan());
  const [isCleaning, setIsCleaning] = useState(false);
  const canWrite = useCanWrite();

  const loadScan = () => {
    fetchStorageScan()
      .then((data) => setStorageScan(data))
      .catch((err) => console.error('Failed to fetch storage scan:', err));
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
      toast(`Cleaned up ${count} unused file(s) successfully`, 'success');
    } catch (err) {
      console.error('Failed to clean up unused files:', err);
      toast('Failed to clean up unused files. Please try again.', 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-background p-4 sm:p-6 md:p-12 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] md:pb-12 space-y-6 sm:space-y-10 select-none">
      {/* ── Top Hero Banner centered ─────────────── */}
      <div className="w-full flex flex-col items-center text-center space-y-3 pb-6 sm:pb-8 border-b border-border/50">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <Sparkles className="size-3.5" />
          <span>Knowledge & Architecture Hub</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-3xl">
          Architecture Roadmaps & Topics
        </h1>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Structured system blueprints, engineering patterns, and comprehensive production guides across domains.
        </p>
      </div>

      {/* ── Available Topics Grid (Full Width) ───────────────────────────────────── */}
      <div className="w-full space-y-4">
        {/* Header row: Active Roadmaps on the left, Create Topic + Storage Tracker on the right */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Compass className="size-4 text-primary" />
            <span>Active Roadmaps {isLoading && roadmaps.length === 0 ? '…' : `(${roadmaps.length})`}</span>
          </h2>

          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            {/* Creating topics and the storage tracker are for the owner; the APIs check it again */}
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="size-4 stroke-[2.5]" />
                  <span>Create Topic</span>
                </button>

                {/* 1-Line Storage Usage & Upload Limit Tracker */}
                {!storageScan ? (
                  <div className="h-8 w-48 rounded-xl bg-muted/40 border border-border/40 shrink-0" />
                ) : (
                  <div className="h-8 inline-flex max-w-full items-center gap-2 px-3 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground transition-colors hover:border-border shadow-2xs animate-in fade-in">
                    <div
                      className="flex items-center gap-1.5 text-foreground font-semibold cursor-help"
                      title={`Max upload: ${formatBytes(storageScan.maxFileSizeBytes, 0)}/file • Storage: ${
                        storageScan.isR2 ? 'Cloudflare R2' : 'Local'
                      }`}
                    >
                      <HardDrive className="size-3.5 text-primary shrink-0" />
                      <span>
                        {formatBytes(storageScan.usedBytes + storageScan.unusedBytes)} /{' '}
                        {formatBytes(storageScan.totalLimitBytes)}
                      </span>
                    </div>

                    <span className="hidden sm:inline text-[0.625rem] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/40">
                      {storageScan.totalFiles.length} file{storageScan.totalFiles.length === 1 ? '' : 's'}
                    </span>

                    {storageScan.unusedFiles.length > 0 ? (
                      <>
                        <span className="text-border/80">•</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-500 font-medium text-xs">
                            {storageScan.unusedFiles.length} unused
                          </span>
                          <ConfirmPopover
                            title="Clear unused files?"
                            description={`Permanently delete ${storageScan.unusedFiles.length} file(s) (${formatBytes(
                              storageScan.unusedBytes
                            )})?`}
                            confirmLabel="Clear Unused"
                            onConfirm={handleCleanup}
                          >
                            <button
                              type="button"
                              disabled={isCleaning}
                              className="h-5 inline-flex items-center gap-1 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold text-[0.625rem] border border-rose-500/30 transition-colors cursor-pointer disabled:opacity-50"
                              title="Clean up orphaned files"
                            >
                              {isCleaning ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                              <span>Clear</span>
                            </button>
                          </ConfirmPopover>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-border/80">•</span>
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-xs">
                          <CheckCircle2 className="size-3.5" />
                          <span>All clean</span>
                        </span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <ThemeToggle className="h-8 w-8 rounded-xl border border-border/60 bg-card hover:bg-muted/80 text-foreground shadow-2xs" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading && roadmaps.length === 0 ? (
            <>
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl border border-border/60 bg-card/60 flex flex-col justify-between gap-4 h-[190px]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="size-10 rounded-xl bg-muted/60" />
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
              const code = (r.shortCode || r.slug.substring(0, 2)).toUpperCase();
              const layerCount = r._count?.layers;

              return (
                <div
                  key={r.slug}
                  onClick={() => onSelectRoadmap(r.slug)}
                  className="group relative p-5 sm:p-6 rounded-2xl border border-border/70 bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99] transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`size-10 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center p-1 border border-primary/20 shrink-0 text-center truncate ${
                          code.length <= 2 ? 'text-sm' : code.length === 3 ? 'text-xs' : 'text-[0.625rem]'
                        }`}
                        title={code}
                      >
                        {code}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                        Open workspace
                        <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.description || 'Explore architecture patterns, core foundations, and checklist items.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Layers className="size-3 text-muted-foreground/70" />
                      {typeof layerCount === 'number'
                        ? `${layerCount} ${layerCount === 1 ? 'layer' : 'layers'}`
                        : 'Interactive View'}
                    </span>
                    <span className="font-semibold text-foreground/80 uppercase tracking-wider text-[0.625rem]">
                      {r.slug}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
