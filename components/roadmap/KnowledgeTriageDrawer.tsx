"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Layers,
  Send,
  Loader2,
  RotateCw,
} from "lucide-react";
import {
  fetchTriageItems,
  generateTriageDraft,
  approveTriageDraft,
  dismissTriageItem,
  type TriageItem,
} from "@/logic/roadmap/knowledgeTriageService";

interface KnowledgeTriageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRoadmapUpdated?: () => void;
}

// Triage routes are owner-only: a visitor gets 401 instead of the list
function toErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return "Bạn cần đăng nhập bằng tài khoản owner để xem và xử lý triage.";
  if (error instanceof Error && error.message) return error.message;
  return "Đã có lỗi xảy ra, vui lòng thử lại.";
}

export function KnowledgeTriageDrawer({
  isOpen,
  onClose,
  onRoadmapUpdated,
}: KnowledgeTriageDrawerProps) {
  const [items, setItems] = useState<TriageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "DRAFTED" | "APPROVED">("ALL");
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTriageItems();
      setItems(data);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

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
      const { triage } = await approveTriageDraft(id);
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

  const filteredItems = items.filter((item) => {
    if (filter === "ALL") return true;
    return item.status === filter;
  });

  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="fixed inset-0 z-[99999] flex justify-end bg-black/30 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex h-full w-[480px] max-w-[90vw] flex-col border-l border-[#E6E4DF] bg-[#FFFFFF] text-[#1F1E1C] shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E4DF] px-5 py-4 bg-[#FFFFFF]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F3F0] border border-[#E6E4DF] text-[#C2410C]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-[#1F1E1C]">
                  Knowledge Triage
                </h2>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-[#FBEDE5] px-2 py-0.5 text-[10px] font-semibold text-[#C2410C] border border-[#C2410C]/20">
                    {pendingCount} cần xử lý
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6B6862]">
                Lỗ hổng tri thức từ phản hồi & Agent Admin kiểm duyệt
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={loadData}
              title="Làm mới"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Đóng"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 border-b border-[#E6E4DF] px-5 py-2.5 bg-[#FFFFFF]">
          {(["ALL", "PENDING", "DRAFTED", "APPROVED"] as const).map((key) => {
            const labels = {
              ALL: "Tất cả",
              PENDING: "Cần tạo draft",
              DRAFTED: "Chờ duyệt",
              APPROVED: "Đã publish",
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                  filter === key
                    ? "bg-[#1F1E1C] text-white font-medium"
                    : "text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
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
            className="flex items-start gap-2 border-b border-[#C2410C]/20 bg-[#FBEDE5] px-5 py-2.5 text-xs text-[#C2410C]"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* List of Triage Cards */}
        <div className="flex-1 space-y-3.5 overflow-y-auto p-5 bg-[#FFFFFF]">
          {error && items.length === 0 ? null : isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#6B6862]">
              <Loader2 className="h-6 w-6 animate-spin text-[#C2410C] mb-2" />
              <span className="text-xs">Đang tải danh sách triage...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[#6B6862]">
              <CheckCircle2 className="h-8 w-8 text-[#3F7D58] mb-2" />
              <span className="text-xs font-medium text-[#1F1E1C]">Không có mục nào cần xử lý</span>
              <span className="text-[11px] text-[#6B6862] mt-0.5">
                Các kiến thức bị thiếu sẽ tự động xuất hiện khi người dùng bấm Unlike.
              </span>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isActionLoading = actionLoadingId === item.id;
              const isExpanded = expandedDraftId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] transition-all hover:border-[#D1CECB]"
                >
                  {/* Card Header: Query & Reason Chip */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#1F1E1C] leading-snug">
                        {item.query}
                      </div>
                      {item.comment && (
                        <div className="mt-1.5 rounded-md bg-[#F4F3F0] border border-[#E6E4DF] px-2.5 py-1.5 text-xs text-[#6B6862] italic">
                          &ldquo;{item.comment}&rdquo;
                        </div>
                      )}
                    </div>
                    {item.reason && (
                      <span className="shrink-0 rounded-md bg-[#FBEDE5] px-2 py-0.5 text-[10px] font-medium text-[#C2410C] border border-[#C2410C]/20">
                        {item.reason}
                      </span>
                    )}
                  </div>

                  {/* Status: PENDING */}
                  {item.status === "PENDING" && (
                    <div className="mt-3.5 flex items-center justify-between border-t border-[#E6E4DF]/60 pt-3">
                      <span className="text-[11px] text-[#6B6862]">Chưa có bài học bổ sung</span>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => handleGenerate(item.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {isActionLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span>Agent Tạo Draft & Verify</span>
                      </button>
                    </div>
                  )}

                  {/* Status: DRAFTED (Agent Admin Verified) */}
                  {item.status === "DRAFTED" && (
                    <div className="mt-3 space-y-2.5 border-t border-[#E6E4DF]/60 pt-3">
                      {/* Agent Admin Review Box */}
                      <div className="rounded-lg border border-[#3F7D58]/30 bg-[#F4F9F6] p-2.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-[#3F7D58]">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Agent Admin Kiểm Duyệt</span>
                          </span>
                          <span className="rounded bg-[#FFFFFF] px-1.5 py-0.5 text-[10px] font-bold border border-[#3F7D58]/20">
                            {item.verifyScore || 95}/100 Điểm
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-[#1F1E1C]/80 leading-relaxed">
                          {item.verifyNote}
                        </div>
                      </div>

                      {/* Draft Summary */}
                      <div className="rounded-lg border border-[#E6E4DF] bg-[#F4F3F0] p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#1F1E1C]">
                            {item.draftTitle}
                          </span>
                          <span className="text-[10px] text-[#6B6862] font-mono">
                            Layer {item.layerTag || "01-CORE"} • {item.level}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedDraftId(isExpanded ? null : item.id)}
                          className="mt-1.5 flex items-center gap-1 text-[11px] text-[#C2410C] hover:underline cursor-pointer"
                        >
                          <span>{isExpanded ? "Thu gọn nội dung" : "Xem trước nội dung chi tiết"}</span>
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {/* Collapsible Content */}
                      {isExpanded && item.draftContent && (
                        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] p-3 text-xs leading-relaxed text-[#1F1E1C] font-mono">
                          {item.draftContent}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleDismiss(item.id)}
                          className="rounded-md px-2.5 py-1.5 text-xs text-[#6B6862] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] cursor-pointer"
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
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          <span>Phê duyệt & Publish</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status: APPROVED */}
                  {item.status === "APPROVED" && (
                    <div className="mt-3 flex items-center justify-between border-t border-[#E6E4DF]/60 pt-2 text-xs">
                      <span className="flex items-center gap-1.5 text-[#3F7D58] font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Đã publish vào Roadmap & RAG đồng bộ</span>
                      </span>
                      <span className="text-[10px] text-[#6B6862]">
                        {item.draftTitle}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
