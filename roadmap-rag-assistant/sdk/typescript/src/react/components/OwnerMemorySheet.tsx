import React, { useEffect, useState } from "react";
import type { OwnerMemoryItem, OwnerMemoryKind } from "../../types";
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from "../icons";
import { useOwnerMemories } from "../useOwnerMemories";

const KIND_OPTIONS: { value: OwnerMemoryKind; label: string }[] = [
  { value: "preference", label: "Quy ước" },
  { value: "techstack", label: "Techstack" },
  { value: "goal", label: "Mục tiêu" },
  { value: "profile", label: "Hồ sơ" },
  { value: "learning_note", label: "Ghi chú" },
];

const KIND_LABEL: Record<OwnerMemoryKind, string> = {
  preference: "Quy ước",
  techstack: "Techstack",
  goal: "Mục tiêu",
  profile: "Hồ sơ",
  learning_note: "Ghi chú",
};

const MAX_CONTENT_LENGTH = 300;

export interface OwnerMemorySheetProps {
  baseUrl: string;
  currentTopicSlug?: string;
  onPendingCountChange?: (count: number) => void;
  onClose: () => void;
}

export function OwnerMemorySheet({
  baseUrl,
  currentTopicSlug,
  onPendingCountChange,
  onClose,
}: OwnerMemorySheetProps) {
  const {
    activeItems,
    pendingItems,
    isLoading,
    isSaving,
    error,
    refresh,
    create: onCreate,
    update: onUpdate,
    remove: onDelete,
  } = useOwnerMemories(baseUrl);
  const [tab, setTab] = useState<"active" | "pending">("active");
  const [kind, setKind] = useState<OwnerMemoryKind>("preference");
  const [scope, setScope] = useState<"global" | "topic">("global");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editKind, setEditKind] = useState<OwnerMemoryKind>("preference");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isLoading) {
      onPendingCountChange?.(pendingItems.length);
    }
  }, [isLoading, pendingItems.length, onPendingCountChange]);

  const onRefresh = () => void refresh();

  // Captured first and stopped, so Escape closes this sheet and not the chat around it
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

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
    }
  };

  const startEdit = (item: OwnerMemoryItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditKind(item.kind);
  };

  const saveEdit = async (id: string) => {
    const content = editContent.trim();
    if (!content || isSaving) return;
    const ok = await onUpdate(id, { kind: editKind, content });
    if (ok) {
      setEditingId(null);
    }
  };

  const list = tab === "active" ? activeItems : pendingItems;

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bộ nhớ Owner"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88%] w-full flex-col overflow-hidden rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E4DF]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#1F1E1C]">Bộ nhớ Owner</span>
            <div className="flex items-center gap-1 rounded-lg bg-[#F4F3F0] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                  tab === "active" ? "bg-[#FFFFFF] text-[#1F1E1C] shadow-xs" : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                Đang nhớ ({activeItems.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                  tab === "pending" ? "bg-[#FFFFFF] text-[#1F1E1C] shadow-xs" : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                Chờ duyệt ({pendingItems.length})
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng bảng bộ nhớ"
            autoFocus
            className="flex h-8 w-8 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-5 md:w-5 md:min-h-0 md:min-w-0"
          >
            <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#B42318]/20 bg-[#FBEDE5] px-2.5 py-1.5 text-[11px] text-[#B42318]">
              <span>{error}</span>
              <button
                type="button"
                onClick={onRefresh}
                className="shrink-0 cursor-pointer font-semibold underline"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Explicit add form on the active tab */}
          {tab === "active" && (
            <form onSubmit={(e) => void handleCreate(e)} className="mb-3 rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] p-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <select
                  aria-label="Loại bộ nhớ"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as OwnerMemoryKind)}
                  className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#1F1E1C] focus:outline-none"
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {currentTopicSlug && (
                  <select
                    aria-label="Phạm vi bộ nhớ"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as "global" | "topic")}
                    className="max-w-[160px] truncate rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[11px] text-[#1F1E1C] focus:outline-none"
                  >
                    <option value="global">Toàn cục</option>
                    <option value="topic">Topic: {currentTopicSlug}</option>
                  </select>
                )}
                <span className="ml-auto text-[10px] tabular-nums text-[#8A8780]">
                  {draft.length}/{MAX_CONTENT_LENGTH}
                </span>
              </div>
              <div className="flex items-end gap-1.5">
                <textarea
                  rows={2}
                  maxLength={MAX_CONTENT_LENGTH}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ví dụ: Đang dùng Next.js 15 + FastAPI; khi viết bài luôn có mục Lỗi thường gặp"
                  className="flex-1 resize-none rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] px-2.5 py-1.5 text-xs text-[#1F1E1C] placeholder:text-[#8A8780] focus:border-[#1F1E1C]/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || isSaving}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-[#1F1E1C] px-2.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  <span>Lưu</span>
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <p className="py-6 text-center text-xs text-[#5E5B55]">Đang tải bộ nhớ…</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#5E5B55]">
              {tab === "active"
                ? "Chưa có mục Owner Memory nào. Bạn có thể thêm ở trên hoặc nhắn \"nhớ giúp mình...\"."
                : "Không có mục nào đang chờ duyệt."}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-2.5 text-xs text-[#1F1E1C]"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="rounded-md bg-[#F4F3F0] px-1.5 py-0.5 text-[10px] font-semibold text-[#4D4B46]">
                        {KIND_LABEL[item.kind] ?? item.kind}
                      </span>
                      <span className="rounded-md bg-[#F4F3F0]/70 px-1.5 py-0.5 text-[10px] text-[#5E5B55]">
                        {item.scopeTopicSlug ? `topic: ${item.scopeTopicSlug}` : "Toàn cục"}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        {tab === "pending" ? (
                          <>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void onUpdate(item.id, { status: "active" })}
                              className="cursor-pointer rounded-md bg-[#3F7D58] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#356A4A] disabled:opacity-40"
                            >
                              Duyệt
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void onDelete(item.id)}
                              className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] text-[#5E5B55] hover:bg-[#F4F3F0]"
                            >
                              Bỏ qua
                            </button>
                          </>
                        ) : isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={!editContent.trim() || isSaving}
                              onClick={() => void saveEdit(item.id)}
                              title="Lưu thay đổi"
                              aria-label="Lưu thay đổi"
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#3F7D58] hover:bg-[#3F7D58]/10 disabled:opacity-40"
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              title="Hủy sửa"
                              aria-label="Hủy sửa"
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0]"
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              title="Sửa"
                              aria-label="Sửa mục bộ nhớ"
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void onDelete(item.id)}
                              title="Xoá"
                              aria-label="Xoá mục bộ nhớ"
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#FBEDE5] hover:text-[#B42318] disabled:opacity-40"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-1.5 space-y-1.5">
                        <select
                          aria-label="Loại bộ nhớ khi sửa"
                          value={editKind}
                          onChange={(e) => setEditKind(e.target.value as OwnerMemoryKind)}
                          className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-0.5 text-[11px] text-[#1F1E1C]"
                        >
                          {KIND_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          maxLength={MAX_CONTENT_LENGTH}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#FAF9F7] px-2 py-1 text-xs text-[#1F1E1C] focus:outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="leading-relaxed text-[#1F1E1C]">{item.content}</p>
                        {tab === "pending" && item.replacesMemoryId && (() => {
                          const replaced = activeItems.find((a) => a.id === item.replacesMemoryId);
                          return (
                            <p className="mt-1 rounded-md bg-[#FAF3E8] px-2 py-1 text-[11px] leading-4 text-[#8A4B08]">
                              Thay thế: {replaced ? `“${replaced.content}”` : "một mục đang bật trước đó"}
                            </p>
                          );
                        })()}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-[11px] leading-4 text-[#5E5B55]">
            Chỉ dùng riêng cho Owner xuyên các hội thoại và không bao giờ hiển thị với Visitor.
          </p>
        </div>
      </div>
    </div>
  );
}
