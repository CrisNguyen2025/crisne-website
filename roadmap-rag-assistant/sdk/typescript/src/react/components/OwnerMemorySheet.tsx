import React, { useEffect, useMemo, useRef, useState } from "react";
import { RoadmapChatClient } from "../../client";
import type {
  OwnerMemoryItem,
  OwnerMemoryKind,
  OwnerMemorySource,
  UpdateOwnerMemoryInput,
} from "../../types";
import {
  AlertTriangleIcon,
  CloseIcon,
  MemoryIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
} from "../icons";
import { useOwnerMemories } from "../useOwnerMemories";
import {
  KIND_LABEL,
  KIND_OPTIONS,
  MAX_PENDING_MEMORIES,
  MemoryComposerForm,
  MemoryEditForm,
  MemorySettingsDrawer,
  ONBOARDING_TEMPLATES,
  PromoteMemoryPanel,
  RowActionButtons,
  UndoMemoryBanner,
} from "./OwnerMemorySections";
import { AbotDialog, useAbotDialogClose } from "./AbotDialog";

type RovoTab = "observations" | "explicit";

const SOURCE_BADGE: Partial<Record<OwnerMemorySource, string>> = {
  observed: "Tự quan sát",
  suggested: "Gợi ý",
};

interface UndoActionState {
  message: string;
  apply: () => Promise<void>;
}

interface MemoryRowCardProps {
  item: OwnerMemoryItem;
  mode: "pending" | "observed" | "explicit" | "archived";
  activeItems: OwnerMemoryItem[];
  currentTopicSlug?: string;
  client: RoadmapChatClient;
  isEditing: boolean;
  isPromoting: boolean;
  isSaving: boolean;
  editKind: OwnerMemoryKind;
  editContent: string;
  editScopeTopicSlug: string | null;
  onEditKindChange: (kind: OwnerMemoryKind) => void;
  onEditContentChange: (content: string) => void;
  onEditScopeChange: (scope: string | null) => void;
  onStartEdit: (item: OwnerMemoryItem) => void;
  onSaveEdit: (item: OwnerMemoryItem) => void;
  onCancelEdit: () => void;
  onStartPromote: (item: OwnerMemoryItem) => void;
  onCancelPromote: () => void;
  onApprove: (item: OwnerMemoryItem) => void;
  onReject: (item: OwnerMemoryItem) => void;
  onArchive: (id: string) => Promise<boolean>;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function MemoryRowCard({
  item,
  mode,
  activeItems,
  currentTopicSlug,
  client,
  isEditing,
  isPromoting,
  isSaving,
  editKind,
  editContent,
  editScopeTopicSlug,
  onEditKindChange,
  onEditContentChange,
  onEditScopeChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onStartPromote,
  onCancelPromote,
  onApprove,
  onReject,
  onArchive,
  onRestore,
  onDelete,
}: MemoryRowCardProps) {
  const scopeOptions = useMemo(() => {
    const slugs = new Set<string>();
    if (currentTopicSlug) slugs.add(currentTopicSlug);
    if (item.scopeTopicSlug) slugs.add(item.scopeTopicSlug);
    return Array.from(slugs);
  }, [currentTopicSlug, item.scopeTopicSlug]);

  const replaced =
    mode === "pending" && item.replacesMemoryId
      ? activeItems.find((a) => a.id === item.replacesMemoryId)
      : undefined;

  const sourceLabel = item.evidenceSnippet?.startsWith("Quiz ")
    ? "Từ Quiz"
    : SOURCE_BADGE[item.source];

  return (
    <li className="rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-2.5 text-xs text-[#1F1E1C]">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-[#F4F3F0] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[#4D4B46]">
          {KIND_LABEL[item.kind] ?? item.kind}
        </span>
        <span className="rounded-md bg-[#F4F3F0]/70 px-1.5 py-0.5 text-[0.625rem] text-[#5E5B55]">
          {item.scopeTopicSlug ? `topic: ${item.scopeTopicSlug}` : "Toàn cục"}
        </span>
        {sourceLabel && mode !== "explicit" && (
          <span className="rounded-md bg-[#EEF5F0] px-1.5 py-0.5 text-[0.625rem] font-medium text-[#3F7D58]">
            {sourceLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <RowActionButtons
            item={item}
            mode={mode}
            isEditing={isEditing}
            isSaving={isSaving}
            editContent={editContent}
            onSaveEdit={() => onSaveEdit(item)}
            onCancelEdit={onCancelEdit}
            onStartEdit={onStartEdit}
            onStartPromote={onStartPromote}
            onApprove={onApprove}
            onReject={onReject}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        </div>
      </div>

      {isEditing ? (
        <MemoryEditForm
          editKind={editKind}
          onEditKindChange={onEditKindChange}
          editScopeTopicSlug={editScopeTopicSlug}
          onEditScopeChange={onEditScopeChange}
          scopeOptions={scopeOptions}
          editContent={editContent}
          onEditContentChange={onEditContentChange}
        />
      ) : (
        <>
          <p className="leading-relaxed text-[#1F1E1C]">{item.content}</p>
          {item.evidenceSnippet && mode !== "explicit" && (
            <p className="mt-1 text-[0.6875rem] leading-4 text-[#8A8780]">
              Nguồn: “{item.evidenceSnippet}”
            </p>
          )}
          {mode === "pending" && item.replacesMemoryId && (
            <p className="mt-1 rounded-md bg-[#FAF3E8] px-2 py-1 text-[0.6875rem] leading-4 text-[#8A4B08]">
              Thay thế: {replaced ? `“${replaced.content}”` : "một mục đang bật trước đó"}
            </p>
          )}
        </>
      )}

      {isPromoting && (
        <PromoteMemoryPanel
          client={client}
          item={item}
          currentTopicSlug={currentTopicSlug}
          isParentSaving={isSaving}
          onArchiveMemory={onArchive}
          onCancel={onCancelPromote}
        />
      )}
    </li>
  );
}

export interface OwnerMemorySheetProps {
  baseUrl: string;
  currentTopicSlug?: string;
  zIndex?: number;
  onPendingCountChange?: (count: number) => void;
  onClose: () => void;
}

function OwnerMemoryContent({
  baseUrl,
  currentTopicSlug,
  onPendingCountChange,
  onClose,
}: Omit<OwnerMemorySheetProps, "zIndex">) {
  const requestClose = useAbotDialogClose(onClose);
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const {
    activeItems,
    pendingItems,
    archivedItems,
    settings,
    isLoading,
    isLoadingArchived,
    isSaving,
    isRefreshingObservations,
    error,
    refresh,
    loadArchived,
    create: onCreate,
    update: onUpdate,
    remove: onDelete,
    updateSettings,
    clearAll,
    refreshObservations,
    logActivityEvent,
  } = useOwnerMemories(baseUrl);

  const [tab, setTab] = useState<RovoTab>("observations");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | OwnerMemoryKind>("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "topic">("all");
  const [kind, setKind] = useState<OwnerMemoryKind>("preference");
  const [scope, setScope] = useState<"global" | "topic">("global");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editKind, setEditKind] = useState<OwnerMemoryKind>("preference");
  const [editScopeTopicSlug, setEditScopeTopicSlug] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoActionState | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    void refresh().then(() => {
      hasLoadedOnceRef.current = true;
    });
  }, [refresh]);

  useEffect(() => {
    if (hasLoadedOnceRef.current && !isLoading) {
      onPendingCountChange?.(pendingItems.length);
    }
  }, [isLoading, pendingItems.length, onPendingCountChange]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const showUndo = (message: string, apply: () => Promise<void>) => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoState({ message, apply });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoState(null);
      undoTimerRef.current = null;
    }, 7000);
  };

  const explicitActiveItems = useMemo(
    () => activeItems.filter((item) => item.source === "explicit"),
    [activeItems]
  );

  const observedActiveItems = useMemo(
    () => activeItems.filter((item) => item.source !== "explicit"),
    [activeItems]
  );

  const filteredExplicitItems = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return explicitActiveItems.filter((item) => {
      if (kindFilter && item.kind !== kindFilter) return false;
      if (scopeFilter === "global" && item.scopeTopicSlug !== null) return false;
      if (scopeFilter === "topic" && item.scopeTopicSlug !== currentTopicSlug) return false;
      if (!needle) return true;
      const hay = `${item.content} ${item.scopeTopicSlug ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [explicitActiveItems, searchQuery, kindFilter, scopeFilter, currentTopicSlug]);

  const filteredArchivedItems = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return archivedItems;
    return archivedItems.filter((item) => item.content.toLowerCase().includes(needle));
  }, [archivedItems, searchQuery]);

  const handleSelectTab = (nextTab: RovoTab) => {
    setTab(nextTab);
    setEditingId(null);
    setPromotingId(null);
  };

  const handleToggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    setEditingId(null);
    setPromotingId(null);
    if (next) {
      void loadArchived();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || isSaving) return;
    const ok = await onCreate({
      kind,
      content,
      scopeTopicSlug: scope === "topic" && currentTopicSlug ? currentTopicSlug : null,
    });
    if (ok) {
      setDraft("");
      setIsComposerOpen(false);
    }
  };

  const startEdit = (item: OwnerMemoryItem) => {
    setPromotingId(null);
    setEditingId(item.id);
    setEditContent(item.content);
    setEditKind(item.kind);
    setEditScopeTopicSlug(item.scopeTopicSlug ?? null);
  };

  const saveEdit = async (item: OwnerMemoryItem) => {
    const content = editContent.trim();
    if (!content || isSaving) return;
    const prevSnapshot: UpdateOwnerMemoryInput = {
      kind: item.kind,
      content: item.content,
      scopeTopicSlug: item.scopeTopicSlug,
    };
    const payload: UpdateOwnerMemoryInput = { kind: editKind, content };
    if (editScopeTopicSlug !== item.scopeTopicSlug) {
      payload.scopeTopicSlug = editScopeTopicSlug;
    }
    const ok = await onUpdate(item.id, payload);
    if (ok) {
      setEditingId(null);
      if (item.source !== "explicit") {
        void logActivityEvent({
          eventType: "memory_edited",
          topicSlug: editScopeTopicSlug,
          entityId: item.id,
          summary: content,
        });
      }
      showUndo("Đã cập nhật mục bộ nhớ.", async () => {
        await onUpdate(item.id, prevSnapshot);
      });
    }
  };

  const handleApprovePending = async (item: OwnerMemoryItem) => {
    const ok = await onUpdate(item.id, { status: "active" });
    if (ok) {
      showUndo("Đã duyệt vào bộ nhớ đang bật.", async () => {
        await onUpdate(item.id, {
          status: "pending",
          ...(item.replacesMemoryId ? { restoreReplacedId: item.replacesMemoryId } : {}),
        });
      });
    }
  };

  const handleRejectObservation = async (item: OwnerMemoryItem) => {
    const prevStatus = item.status;
    const ok = await onUpdate(item.id, { status: "archived" });
    if (ok) {
      void logActivityEvent({
        eventType: prevStatus === "pending" ? "memory_rejected" : "observation_feedback",
        topicSlug: item.scopeTopicSlug,
        entityId: item.id,
        summary: item.content,
      });
      showUndo("Đã gỡ khỏi gợi ý.", async () => {
        await onUpdate(item.id, { status: prevStatus });
      });
    }
  };

  const handleArchiveMemory = async (id: string) => onUpdate(id, { status: "archived" });

  const handleClearAll = async () => {
    const ok = await clearAll("all");
    if (ok) {
      setConfirmClear(false);
      setIsSettingsOpen(false);
    }
  };

  const openShareTab = (template?: { kind: OwnerMemoryKind; text: string }) => {
    setTab("explicit");
    setShowArchived(false);
    setIsComposerOpen(true);
    if (template) {
      setKind(template.kind);
      setDraft(template.text);
    }
  };

  const observationTotal = pendingItems.length + observedActiveItems.length;
  const lastSynthLabel = settings?.lastSynthesizedAt
    ? new Date(settings.lastSynthesizedAt).toLocaleDateString("vi-VN")
    : null;

  return (
    <>
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E6E4DF]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <MemoryIcon className="h-4 w-4 text-[#1F1E1C]" />
          <span className="text-xs font-semibold text-[#1F1E1C] sm:text-[13px]">Bộ nhớ Abot</span>
          {!settings.memoryEnabled && (
            <span className="rounded-full bg-[#FBEDE5] px-2 py-0.5 text-[0.625rem] font-medium text-[#B42318]">
              Đang tắt
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setIsSettingsOpen((prev) => !prev);
              setConfirmClear(false);
            }}
            aria-label="Cài đặt bộ nhớ"
            aria-expanded={isSettingsOpen}
            title="Cài đặt bộ nhớ"
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-7 md:w-7 ${
              isSettingsOpen ? "bg-[#F4F3F0] text-[#1F1E1C]" : ""
            }`}
          >
            <SlidersIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={requestClose}
            title="Đóng"
            aria-label="Đóng bảng bộ nhớ"
            autoFocus
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-7 md:w-7"
          >
            <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
          {error && (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#B42318]/20 bg-[#FBEDE5] px-2.5 py-1.5 text-[0.6875rem] text-[#B42318]">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="shrink-0 cursor-pointer font-semibold underline"
              >
                Thử lại
              </button>
            </div>
          )}

          {undoState && (
            <UndoMemoryBanner
              message={undoState.message}
              onUndo={() => {
                const action = undoState.apply;
                setUndoState(null);
                void action();
              }}
              onDismiss={() => setUndoState(null)}
            />
          )}

          {isSettingsOpen && (
            <MemorySettingsDrawer
              settings={settings}
              isSaving={isSaving}
              confirmClear={confirmClear}
              onToggleMemory={() => void updateSettings({ memoryEnabled: !settings.memoryEnabled })}
              onToggleAutoObserve={() =>
                void updateSettings({ autoObserveEnabled: !settings.autoObserveEnabled })
              }
              onRequestClear={() => setConfirmClear(true)}
              onConfirmClear={() => void handleClearAll()}
              onCancelClear={() => setConfirmClear(false)}
            />
          )}

          {/* Rovo Summary Banner */}
          <div className="mb-3 flex flex-col items-start gap-2 rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1F1E1C]">
                {tab === "observations" ? "Tổng hợp tự động của Abot" : "Thông tin bạn khai báo trực tiếp"}
              </p>
              <p className="mt-0.5 text-[0.6875rem] leading-4 text-[#5E5B55]">
                {tab === "observations"
                  ? `Cập nhật mỗi tuần từ hội thoại, Topic, Quiz & News.${
                      lastSynthLabel ? ` Lần cuối: ${lastSynthLabel}.` : ""
                    }`
                  : "Các quy tắc cứng và bối cảnh bạn chủ động dặn Abot luôn ghi nhớ."}
              </p>
            </div>
            {tab === "observations" && (
              <button
                type="button"
                disabled={
                  isRefreshingObservations || !settings.memoryEnabled || !settings.autoObserveEnabled
                }
                onClick={() => void refreshObservations()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] font-medium text-[#1F1E1C] hover:bg-[#F4F3F0] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshIcon className={`h-3 w-3 ${isRefreshingObservations ? "animate-spin" : ""}`} />
                <span>{isRefreshingObservations ? "Đang tổng hợp…" : "Tổng hợp lại"}</span>
              </button>
            )}
          </div>

          {/* 2 Rovo Tabs */}
          <div
            role="tablist"
            aria-label="Phân loại bộ nhớ"
            className="mb-3 flex items-center gap-4 border-b border-[#E6E4DF]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "observations"}
              onClick={() => handleSelectTab("observations")}
              className={`-mb-px cursor-pointer border-b-2 pb-2 text-xs font-medium transition-colors ${
                tab === "observations"
                  ? "border-[#1F1E1C] text-[#1F1E1C]"
                  : "border-transparent text-[#5E5B55] hover:text-[#1F1E1C]"
              }`}
            >
              Abot quan sát{observationTotal > 0 ? ` (${observationTotal})` : ""}
              {pendingItems.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97706] px-1 text-[0.625rem] font-semibold text-white">
                  {pendingItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "explicit"}
              onClick={() => handleSelectTab("explicit")}
              className={`-mb-px cursor-pointer border-b-2 pb-2 text-xs font-medium transition-colors ${
                tab === "explicit"
                  ? "border-[#1F1E1C] text-[#1F1E1C]"
                  : "border-transparent text-[#5E5B55] hover:text-[#1F1E1C]"
              }`}
            >
              Bạn chia sẻ trực tiếp ({explicitActiveItems.length})
            </button>
          </div>

          {/* Tab 1: Abot's Observations & Pending Suggestions */}
          {tab === "observations" && (
            <div className="space-y-3">
              {pendingItems.length >= MAX_PENDING_MEMORIES && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-[#D97706]/30 bg-[#FEF7EC] px-2.5 py-2 text-[0.6875rem] leading-4 text-[#8A4B08]"
                >
                  <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Hàng chờ đã chạm giới hạn {MAX_PENDING_MEMORIES}/{MAX_PENDING_MEMORIES} mục. Hãy duyệt, chỉnh sửa hoặc đánh dấu Không đúng để nhận gợi ý mới.
                  </span>
                </div>
              )}

              {isLoading ? (
                <p className="py-6 text-center text-xs text-[#5E5B55]">Đang tải quan sát…</p>
              ) : observationTotal === 0 ? (
                <div className="rounded-xl border border-[#E6E4DF] bg-[#FAF9F7]/60 px-4 py-7 text-center">
                  <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFECE6] text-[#1F1E1C]">
                    <MemoryIcon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-[#1F1E1C]">Cùng xây dựng bộ nhớ với Abot</p>
                  <p className="mx-auto mt-1 max-w-68 text-[0.6875rem] leading-4 text-[#5E5B55]">
                    Chia sẻ vài thông tin về vai trò hoặc techstack trong chat, hoặc đọc News & làm Quiz để Abot tự quan sát thói quen học tập.
                  </p>
                  <button
                    type="button"
                    onClick={() => openShareTab()}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#1F1E1C] hover:bg-[#F4F3F0]"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    <span>Chia sẻ ngay với Abot</span>
                  </button>
                </div>
              ) : (
                <>
                  {pendingItems.length > 0 && (
                    <section aria-label="Gợi ý chờ duyệt" className="space-y-2">
                      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[#8A4B08]">
                        Chờ bạn duyệt ({pendingItems.length})
                      </h3>
                      <ul className="space-y-2">
                        {pendingItems.map((item) => (
                          <MemoryRowCard
                            key={item.id}
                            item={item}
                            mode="pending"
                            activeItems={activeItems}
                            currentTopicSlug={currentTopicSlug}
                            client={client}
                            isEditing={editingId === item.id}
                            isPromoting={promotingId === item.id}
                            isSaving={isSaving}
                            editKind={editKind}
                            editContent={editContent}
                            editScopeTopicSlug={editScopeTopicSlug}
                            onEditKindChange={setEditKind}
                            onEditContentChange={setEditContent}
                            onEditScopeChange={setEditScopeTopicSlug}
                            onStartEdit={startEdit}
                            onSaveEdit={(target) => void saveEdit(target)}
                            onCancelEdit={() => setEditingId(null)}
                            onStartPromote={(target) => {
                              setEditingId(null);
                              setPromotingId((prev) => (prev === target.id ? null : target.id));
                            }}
                            onCancelPromote={() => setPromotingId(null)}
                            onApprove={(target) => void handleApprovePending(target)}
                            onReject={(target) => void handleRejectObservation(target)}
                            onArchive={handleArchiveMemory}
                            onRestore={(id) => void onUpdate(id, { status: "active" })}
                            onDelete={(id) => void onDelete(id)}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  {observedActiveItems.length > 0 && (
                    <section aria-label="Đang quan sát" className="space-y-2">
                      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[#5E5B55]">
                        Đang áp dụng từ quan sát ({observedActiveItems.length})
                      </h3>
                      <ul className="space-y-2">
                        {observedActiveItems.map((item) => (
                          <MemoryRowCard
                            key={item.id}
                            item={item}
                            mode="observed"
                            activeItems={activeItems}
                            currentTopicSlug={currentTopicSlug}
                            client={client}
                            isEditing={editingId === item.id}
                            isPromoting={promotingId === item.id}
                            isSaving={isSaving}
                            editKind={editKind}
                            editContent={editContent}
                            editScopeTopicSlug={editScopeTopicSlug}
                            onEditKindChange={setEditKind}
                            onEditContentChange={setEditContent}
                            onEditScopeChange={setEditScopeTopicSlug}
                            onStartEdit={startEdit}
                            onSaveEdit={(target) => void saveEdit(target)}
                            onCancelEdit={() => setEditingId(null)}
                            onStartPromote={(target) => {
                              setEditingId(null);
                              setPromotingId((prev) => (prev === target.id ? null : target.id));
                            }}
                            onCancelPromote={() => setPromotingId(null)}
                            onApprove={(target) => void handleApprovePending(target)}
                            onReject={(target) => void handleRejectObservation(target)}
                            onArchive={handleArchiveMemory}
                            onRestore={(id) => void onUpdate(id, { status: "active" })}
                            onDelete={(id) => void onDelete(id)}
                          />
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab 2: Information you've shared directly */}
          {tab === "explicit" && (
            <div className="space-y-2.5">
              {/* Search + Filters */}
              <div className="space-y-1.5">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-3 left-2.5 h-3.5 w-3.5 text-[#8A8780] md:top-2" />
                  <input
                    type="search"
                    aria-label="Tìm kiếm ghi nhớ"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm ghi nhớ..."
                    className="w-full rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] py-1.5 pr-2.5 pl-8 text-base text-[#1F1E1C] placeholder:text-[#8A8780] focus:border-[#1F1E1C]/40 focus:outline-none md:text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Lọc theo loại ghi nhớ"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as "" | OwnerMemoryKind)}
                    className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
                  >
                    <option value="">Tất cả loại</option>
                    {KIND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {currentTopicSlug && (
                    <select
                      aria-label="Lọc theo phạm vi"
                      value={scopeFilter}
                      onChange={(e) => setScopeFilter(e.target.value as "all" | "global" | "topic")}
                      className="max-w-40 truncate rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
                    >
                      <option value="all">Mọi phạm vi</option>
                      <option value="global">Toàn cục</option>
                      <option value="topic">Topic: {currentTopicSlug}</option>
                    </select>
                  )}
                  <button
                    type="button"
                    aria-pressed={showArchived}
                    onClick={handleToggleArchived}
                    className={`ml-auto cursor-pointer rounded-md border px-2 py-1 text-[0.6875rem] font-medium transition-colors ${
                      showArchived
                        ? "border-[#1F1E1C] bg-[#1F1E1C] text-white"
                        : "border-[#E6E4DF] bg-[#FFFFFF] text-[#5E5B55] hover:text-[#1F1E1C]"
                    }`}
                  >
                    Đã gỡ{archivedItems.length > 0 ? ` (${archivedItems.length})` : ""}
                  </button>
                </div>
              </div>

              {isComposerOpen && (
                <MemoryComposerForm
                  kind={kind}
                  onKindChange={setKind}
                  scope={scope}
                  onScopeChange={setScope}
                  currentTopicSlug={currentTopicSlug}
                  draft={draft}
                  onDraftChange={setDraft}
                  isSaving={isSaving}
                  onSubmit={(e) => void handleCreate(e)}
                  onCancel={() => setIsComposerOpen(false)}
                />
              )}

              {showArchived ? (
                isLoadingArchived ? (
                  <p className="py-6 text-center text-xs text-[#5E5B55]">Đang tải mục đã gỡ…</p>
                ) : filteredArchivedItems.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#5E5B55]">Không có mục nào đã gỡ.</p>
                ) : (
                  <ul className="space-y-2">
                    {filteredArchivedItems.map((item) => (
                      <MemoryRowCard
                        key={item.id}
                        item={item}
                        mode="archived"
                        activeItems={activeItems}
                        currentTopicSlug={currentTopicSlug}
                        client={client}
                        isEditing={false}
                        isPromoting={promotingId === item.id}
                        isSaving={isSaving}
                        editKind={editKind}
                        editContent={editContent}
                        editScopeTopicSlug={editScopeTopicSlug}
                        onEditKindChange={setEditKind}
                        onEditContentChange={setEditContent}
                        onEditScopeChange={setEditScopeTopicSlug}
                        onStartEdit={startEdit}
                        onSaveEdit={(target) => void saveEdit(target)}
                        onCancelEdit={() => setEditingId(null)}
                        onStartPromote={(target) => {
                          setEditingId(null);
                          setPromotingId((prev) => (prev === target.id ? null : target.id));
                        }}
                        onCancelPromote={() => setPromotingId(null)}
                        onApprove={(target) => void handleApprovePending(target)}
                        onReject={(target) => void handleRejectObservation(target)}
                        onArchive={handleArchiveMemory}
                        onRestore={(id) => void onUpdate(id, { status: "active" })}
                        onDelete={(id) => void onDelete(id)}
                      />
                    ))}
                  </ul>
                )
              ) : isLoading ? (
                <p className="py-6 text-center text-xs text-[#5E5B55]">Đang tải bộ nhớ…</p>
              ) : filteredExplicitItems.length === 0 ? (
                explicitActiveItems.length === 0 && !searchQuery && !kindFilter && scopeFilter === "all" ? (
                  <div className="rounded-xl border border-[#E6E4DF] bg-[#FAF9F7]/60 px-4 py-6 text-center">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFECE6] text-[#1F1E1C]">
                      <MemoryIcon className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-[#1F1E1C]">Sẵn sàng ghi nhớ!</p>
                    <p className="mx-auto mt-1 max-w-68 text-[0.6875rem] leading-4 text-[#5E5B55]">
                      Lưu lại stack, vai trò và cách bạn muốn Abot trả lời, hoặc dặn thẳng trong lúc chat.
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                      {ONBOARDING_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.label}
                          type="button"
                          onClick={() => openShareTab({ kind: tpl.kind, text: tpl.text })}
                          className="cursor-pointer rounded-full border border-[#E6E4DF] bg-[#FFFFFF] px-2.5 py-1 text-[0.6875rem] text-[#1F1E1C] hover:bg-[#F4F3F0]"
                        >
                          + {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-[#5E5B55]">
                    Không có mục nào khớp với bộ lọc hiện tại.
                  </p>
                )
              ) : (
                <ul className="space-y-2">
                  {filteredExplicitItems.map((item) => (
                    <MemoryRowCard
                      key={item.id}
                      item={item}
                      mode="explicit"
                      activeItems={activeItems}
                      currentTopicSlug={currentTopicSlug}
                      client={client}
                      isEditing={editingId === item.id}
                      isPromoting={promotingId === item.id}
                      isSaving={isSaving}
                      editKind={editKind}
                      editContent={editContent}
                      editScopeTopicSlug={editScopeTopicSlug}
                      onEditKindChange={setEditKind}
                      onEditContentChange={setEditContent}
                      onEditScopeChange={setEditScopeTopicSlug}
                      onStartEdit={startEdit}
                      onSaveEdit={(target) => void saveEdit(target)}
                      onCancelEdit={() => setEditingId(null)}
                      onStartPromote={(target) => {
                        setEditingId(null);
                        setPromotingId((prev) => (prev === target.id ? null : target.id));
                      }}
                      onCancelPromote={() => setPromotingId(null)}
                      onApprove={(target) => void handleApprovePending(target)}
                      onReject={(target) => void handleRejectObservation(target)}
                      onArchive={handleArchiveMemory}
                      onRestore={(id) => void onUpdate(id, { status: "active" })}
                      onDelete={(id) => void onDelete(id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#E6E4DF]/60 bg-[#FFFFFF] px-4 py-2.5">
          <span className="text-[0.6875rem] text-[#5E5B55]">
            Chỉ dùng riêng cho Owner, ẩn hoàn toàn với Visitor.
          </span>
          {tab === "explicit" && !isComposerOpen && !showArchived && (
            <button
              type="button"
              onClick={() => setIsComposerOpen(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-[#1F1E1C] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              <span>Thêm ghi nhớ</span>
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
    </>
  );
}

export function OwnerMemorySheet({
  baseUrl,
  currentTopicSlug,
  zIndex,
  onPendingCountChange,
  onClose,
}: OwnerMemorySheetProps) {
  return (
    <AbotDialog
      label="Bộ nhớ Abot"
      size="lg"
      zIndex={zIndex}
      onClose={onClose}
      panelClassName="min-h-[20rem] sm:min-h-[26rem]"
    >
      <OwnerMemoryContent
        baseUrl={baseUrl}
        currentTopicSlug={currentTopicSlug}
        onPendingCountChange={onPendingCountChange}
        onClose={onClose}
      />
    </AbotDialog>
  );
}
