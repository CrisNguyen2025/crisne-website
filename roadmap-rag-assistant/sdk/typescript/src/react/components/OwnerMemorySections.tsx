import React, { useEffect, useState } from "react";
import { RoadmapChatClient } from "../../client";
import type {
  OwnerMemoryItem,
  OwnerMemoryKind,
  OwnerMemorySettings,
  RoadmapSummaryItem,
} from "../../types";
import { CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon, UndoIcon } from "../icons";

export const KIND_OPTIONS: { value: OwnerMemoryKind; label: string }[] = [
  { value: "preference", label: "Quy ước" },
  { value: "techstack", label: "Techstack" },
  { value: "goal", label: "Mục tiêu" },
  { value: "profile", label: "Hồ sơ" },
  { value: "learning_note", label: "Ghi chú" },
];

export const KIND_LABEL: Record<OwnerMemoryKind, string> = {
  preference: "Quy ước",
  techstack: "Techstack",
  goal: "Mục tiêu",
  profile: "Hồ sơ",
  learning_note: "Ghi chú",
};

export const ONBOARDING_TEMPLATES: { label: string; kind: OwnerMemoryKind; text: string }[] = [
  {
    label: "Vai trò & kinh nghiệm",
    kind: "profile",
    text: "Mình là lập trình viên tập trung vào Frontend & Backend.",
  },
  {
    label: "Techstack chính",
    kind: "techstack",
    text: "Stack chính đang dùng: Next.js, TypeScript và FastAPI.",
  },
  {
    label: "Quy ước trả lời",
    kind: "preference",
    text: "Luôn trả lời ngắn gọn bằng tiếng Việt và ưu tiên ví dụ code thực tế.",
  },
];

export const MAX_CONTENT_LENGTH = 300;
export const MAX_PENDING_MEMORIES = 10;
const CUSTOM_SECTION_VALUE = "__custom__";

function suggestLessonTitle(content: string): string {
  const firstSentence = content.split(/[\n.!?]/).find((part) => part.trim().length > 0) ?? content;
  const normalized = firstSentence.trim();
  return normalized.length > 100 ? normalized.slice(0, 100).trim() : normalized;
}

export interface MemoryEditFormProps {
  editKind: OwnerMemoryKind;
  onEditKindChange: (kind: OwnerMemoryKind) => void;
  editScopeTopicSlug: string | null;
  onEditScopeChange: (scope: string | null) => void;
  scopeOptions: string[];
  editContent: string;
  onEditContentChange: (content: string) => void;
}

export function MemoryEditForm({
  editKind,
  onEditKindChange,
  editScopeTopicSlug,
  onEditScopeChange,
  scopeOptions,
  editContent,
  onEditContentChange,
}: MemoryEditFormProps) {
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Loại bộ nhớ khi sửa"
          value={editKind}
          onChange={(e) => onEditKindChange(e.target.value as OwnerMemoryKind)}
          className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-0.5 text-[0.6875rem] text-[#1F1E1C]"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {scopeOptions.length > 0 && (
          <select
            aria-label="Phạm vi bộ nhớ khi sửa"
            value={editScopeTopicSlug ?? ""}
            onChange={(e) => onEditScopeChange(e.target.value || null)}
            className="max-w-40 truncate rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-0.5 text-[0.6875rem] text-[#1F1E1C]"
          >
            <option value="">Toàn cục</option>
            {scopeOptions.map((slug) => (
              <option key={slug} value={slug}>
                Topic: {slug}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea
        rows={2}
        maxLength={MAX_CONTENT_LENGTH}
        aria-label="Nội dung bộ nhớ khi sửa"
        value={editContent}
        onChange={(e) => onEditContentChange(e.target.value)}
        className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#FAF9F7] px-2 py-1 text-base text-[#1F1E1C] focus:outline-none md:text-xs"
      />
    </div>
  );
}

interface PromoteMemoryPanelProps {
  client: RoadmapChatClient;
  item: OwnerMemoryItem;
  currentTopicSlug?: string;
  isParentSaving: boolean;
  onArchiveMemory: (id: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PromoteMemoryPanel({
  client,
  item,
  currentTopicSlug,
  isParentSaving,
  onArchiveMemory,
  onCancel,
}: PromoteMemoryPanelProps) {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummaryItem[]>([]);
  const [topicSlug, setTopicSlug] = useState("");
  const [sectionsByTopic, setSectionsByTopic] = useState<Record<string, string[]>>({});
  const [selectedSection, setSelectedSection] = useState("");
  const [customSection, setCustomSection] = useState("");
  const [title, setTitle] = useState(() => suggestLessonTitle(item.content));
  const [description, setDescription] = useState(item.content);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const sections = topicSlug ? (sectionsByTopic[topicSlug] ?? []) : [];
  const isLoadingSections = Boolean(topicSlug) && !Object.prototype.hasOwnProperty.call(sectionsByTopic, topicSlug);

  useEffect(() => {
    let cancelled = false;
    void client
      .listRoadmaps()
      .then((list) => {
        if (cancelled) return;
        setRoadmaps(list);
        const preferred =
          (item.scopeTopicSlug && list.some((r) => r.slug === item.scopeTopicSlug) && item.scopeTopicSlug) ||
          (currentTopicSlug && list.some((r) => r.slug === currentTopicSlug) && currentTopicSlug) ||
          list[0]?.slug ||
          "";
        setTopicSlug(preferred);
        setPromoteError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPromoteError(err instanceof Error ? err.message : "Chưa tải được danh sách Topic.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTopics(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, item.scopeTopicSlug, currentTopicSlug]);

  useEffect(() => {
    if (!topicSlug || Object.prototype.hasOwnProperty.call(sectionsByTopic, topicSlug)) {
      return;
    }
    let cancelled = false;
    void client
      .getRoadmap(topicSlug)
      .then((outline) => {
        if (cancelled) return;
        const cleanSections = outline.sections.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
        setSectionsByTopic((prev) => ({ ...prev, [topicSlug]: cleanSections }));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSectionsByTopic((prev) => ({ ...prev, [topicSlug]: [] }));
          setPromoteError(err instanceof Error ? err.message : "Chưa tải được cấu trúc Topic.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, topicSlug, sectionsByTopic]);

  const handleTopicChange = (nextSlug: string) => {
    setTopicSlug(nextSlug);
    if (selectedSection !== CUSTOM_SECTION_VALUE) {
      const nextSections = sectionsByTopic[nextSlug] ?? [];
      if (selectedSection && !nextSections.includes(selectedSection)) {
        setSelectedSection("");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!topicSlug || !trimmedTitle || isSubmitting || isParentSaving) return;

    const sectionValue =
      selectedSection === CUSTOM_SECTION_VALUE ? customSection.trim() || null : selectedSection.trim() || null;

    setIsSubmitting(true);
    setPromoteError(null);
    try {
      const created = await client.createLesson({
        roadmapSlug: topicSlug,
        title: trimmedTitle,
        section: sectionValue,
        description: description.trim() || undefined,
        status: "target",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("roadmap:updated", {
            detail: { toolName: "promote_concept_to_lesson", result: created.slug },
          })
        );
      }
      const archived = await onArchiveMemory(item.id);
      if (archived) {
        onCancel();
      }
    } catch (err: unknown) {
      setPromoteError(err instanceof Error ? err.message : "Chưa đưa được vào Lesson.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-2 rounded-lg border border-[#E6E4DF] bg-[#FAF9F7] p-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold text-[#1F1E1C]">Đưa vào Lesson mới (target)</span>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-[0.6875rem] text-[#5E5B55] hover:text-[#1F1E1C]"
        >
          Đóng
        </button>
      </div>
      {promoteError && (
        <p role="alert" className="rounded bg-[#FBEDE5] px-2 py-1 text-[0.6875rem] text-[#B42318]">
          {promoteError}
        </p>
      )}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <select
          aria-label="Topic đích"
          value={topicSlug}
          disabled={isLoadingTopics || isSubmitting}
          onChange={(e) => handleTopicChange(e.target.value)}
          className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C]"
        >
          {roadmaps.length === 0 ? (
            <option value="">{isLoadingTopics ? "Đang tải Topic…" : "Chưa có Topic"}</option>
          ) : (
            roadmaps.map((topic) => (
              <option key={topic.slug} value={topic.slug}>
                {topic.title}
              </option>
            ))
          )}
        </select>
        <select
          aria-label="Section đích"
          value={selectedSection}
          disabled={!topicSlug || isLoadingSections || isSubmitting}
          onChange={(e) => setSelectedSection(e.target.value)}
          className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C]"
        >
          <option value="">Chung (không chia mục)</option>
          {sections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
          <option value={CUSTOM_SECTION_VALUE}>+ Section mới…</option>
        </select>
      </div>
      {selectedSection === CUSTOM_SECTION_VALUE && (
        <input
          type="text"
          aria-label="Tên Section mới"
          value={customSection}
          onChange={(e) => setCustomSection(e.target.value)}
          placeholder="Tên Section mới"
          className="w-full rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-base text-[#1F1E1C] focus:outline-none md:text-[0.6875rem]"
        />
      )}
      <input
        type="text"
        aria-label="Tiêu đề Lesson"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tiêu đề Lesson"
        className="w-full rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-base text-[#1F1E1C] focus:outline-none md:text-xs"
      />
      <textarea
        rows={2}
        aria-label="Mô tả Lesson"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Mô tả ngắn cho Lesson"
        className="w-full resize-none rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-base text-[#1F1E1C] focus:outline-none md:text-[0.6875rem]"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md px-2 py-1 text-[0.6875rem] text-[#5E5B55] hover:bg-[#F4F3F0]"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={!topicSlug || !title.trim() || isSubmitting || isParentSaving}
          className="cursor-pointer rounded-md bg-[#1F1E1C] px-2.5 py-1 text-[0.6875rem] font-medium text-white disabled:opacity-40"
        >
          Xác nhận đưa vào Lesson
        </button>
      </div>
    </form>
  );
}

interface MemorySettingsDrawerProps {
  settings: OwnerMemorySettings;
  isSaving: boolean;
  confirmClear: boolean;
  onToggleMemory: () => void;
  onToggleAutoObserve: () => void;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
}

export function MemorySettingsDrawer({
  settings,
  isSaving,
  confirmClear,
  onToggleMemory,
  onToggleAutoObserve,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
}: MemorySettingsDrawerProps) {
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-[#1F1E1C]">Kích hoạt Bộ nhớ Owner</p>
          <p className="text-[0.6875rem] text-[#5E5B55]">Khi tắt, Abot không chèn bộ nhớ vào câu trả lời.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.memoryEnabled}
          aria-label="Kích hoạt Bộ nhớ Owner"
          disabled={isSaving}
          onClick={onToggleMemory}
          className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${
            settings.memoryEnabled ? "bg-[#3F7D58]" : "bg-[#D5D2CA]"
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
              settings.memoryEnabled ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#E6E4DF]/70 pt-2">
        <div>
          <p className="font-medium text-[#1F1E1C]">Tự động quan sát & đề xuất</p>
          <p className="text-[0.6875rem] text-[#5E5B55]">Trích xuất gợi ý từ hội thoại, quiz và tổng hợp hằng tuần.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.memoryEnabled && settings.autoObserveEnabled}
          aria-label="Tự động quan sát và đề xuất"
          disabled={isSaving || !settings.memoryEnabled}
          onClick={onToggleAutoObserve}
          className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-40 ${
            settings.memoryEnabled && settings.autoObserveEnabled ? "bg-[#3F7D58]" : "bg-[#D5D2CA]"
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
              settings.memoryEnabled && settings.autoObserveEnabled ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#E6E4DF]/70 pt-2">
        <span className="text-[0.6875rem] text-[#5E5B55]">Xoá toàn bộ lịch sử bộ nhớ đã lưu</span>
        {confirmClear ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={onConfirmClear}
              className="cursor-pointer rounded-md bg-[#B42318] px-2 py-0.5 text-[0.6875rem] font-medium text-white disabled:opacity-50"
            >
              Xác nhận xoá tất cả
            </button>
            <button
              type="button"
              onClick={onCancelClear}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-[0.6875rem] text-[#5E5B55] hover:bg-[#F4F3F0]"
            >
              Hủy
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSaving}
            onClick={onRequestClear}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[0.6875rem] font-medium text-[#B42318] hover:bg-[#FBEDE5] disabled:opacity-50"
          >
            Xoá toàn bộ
          </button>
        )}
      </div>
    </div>
  );
}

interface MemoryComposerFormProps {
  kind: OwnerMemoryKind;
  onKindChange: (kind: OwnerMemoryKind) => void;
  scope: "global" | "topic";
  onScopeChange: (scope: "global" | "topic") => void;
  currentTopicSlug?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  isSaving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function MemoryComposerForm({
  kind,
  onKindChange,
  scope,
  onScopeChange,
  currentTopicSlug,
  draft,
  onDraftChange,
  isSaving,
  onSubmit,
  onCancel,
}: MemoryComposerFormProps) {
  return (
    <form onSubmit={onSubmit} className="mb-3 rounded-xl border border-[#E6E4DF] bg-[#FAF9F7] p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Loại bộ nhớ"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as OwnerMemoryKind)}
          className="rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
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
            onChange={(e) => onScopeChange(e.target.value as "global" | "topic")}
            className="max-w-40 truncate rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
          >
            <option value="global">Toàn cục</option>
            <option value="topic">Topic: {currentTopicSlug}</option>
          </select>
        )}
        <span className="ml-auto text-[0.625rem] tabular-nums text-[#8A8780]">
          {draft.length}/{MAX_CONTENT_LENGTH}
        </span>
      </div>
      <textarea
        rows={2}
        maxLength={MAX_CONTENT_LENGTH}
        aria-label="Nội dung ghi nhớ mới"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="Ví dụ: Đang dùng Next.js 15 + FastAPI; khi viết bài luôn có mục Lỗi thường gặp"
        className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#FFFFFF] px-2.5 py-1.5 text-base text-[#1F1E1C] placeholder:text-[#8A8780] focus:border-[#1F1E1C]/40 focus:outline-none md:text-xs"
      />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg px-2.5 py-1 text-xs text-[#5E5B55] hover:bg-[#F4F3F0]"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={!draft.trim() || isSaving}
          className="flex h-7.5 cursor-pointer items-center gap-1 rounded-lg bg-[#1F1E1C] px-2.5 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>Lưu</span>
        </button>
      </div>
    </form>
  );
}

export function UndoMemoryBanner({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#E6E4DF] bg-[#1F1E1C] px-2.5 py-1.5 text-[0.6875rem] text-white"
    >
      <span className="truncate">{message}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex cursor-pointer items-center gap-1 rounded bg-white/15 px-2 py-0.5 font-medium text-white hover:bg-white/25"
        >
          <UndoIcon className="h-3 w-3" />
          <span>Hoàn tác</span>
        </button>
        <button
          type="button"
          aria-label="Đóng thông báo hoàn tác"
          onClick={onDismiss}
          className="cursor-pointer text-white/70 hover:text-white"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

interface ActionControlsProps {
  item: OwnerMemoryItem;
  mode: "pending" | "observed" | "explicit" | "archived";
  isEditing: boolean;
  isSaving: boolean;
  editContent: string;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (item: OwnerMemoryItem) => void;
  onStartPromote: (item: OwnerMemoryItem) => void;
  onApprove: (item: OwnerMemoryItem) => void;
  onReject: (item: OwnerMemoryItem) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RowActionButtons({
  item,
  mode,
  isEditing,
  isSaving,
  editContent,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onStartPromote,
  onApprove,
  onReject,
  onRestore,
  onDelete,
}: ActionControlsProps) {
  if (mode === "archived") {
    return (
      <>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onRestore(item.id)}
          className="cursor-pointer rounded-md bg-[#3F7D58] px-2 py-0.5 text-[0.6875rem] font-medium text-white hover:bg-[#356A4A] disabled:opacity-40"
        >
          Khôi phục
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onDelete(item.id)}
          title="Xoá vĩnh viễn"
          aria-label="Xoá mục bộ nhớ"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#FBEDE5] hover:text-[#B42318] disabled:opacity-40"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  if (isEditing) {
    return (
      <>
        <button
          type="button"
          disabled={!editContent.trim() || isSaving}
          onClick={() => onSaveEdit(item.id)}
          title="Lưu thay đổi"
          aria-label="Lưu thay đổi"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#3F7D58] hover:bg-[#3F7D58]/10 disabled:opacity-40"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          title="Hủy sửa"
          aria-label="Hủy sửa"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0]"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  return (
    <>
      {mode === "pending" && (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onApprove(item)}
          className="cursor-pointer rounded-md bg-[#3F7D58] px-2 py-0.5 text-[0.6875rem] font-medium text-white hover:bg-[#356A4A] disabled:opacity-40"
        >
          Duyệt
        </button>
      )}
      <button
        type="button"
        disabled={isSaving}
        onClick={() => onStartPromote(item)}
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-[0.6875rem] text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] disabled:opacity-40"
      >
        Đưa vào Lesson
      </button>
      <button
        type="button"
        onClick={() => onStartEdit(item)}
        title="Sửa"
        aria-label="Sửa mục bộ nhớ"
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C]"
      >
        <EditIcon className="h-3.5 w-3.5" />
      </button>
      {mode === "pending" || mode === "observed" ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onReject(item)}
          className="cursor-pointer rounded-md px-2 py-0.5 text-[0.6875rem] text-[#5E5B55] hover:bg-[#FBEDE5] hover:text-[#B42318] disabled:opacity-40"
        >
          {mode === "pending" ? "Không đúng" : "Góp ý / Gỡ"}
        </button>
      ) : (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onDelete(item.id)}
          title="Xoá"
          aria-label="Xoá mục bộ nhớ"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#FBEDE5] hover:text-[#B42318] disabled:opacity-40"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}
