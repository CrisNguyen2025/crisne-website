import React, { useEffect, useMemo, useState } from "react";
import { RoadmapChatClient } from "../../client";
import type { OwnerMemoryItem, OwnerMemoryKind, RoadmapSummaryItem, UpdateOwnerMemoryInput } from "../../types";
import { AlertTriangleIcon, CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from "../icons";
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
const MAX_PENDING_MEMORIES = 10;
const CUSTOM_SECTION_VALUE = "__custom__";

type MemoryTab = "active" | "pending" | "archived";

function suggestLessonTitle(content: string): string {
  const firstSentence = content.split(/[\n.!?]/).find((part) => part.trim().length > 0) ?? content;
  const normalized = firstSentence.trim();
  return normalized.length > 100 ? normalized.slice(0, 100).trim() : normalized;
}

interface MemoryEditFormProps {
  editKind: OwnerMemoryKind;
  onEditKindChange: (kind: OwnerMemoryKind) => void;
  editScopeTopicSlug: string | null;
  onEditScopeChange: (scope: string | null) => void;
  scopeOptions: string[];
  editContent: string;
  onEditContentChange: (content: string) => void;
}

function MemoryEditForm({
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
        className="w-full resize-none rounded-lg border border-[#E6E4DF] bg-[#FAF9F7] px-2 py-1 text-xs text-[#1F1E1C] focus:outline-none"
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

function PromoteMemoryPanel({
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
      selectedSection === CUSTOM_SECTION_VALUE
        ? customSection.trim() || null
        : selectedSection.trim() || null;

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
          className="w-full rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
        />
      )}
      <input
        type="text"
        aria-label="Tiêu đề Lesson"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tiêu đề Lesson"
        className="w-full rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-xs text-[#1F1E1C] focus:outline-none"
      />
      <textarea
        rows={2}
        aria-label="Mô tả Lesson"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Mô tả ngắn cho Lesson"
        className="w-full resize-none rounded-md border border-[#E6E4DF] bg-[#FFFFFF] px-2 py-1 text-[0.6875rem] text-[#1F1E1C] focus:outline-none"
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

interface MemoryItemRowProps {
  item: OwnerMemoryItem;
  tab: MemoryTab;
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
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartPromote: (item: OwnerMemoryItem) => void;
  onCancelPromote: () => void;
  onUpdate: (id: string, input: UpdateOwnerMemoryInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

function RowActions({
  item,
  tab,
  isEditing,
  isSaving,
  editContent,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onStartPromote,
  onUpdate,
  onDelete,
}: {
  item: OwnerMemoryItem;
  tab: MemoryTab;
  isEditing: boolean;
  isSaving: boolean;
  editContent: string;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (item: OwnerMemoryItem) => void;
  onStartPromote: (item: OwnerMemoryItem) => void;
  onUpdate: (id: string, input: UpdateOwnerMemoryInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  if (tab === "archived") {
    return (
      <>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void onUpdate(item.id, { status: "active" })}
          className="cursor-pointer rounded-md bg-[#3F7D58] px-2 py-0.5 text-[0.6875rem] font-medium text-white hover:bg-[#356A4A] disabled:opacity-40"
        >
          Khôi phục
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
    );
  }

  if (isEditing) {
    return (
      <>
        <button
          type="button"
          disabled={!editContent.trim() || isSaving}
          onClick={() => void onSaveEdit(item.id)}
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
      {tab === "pending" && (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void onUpdate(item.id, { status: "active" })}
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
      {tab === "pending" ? (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void onDelete(item.id)}
          className="cursor-pointer rounded-md px-2 py-0.5 text-[0.6875rem] text-[#5E5B55] hover:bg-[#F4F3F0]"
        >
          Bỏ qua
        </button>
      ) : (
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
      )}
    </>
  );
}

function MemoryItemRow({
  item,
  tab,
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
  onUpdate,
  onDelete,
}: MemoryItemRowProps) {
  const scopeOptions = useMemo(() => {
    const slugs = new Set<string>();
    if (currentTopicSlug) slugs.add(currentTopicSlug);
    if (item.scopeTopicSlug) slugs.add(item.scopeTopicSlug);
    return Array.from(slugs);
  }, [currentTopicSlug, item.scopeTopicSlug]);

  const replaced = tab === "pending" && item.replacesMemoryId
    ? activeItems.find((a) => a.id === item.replacesMemoryId)
    : undefined;

  return (
    <li className="rounded-xl border border-[#E6E4DF] bg-[#FFFFFF] p-2.5 text-xs text-[#1F1E1C]">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded-md bg-[#F4F3F0] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[#4D4B46]">
          {KIND_LABEL[item.kind] ?? item.kind}
        </span>
        <span className="rounded-md bg-[#F4F3F0]/70 px-1.5 py-0.5 text-[0.625rem] text-[#5E5B55]">
          {item.scopeTopicSlug ? `topic: ${item.scopeTopicSlug}` : "Toàn cục"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <RowActions
            item={item}
            tab={tab}
            isEditing={isEditing}
            isSaving={isSaving}
            editContent={editContent}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onStartEdit={onStartEdit}
            onStartPromote={onStartPromote}
            onUpdate={onUpdate}
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
          {tab === "pending" && item.replacesMemoryId && (
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
          onArchiveMemory={(id) => onUpdate(id, { status: "archived" })}
          onCancel={onCancelPromote}
        />
      )}
    </li>
  );
}

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
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  const {
    activeItems,
    pendingItems,
    archivedItems,
    isLoading,
    isLoadingArchived,
    isSaving,
    error,
    refresh,
    loadArchived,
    create: onCreate,
    update: onUpdate,
    remove: onDelete,
  } = useOwnerMemories(baseUrl);
  const [tab, setTab] = useState<MemoryTab>("active");
  const [hasLoadedArchived, setHasLoadedArchived] = useState(false);
  const [kind, setKind] = useState<OwnerMemoryKind>("preference");
  const [scope, setScope] = useState<"global" | "topic">("global");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editKind, setEditKind] = useState<OwnerMemoryKind>("preference");
  const [editScopeTopicSlug, setEditScopeTopicSlug] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isLoading) {
      onPendingCountChange?.(pendingItems.length);
    }
  }, [isLoading, pendingItems.length, onPendingCountChange]);

  const onRefresh = () => {
    void refresh();
  };

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

  const handleSelectTab = (nextTab: MemoryTab) => {
    setTab(nextTab);
    setEditingId(null);
    setPromotingId(null);
    if (nextTab === "archived") {
      setHasLoadedArchived(true);
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
    }
  };

  const startEdit = (item: OwnerMemoryItem) => {
    setPromotingId(null);
    setEditingId(item.id);
    setEditContent(item.content);
    setEditKind(item.kind);
    setEditScopeTopicSlug(item.scopeTopicSlug ?? null);
  };

  const saveEdit = async (id: string) => {
    const content = editContent.trim();
    if (!content || isSaving) return;
    const currentItem =
      activeItems.find((item) => item.id === id) ?? pendingItems.find((item) => item.id === id);
    const payload: UpdateOwnerMemoryInput = { kind: editKind, content };
    if (currentItem && editScopeTopicSlug !== currentItem.scopeTopicSlug) {
      payload.scopeTopicSlug = editScopeTopicSlug;
    }
    const ok = await onUpdate(id, payload);
    if (ok) {
      setEditingId(null);
    }
  };

  const startPromote = (item: OwnerMemoryItem) => {
    setEditingId(null);
    setPromotingId((prev) => (prev === item.id ? null : item.id));
  };

  const itemsByTab: Record<MemoryTab, OwnerMemoryItem[]> = {
    active: activeItems,
    pending: pendingItems,
    archived: archivedItems,
  };
  const emptyMessages: Record<MemoryTab, string> = {
    active: 'Chưa có mục Owner Memory nào. Bạn có thể thêm ở trên hoặc nhắn "nhớ giúp mình...".',
    pending: "Không có mục nào đang chờ duyệt.",
    archived: "Không có mục nào đã gỡ.",
  };
  const list = itemsByTab[tab];
  const isTabLoading = tab === "archived" ? isLoadingArchived : isLoading;
  const emptyMessage = emptyMessages[tab];

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bộ nhớ Owner"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88%] w-full flex-col overflow-hidden rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_-0.25rem_1rem_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E4DF]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#1F1E1C]">Bộ nhớ Owner</span>
            <div className="flex items-center gap-1 rounded-lg bg-[#F4F3F0] p-0.5 text-[0.6875rem]">
              <button
                type="button"
                onClick={() => handleSelectTab("active")}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                  tab === "active" ? "bg-[#FFFFFF] text-[#1F1E1C] shadow-xs" : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                Đang nhớ ({activeItems.length})
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab("pending")}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                  tab === "pending" ? "bg-[#FFFFFF] text-[#1F1E1C] shadow-xs" : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                Chờ duyệt ({pendingItems.length})
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab("archived")}
                className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                  tab === "archived" ? "bg-[#FFFFFF] text-[#1F1E1C] shadow-xs" : "text-[#5E5B55] hover:text-[#1F1E1C]"
                }`}
              >
                {hasLoadedArchived ? `Đã gỡ (${archivedItems.length})` : "Đã gỡ"}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            aria-label="Đóng bảng bộ nhớ"
            autoFocus
            className="flex h-8 w-8 min-h-11 min-w-11 cursor-pointer items-center justify-center rounded text-[#5E5B55] hover:bg-[#F4F3F0] hover:text-[#1F1E1C] md:h-5 md:w-5 md:min-h-0 md:min-w-0"
          >
            <CloseIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#B42318]/20 bg-[#FBEDE5] px-2.5 py-1.5 text-[0.6875rem] text-[#B42318]">
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

          {pendingItems.length >= MAX_PENDING_MEMORIES && (
            <div
              role="status"
              className="mb-2.5 flex items-start gap-2 rounded-lg border border-[#D97706]/30 bg-[#FEF7EC] px-2.5 py-2 text-[0.6875rem] leading-4 text-[#8A4B08]"
            >
              <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Hàng chờ đã chạm giới hạn {MAX_PENDING_MEMORIES}/{MAX_PENDING_MEMORIES} mục. Hãy duyệt, chỉnh sửa, bỏ qua hoặc đưa khái niệm vào Lesson để tránh sót gợi ý mới.
              </span>
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
                    onChange={(e) => setScope(e.target.value as "global" | "topic")}
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

          {isTabLoading ? (
            <p className="py-6 text-center text-xs text-[#5E5B55]">Đang tải bộ nhớ…</p>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#5E5B55]">{emptyMessage}</p>
          ) : (
            <ul className="space-y-2">
              {list.map((item) => (
                <MemoryItemRow
                  key={item.id}
                  item={item}
                  tab={tab}
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
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onStartPromote={startPromote}
                  onCancelPromote={() => setPromotingId(null)}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}

          <p className="mt-3 text-[0.6875rem] leading-4 text-[#5E5B55]">
            Chỉ dùng riêng cho Owner xuyên các hội thoại và không bao giờ hiển thị với Visitor.
          </p>
        </div>
      </div>
    </div>
  );
}
