'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Loader2,
  RotateCw,
  Trash2,
  Download,
} from 'lucide-react';
import {
  fetchTriageItems,
  importTriageFromLangfuse,
  fetchGoldenSetStatus,
  type GoldenSetStatus,
  generateTriageDraft,
  approveTriageDraft,
  dismissTriageItem,
  deleteTriageItem,
  type TriageItem,
} from '@/logic/roadmap/knowledgeTriageService';
import { GoldenSetStatusCard } from './GoldenSetStatusCard';
import { Sheet } from '@/components/ui/sheet';
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from '@/hooks/use-media-query';

interface KnowledgeTriageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRoadmapUpdated?: () => void;
}

// Triage routes are owner-only: a visitor gets 401 instead of the list
function toErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return 'Bạn cần đăng nhập bằng tài khoản owner để xem và xử lý triage.';
  if (error instanceof Error && error.message) return error.message;
  return 'Đã có lỗi xảy ra, vui lòng thử lại.';
}

export function KnowledgeTriageDrawer({
  isOpen,
  onClose,
  onRoadmapUpdated,
}: KnowledgeTriageDrawerProps) {
  const isMobile = useMediaQuery(MOBILE_VIEWPORT_QUERY);
  const [items, setItems] = useState<TriageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'DRAFTED' | 'APPROVED'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Target group typed per draft; falls back to the draft's own groupTitle (ADR-0008)
  const [groupTitles, setGroupTitles] = useState<Record<string, string>>({});
  const [goldenSet, setGoldenSet] = useState<GoldenSetStatus | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchTriageItems();
      setItems(data);
      // Secondary: a failure here hides the card, it does not block the list
      setGoldenSet(await fetchGoldenSetStatus().catch(() => null));
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void Promise.resolve().then(async () => {
        setIsLoading(true);
        await loadData();
        setIsLoading(false);
      });
    }
  }, [isOpen, loadData]);

  // 👎 votes live in Langfuse: pulls the ones not imported yet into the triage list
  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    setNotice(null);
    try {
      const { imported, remaining } = await importTriageFromLangfuse();
      setNotice(
        `Đã nhập ${imported} phản hồi 👎 từ Langfuse` +
          (remaining > 0 ? `, còn ${remaining}: bấm nhập tiếp.` : '.')
      );
      await loadData();
      window.dispatchEvent(new CustomEvent('roadmap:triage-updated'));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadData();
    setIsLoading(false);
  };

  const handleGenerate = async (id: string) => {
    setActionLoadingId(id);
    setError(null);
    try {
      const updated = await generateTriageDraft(id);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setExpandedDraftId(id);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    setError(null);
    try {
      const draft = items.find((i) => i.id === id);
      const groupTitle = (groupTitles[id] ?? draft?.groupTitle ?? '').trim();
      const { triage } = await approveTriageDraft(id, groupTitle || undefined);
      setItems((prev) => prev.map((item) => (item.id === id ? triage : item)));
      if (onRoadmapUpdated) {
        onRoadmapUpdated();
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActionLoadingId(id);
    setError(null);
    try {
      await dismissTriageItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xoá vĩnh viễn feedback này? Không thể hoàn tác.')) return;
    setActionLoadingId(id);
    setError(null);
    try {
      await deleteTriageItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'ALL') return true;
    return item.status === filter;
  });

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      side={isMobile ? 'bottom' : 'right'}
      label="Knowledge Triage"
      className={isMobile ? 'max-h-[90dvh]' : 'w-[480px] max-w-[90vw]'}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-card">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted border border-border text-[#C2410C]">
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Knowledge Triage (Draft set data)
              </h2>
              {pendingCount > 0 && (
                <span className="rounded-full bg-[#FBEDE5] dark:bg-[#C2410C]/20 px-2 py-0.5 text-[0.625rem] font-semibold text-[#C2410C] border border-[#C2410C]/20">
                  {pendingCount} cần xử lý
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Lỗ hổng tri thức từ phản hồi & Agent Admin kiểm duyệt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting}
            title="Nhập 👎 từ Langfuse"
            aria-label="Nhập 👎 từ Langfuse"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            title="Làm mới"
            aria-label="Làm mới"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <RotateCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {goldenSet && <GoldenSetStatusCard status={goldenSet} />}

      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 border-b border-border px-5 py-2.5 bg-card">
        {(['ALL', 'PENDING', 'DRAFTED', 'APPROVED'] as const).map((key) => {
          const labels = {
            ALL: 'Tất cả',
            PENDING: 'Cần tạo draft',
            DRAFTED: 'Chờ duyệt',
            APPROVED: 'Đã publish',
          };
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                filter === key
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {labels[key]}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-[#C2410C]/20 bg-[#FBEDE5] dark:bg-[#C2410C]/20 px-5 py-2.5 text-xs text-[#C2410C]"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="border-b border-border bg-[#E6F1EA] dark:bg-[#3F7D58]/20 px-5 py-2.5 text-xs text-[#3F7D58]">
          {notice}
        </div>
      )}

      {/* List of Triage Cards */}
      <div className="flex-1 space-y-3.5 overflow-y-auto p-5 bg-card">
        {error && items.length === 0 ? null : isLoading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-[#C2410C] mb-2" />
            <span className="text-xs">Đang tải danh sách triage...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <CheckCircle2 className="size-8 text-[#3F7D58] mb-2" />
            <span className="text-xs font-medium text-foreground">Không có mục nào cần xử lý</span>
            <span className="text-xs text-muted-foreground mt-0.5">
              Bấm nút nhập để lấy các câu trả lời bị 👎 từ Langfuse.
            </span>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isActionLoading = actionLoadingId === item.id;
            const isExpanded = expandedDraftId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-border/80"
              >
                {/* Card Header: Query & Reason Chip */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground leading-snug">
                      {item.query}
                    </div>
                    {item.comment && (
                      <div className="mt-1.5 rounded-md bg-muted/50 border border-border px-2.5 py-1.5 text-xs text-muted-foreground italic">
                        &ldquo;{item.comment}&rdquo;
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.reason && (
                      <span className="rounded-md bg-[#FBEDE5] dark:bg-[#C2410C]/20 px-2 py-0.5 text-[0.625rem] font-medium text-[#C2410C] border border-[#C2410C]/20">
                        {item.reason}
                      </span>
                    )}
                    {(item.status === 'PENDING' || item.status === 'DRAFTED') && (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => handleDelete(item.id)}
                        title="Xoá feedback"
                        aria-label="Xoá feedback"
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-[#FBEDE5] hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status: PENDING */}
                {item.status === 'PENDING' && (
                  <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-3">
                    <span className="text-xs text-muted-foreground">Chưa có bài học bổ sung</span>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() => handleGenerate(item.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {isActionLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      <span>Agent Tạo Draft & Verify</span>
                    </button>
                  </div>
                )}

                {/* Status: DRAFTED (Agent Admin Verified) */}
                {item.status === 'DRAFTED' && (
                  <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
                    {/* Agent Admin Review Box */}
                    <div className="rounded-lg border border-[#3F7D58]/30 bg-[#F4F9F6] dark:bg-[#3F7D58]/10 p-2.5 text-xs">
                      <div className="flex items-center justify-between font-semibold text-[#3F7D58]">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-3.5" />
                          <span>Agent Admin Kiểm Duyệt</span>
                        </span>
                        <span className="rounded bg-card px-1.5 py-0.5 text-[0.625rem] font-bold border border-[#3F7D58]/20">
                          {item.verifyScore || 95}/100 Điểm
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-foreground/80 leading-relaxed">
                        {item.verifyNote}
                      </div>
                    </div>

                    {/* Draft Summary */}
                    <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">
                          {item.draftTitle}
                        </span>
                        <span className="text-[0.625rem] text-muted-foreground font-mono">
                          Layer {item.layerTag || '01-CORE'}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={groupTitles[item.id] ?? item.groupTitle ?? ''}
                        onChange={(e) => setGroupTitles((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Group (bỏ trống nếu layer chỉ có 1 group)"
                        aria-label="Target group"
                        className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-[#C2410C]"
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedDraftId(isExpanded ? null : item.id)}
                        className="mt-1.5 flex items-center gap-1 text-xs text-[#C2410C] hover:underline cursor-pointer"
                      >
                        <span>{isExpanded ? 'Thu gọn nội dung' : 'Xem trước nội dung chi tiết'}</span>
                        <ChevronDown
                          className={`size-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    {/* Collapsible Content */}
                    {isExpanded && item.draftContent && (
                      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground font-mono">
                        {item.draftContent}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => handleDismiss(item.id)}
                        className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        Bỏ qua
                      </button>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => handleApprove(item.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-[#3F7D58] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {isActionLoading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        <span>Phê duyệt & Publish</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Status: APPROVED */}
                {item.status === 'APPROVED' && (
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                    <span className="flex items-center gap-1.5 text-[#3F7D58] font-medium">
                      <CheckCircle2 className="size-3.5" />
                      <span>Đã publish vào Roadmap & RAG đồng bộ</span>
                    </span>
                    <span className="text-[0.625rem] text-muted-foreground">
                      {item.draftTitle}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
