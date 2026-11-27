"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpDown, FolderPlus, Pencil, Trash2, Ungroup } from "lucide-react";
import {
  getDeletedLessonIdsSnapshot,
  getEmptyPendingSet,
  markPendingLessonWrite,
  markRoadmapRefreshPending,
  reconcileDeletedLessonIds,
  subscribePendingWrites,
} from "@/lib/roadmap/pending-write";
import { splitSectionLabel } from "@/lib/roadmap/section-label";
import { groupBySection, sectionsInOrder } from "@/lib/roadmap/sections";
import type { LessonStatus } from "@/lib/roadmap/status";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import { useCanWrite } from "@/hooks/use-can-write";
import { useCollapseRightRail } from "@/hooks/use-abot-sidebar";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { cn, getScrollBehavior } from "@/lib/utils";
import { lessonPath, topicPath } from "@/lib/roadmap/paths";
import { CreateItemModal, type CreateItemOptions } from "./CreateItemModal";
import { EditSectionModal } from "./EditSectionModal";
import { EditTopicModal } from "./EditTopicModal";
import { LectureShell } from "./LectureShell";
import { LessonStatusBadge } from "./LessonStatus";
import { RoadmapMap } from "./RoadmapMap";
import { SECTIONS_ENABLED } from "./sectionsEnabled";
import { usePendingRoadmapRefresh } from "./usePendingRoadmapRefresh";
import { useTopicOwnerStatuses } from "./useTopicOwnerStatuses";

interface TopicEditorialPageProps {
  topic: RoadmapMeta & { updatedAt: string };
  initialItems: ChecklistItem[];
  initialSections: (string | null)[];
  initialSelectedSection?: string | null | "all";
}

const STATUS_DOT: Record<LessonStatus, string> = {
  target: "bg-[var(--status-target)]",
  learning: "bg-[var(--status-learning)]",
  known: "",
};

export function TopicEditorialPage({
  topic,
  initialItems,
  initialSections,
  initialSelectedSection = "all",
}: TopicEditorialPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const collapseRightRail = useCollapseRightRail();
  const { ownerStatusById, invalidateStatuses } = useTopicOwnerStatuses(
    topic.slug,
    canWrite
  );

  usePendingRoadmapRefresh(topicPath(topic.slug));
  const deletedLessonIds = useSyncExternalStore(
    subscribePendingWrites,
    getDeletedLessonIdsSnapshot,
    getEmptyPendingSet
  );

  useEffect(() => {
    reconcileDeletedLessonIds(initialItems.map((it) => it.id));
  }, [initialItems]);

  const visibleInitialItems = useMemo(
    () =>
      deletedLessonIds.size === 0
        ? initialItems
        : initialItems.filter((it) => !deletedLessonIds.has(it.id)),
    [initialItems, deletedLessonIds]
  );

  const visibleSections = useMemo(
    () =>
      visibleInitialItems.length === initialItems.length
        ? initialSections
        : sectionsInOrder(visibleInitialItems),
    [visibleInitialItems, initialItems.length, initialSections]
  );

  const [optimisticOrder, setOptimisticOrder] = useState<{
    baseKey: string;
    items: ChecklistItem[];
  } | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [targetSection, setTargetSection] = useState<string | null>(null);
  const [isEditTopicOpen, setIsEditTopicOpen] = useState(false);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | LessonStatus>("all");

  const baseKey = useMemo(
    () =>
      visibleInitialItems
        .map((it) => `${it.id}:${it.section ?? ""}:${it.order}`)
        .join("|"),
    [visibleInitialItems]
  );

  const items = useMemo<ChecklistItem[]>(() => {
    const sourceItems =
      optimisticOrder && optimisticOrder.baseKey === baseKey
        ? optimisticOrder.items
        : visibleInitialItems;
    if (!canWrite) return sourceItems;
    return sourceItems.map((it) =>
      ownerStatusById[it.id] ? { ...it, status: ownerStatusById[it.id] } : it
    );
  }, [
    visibleInitialItems,
    optimisticOrder,
    baseKey,
    canWrite,
    ownerStatusById,
  ]);

  const namedSections = useMemo(
    () => visibleSections.filter((s): s is string => s !== null),
    [visibleSections]
  );

  const siblingGroups = useMemo<SectionGroup[]>(() => {
    if (!SECTIONS_ENABLED) {
      return [{ section: null, items }];
    }
    return groupBySection(items, visibleSections);
  }, [items, visibleSections]);

  const flatLessons = useMemo(
    () => siblingGroups.flatMap((g) => g.items),
    [siblingGroups]
  );
  const firstLesson = flatLessons[0];

  const ownerTotals = useMemo(() => {
    let learning = 0;
    let target = 0;
    for (const it of items) {
      if (it.status === "learning") learning += 1;
      else if (it.status === "target") target += 1;
    }
    return { learning, target };
  }, [items]);

  const focusItems = useMemo(() => {
    if (!canWrite) return [];
    const learning = flatLessons.filter((it) => it.status === "learning");
    const target = flatLessons.filter((it) => it.status === "target");
    return [...learning, ...target].slice(0, 6);
  }, [canWrite, flatLessons]);

  const isSingleUnscopedGroup =
    siblingGroups.length === 1 && siblingGroups[0].section === null;

  const filteredGroups = useMemo<SectionGroup[]>(() => {
    if (!canWrite || statusFilter === "all") return siblingGroups;
    return siblingGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => (it.status ?? "known") === statusFilter),
      }))
      .filter((g) => g.items.length > 0);
  }, [canWrite, siblingGroups, statusFilter]);

  useEffect(() => {
    if (!initialSelectedSection || initialSelectedSection === "all") return;
    const idx = siblingGroups.findIndex(
      (g) => g.section === initialSelectedSection
    );
    if (idx < 0) return;
    const el = document.getElementById(`sec-${idx + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
    }
  }, [initialSelectedSection, siblingGroups]);

  const defaultOpenSectionKey = useMemo(() => {
    if (initialSelectedSection !== "all") {
      return initialSelectedSection ?? "__none__";
    }
    if (namedSections.length > 0) {
      return namedSections[0];
    }
    return siblingGroups[0]?.section ?? "__none__";
  }, [initialSelectedSection, namedSections, siblingGroups]);

  const handleCreateItem = async (
    section: string | null,
    title: string,
    description: string,
    options?: CreateItemOptions
  ) => {
    const { item } = await roadmapService.createItem({
      roadmapSlug: topic.slug,
      section,
      title,
      description,
    });
    invalidateStatuses();
    const shouldOpenEditor = Boolean(options?.openEditor && item?.slug);
    if (shouldOpenEditor && item?.slug) {
      markRoadmapRefreshPending({ originRouteKey: topicPath(topic.slug) });
      markPendingLessonWrite(item.slug);
    }
    window.dispatchEvent(
      new CustomEvent("roadmap:updated", {
        detail: { skipRefresh: shouldOpenEditor },
      })
    );
    if (shouldOpenEditor && item?.slug) {
      router.push(lessonPath(topic.slug, item.slug));
      return;
    }
    toast(`Đã thêm bài "${title}"`, "success");
  };

  const handleReorderSection = async (
    section: string | null,
    reordered: ChecklistItem[]
  ) => {
    const nextItems = SECTIONS_ENABLED
      ? siblingGroups.flatMap((g) =>
          g.section === section ? reordered : g.items
        )
      : reordered;
    setOptimisticOrder({ baseKey, items: nextItems });
    try {
      await roadmapService.reorderItems({
        orderedItemIds: nextItems.map((it) => it.id),
      });
      window.dispatchEvent(new CustomEvent("roadmap:updated"));
    } catch {
      setOptimisticOrder(null);
      toast("Không sắp xếp lại được bài học.", "error");
    }
  };

  const handleEditTopic = async (title: string, description?: string) => {
    await roadmapService.updateRoadmapBySlug(topic.slug, {
      title,
      description,
    });
    toast("Đã cập nhật Topic", "success");
    window.dispatchEvent(new CustomEvent("roadmap:updated"));
  };

  const handleDeleteTopic = async () => {
    try {
      await roadmapService.deleteRoadmapBySlug(topic.slug);
      invalidateStatuses();
      toast(`Đã xoá topic "${topic.title}"`, "success");
      markRoadmapRefreshPending({
        deletedTopicSlug: topic.slug,
        originRouteKey: topicPath(topic.slug),
      });
      window.dispatchEvent(
        new CustomEvent("roadmap:updated", {
          detail: { skipRefresh: true, deletedTopicSlug: topic.slug },
        })
      );
      router.push("/");
    } catch {
      toast("Không xoá được topic.", "error");
    }
  };

  const handleRenameSection = async (from: string, to: string) => {
    await roadmapService.renameSection(topic.slug, { from, to });
    toast(`Đã đổi tên mục thành "${to}"`, "success");
    window.dispatchEvent(new CustomEvent("roadmap:updated"));
  };

  const handleDissolveSection = async (section: string) => {
    try {
      await roadmapService.dissolveSection(topic.slug, section);
      toast(`Đã bỏ mục "${section}"`, "success");
      window.dispatchEvent(new CustomEvent("roadmap:updated"));
    } catch {
      toast("Không bỏ được mục.", "error");
    }
  };

  const topicActionsMenu = canWrite ? (
    <ActionMenu
      label="Thao tác topic"
      items={[
        {
          label: "Thêm bài học",
          icon: FolderPlus,
          onSelect: () => {
            setTargetSection(null);
            setIsCreateItemOpen(true);
          },
        },
        {
          label: "Sửa thông tin topic",
          icon: Pencil,
          onSelect: () => setIsEditTopicOpen(true),
        },
        {
          label: "Xoá topic",
          icon: Trash2,
          danger: true,
          confirm: {
            title: `Xoá "${topic.title}"?`,
            description: "Mọi bài học trong topic này cũng bị xoá.",
            confirmLabel: "Xoá topic",
          },
          onSelect: handleDeleteTopic,
        },
      ]}
    />
  ) : null;

  const focusRail =
    !isReorderMode && focusItems.length > 0 ? (
      <nav aria-label="Đang theo dõi">
        <div className="flex items-center gap-2">
          <p className="text-[0.8125rem] font-semibold tracking-tight text-foreground">
            Đang theo dõi 👀
          </p>
        </div>
        <ul className="mt-3 space-y-2.5">
          {focusItems.map((item) => (
            <li key={item.id}>
              <Link
                href={lessonPath(topic.slug, item.slug || item.id)}
                prefetch={true}
                className="group block rounded-xl border border-border bg-card p-3 transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-[var(--editorial-accent)] hover:shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-1.5">
                  {item.status && <LessonStatusBadge status={item.status} />}
                  {item.section && (
                    <span className="truncate text-[0.6875rem] text-muted-foreground">
                      {splitSectionLabel(item.section).primary}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-xs font-semibold leading-snug text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    ) : undefined;

  return (
    <>
      <LectureShell
        topic={topic}
        siblingGroups={siblingGroups}
        activeView="summary"
        defaultOpenSectionKey={defaultOpenSectionKey}
        canWrite={canWrite}
        ownerStatusById={ownerStatusById}
        headings={[]}
        rail={collapseRightRail ? undefined : focusRail}
        collapseRightRail={collapseRightRail}
        articleDataAttributes={{
          "data-roadmap-context": true,
          "data-roadmap-slug": topic.slug,
          "data-roadmap-title": topic.title,
        }}
        nextLink={
          !isReorderMode && firstLesson
            ? {
                href: lessonPath(
                  topic.slug,
                  firstLesson.slug || firstLesson.id
                ),
                label: "Trang sau",
                title: firstLesson.title,
              }
            : undefined
        }
      >
        <header>
          <nav
            aria-label="Breadcrumb"
            className="mb-3 hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Link
              href="/"
              prefetch={true}
              className="inline-flex items-center gap-1 font-medium transition-colors hover:text-[var(--editorial-accent)]"
            >
              <span>Topics</span>
            </Link>
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span>{items.length} bài học</span>
              {SECTIONS_ENABLED && namedSections.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{namedSections.length} mục</span>
                </>
              )}
              {canWrite && ownerTotals.learning > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--status-learning)]">
                    {ownerTotals.learning} đang học
                  </span>
                </>
              )}
              {canWrite && ownerTotals.target > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--status-target)]">
                    {ownerTotals.target} mục tiêu
                  </span>
                </>
              )}
            </div>

            {canWrite && (
              <div className="flex flex-wrap items-center gap-1.5">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsReorderMode((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] cursor-pointer",
                      isReorderMode
                        ? "border-[var(--editorial-accent)] bg-[var(--editorial-accent-soft)] text-[var(--editorial-accent)]"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    )}
                  >
                    <ArrowUpDown className="size-3" />
                    <span>{isReorderMode ? "Xong sắp xếp" : "Sắp xếp"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTargetSection(null);
                    setIsCreateItemOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>Thêm bài</span>
                </button>
                {topicActionsMenu}
              </div>
            )}
          </div>

          <h1 className="mt-4 font-display text-[2rem] font-normal leading-[1.15] tracking-[-0.02em] text-foreground text-balance sm:text-[2.625rem] lg:text-[3rem]">
            {topic.title}
          </h1>

          {topic.description && (
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
              {topic.description}
            </p>
          )}
        </header>

        {items.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Topic này chưa có bài học nào.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setTargetSection(null);
                  setIsCreateItemOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Thêm bài đầu tiên</span>
              </button>
            )}
          </div>
        )}

        {items.length > 0 && isReorderMode && canWrite && (
          <div className="mt-8 space-y-4 motion-safe:animate-in motion-safe:fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              <span>Kéo thả để đổi thứ tự bài học trong mục</span>
              <button
                type="button"
                onClick={() => setIsReorderMode(false)}
                className="font-medium text-foreground transition-colors hover:text-[var(--editorial-accent)] cursor-pointer"
              >
                Xong
              </button>
            </div>
            <RoadmapMap
              embedded
              sectionGroups={siblingGroups}
              currentRoadmap={topic}
              stats={{ total: items.length }}
              canWrite={canWrite}
              isLocked={Boolean(topic.isLocked)}
              onOpenCreateItem={(sec) => {
                setTargetSection(sec);
                setIsCreateItemOpen(true);
              }}
              onRenameSection={setRenamingSection}
              onDissolveSection={handleDissolveSection}
              onReorderSection={handleReorderSection}
            />
          </div>
        )}

        {items.length > 0 && !(isReorderMode && canWrite) && (
          <div className="mt-8 space-y-10 motion-safe:animate-in motion-safe:fade-in duration-150">
            {focusItems.length > 0 && (
              <section aria-labelledby="h-focus" className={collapseRightRail ? undefined : "xl:hidden"}>
                <div className="flex items-center gap-2 border-t border-border pt-6">
                  <h2
                    id="h-focus"
                    className="scroll-mt-16 font-display text-[1.5rem] font-normal leading-snug tracking-[-0.015em] text-foreground sm:text-[1.75rem]"
                  >
                    Đang theo dõi
                  </h2>
                  <LessonStatusBadge status="target" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {focusItems.map((item) => (
                    <Link
                      key={item.id}
                      href={lessonPath(topic.slug, item.slug || item.id)}
                      prefetch={true}
                      className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-[var(--editorial-accent)] hover:shadow-xs active:scale-[0.99]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          {item.status && (
                            <LessonStatusBadge status={item.status} />
                          )}
                          {item.section && (
                            <span className="truncate text-[0.6875rem] text-muted-foreground">
                              {splitSectionLabel(item.section).primary}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2.5 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-[var(--editorial-accent)]">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="h-curriculum">
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                <h2
                  id="h-curriculum"
                  className="scroll-mt-16 font-display text-2xl font-normal leading-snug tracking-tight text-foreground"
                >
                  Nội dung lộ trình
                </h2>
                {canWrite && (
                  <div
                    role="group"
                    aria-label="Lọc bài học theo trạng thái"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {(
                      [
                        { id: "all", label: `Tất cả (${items.length})` },
                        { id: "learning", label: `Đang học (${ownerTotals.learning})` },
                        { id: "target", label: `Mục tiêu (${ownerTotals.target})` },
                        { id: "known", label: "Đã nắm" },
                      ] as const
                    ).map((opt) => (
                      <Button
                        key={opt.id}
                        type="button"
                        size="sm"
                        variant={statusFilter === opt.id ? "default" : "outline"}
                        onClick={() => setStatusFilter(opt.id)}
                        className="h-7 cursor-pointer rounded-full px-3 text-xs"
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {filteredGroups.length === 0 && (
                <p className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  Không có bài học nào khớp trạng thái đang chọn.
                </p>
              )}
              {filteredGroups.length > 0 && isSingleUnscopedGroup && (
                <ul className="mt-4 divide-y divide-border">
                  {filteredGroups[0].items.map((item) => {
                    const dotClass =
                      canWrite && item.status && item.status !== "known"
                        ? STATUS_DOT[item.status]
                        : "";
                    return (
                      <li
                        key={item.id}
                        className="flex items-baseline justify-between gap-3 py-2.5 text-sm leading-relaxed"
                      >
                        <div className="flex min-w-0 items-baseline gap-2.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-2 size-1.5 shrink-0 rounded-full",
                              dotClass || "bg-muted-foreground/50"
                            )}
                          />
                          <div className="min-w-0">
                            <Link
                              href={lessonPath(topic.slug, item.slug || item.id)}
                              prefetch={true}
                              className="font-medium text-foreground transition-colors hover:text-[var(--editorial-accent)] hover:underline underline-offset-4"
                            >
                              {item.title}
                            </Link>
                            {item.description && (
                              <span className="text-muted-foreground">
                                {" "}
                                — {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                        {canWrite && item.status && item.status !== "known" && (
                          <LessonStatusBadge status={item.status} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {filteredGroups.length > 0 && !isSingleUnscopedGroup && (
                <div className="mt-5 space-y-8">
                  {filteredGroups.map((group, idx) => {
                    const { primary, sub } = splitSectionLabel(group.section);
                    return (
                      <section
                        key={group.section ?? "__none__"}
                        aria-labelledby={`sec-${idx + 1}`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <h3
                            id={`sec-${idx + 1}`}
                            className="scroll-mt-16 text-base font-semibold tracking-tight text-foreground"
                          >
                            <span>{primary}</span>
                            {sub && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                · {sub}
                              </span>
                            )}
                          </h3>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {group.items.length} bài
                            </span>
                            {canWrite && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTargetSection(group.section);
                                    setIsCreateItemOpen(true);
                                  }}
                                  aria-label={`Thêm bài vào ${primary}`}
                                  title={`Thêm bài vào ${primary}`}
                                  className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground active:scale-95 cursor-pointer"
                                >
                                  <Plus className="size-3.5" />
                                </button>
                                {SECTIONS_ENABLED && group.section !== null && (
                                  <ActionMenu
                                    label={`Thao tác mục ${primary}`}
                                    items={[
                                      {
                                        label: "Thêm bài vào mục",
                                        icon: Plus,
                                        onSelect: () => {
                                          setTargetSection(group.section);
                                          setIsCreateItemOpen(true);
                                        },
                                      },
                                      {
                                        label: "Đổi tên mục",
                                        icon: Pencil,
                                        onSelect: () => setRenamingSection(group.section as string),
                                      },
                                      {
                                        label: "Bỏ mục (về Chung)",
                                        icon: Ungroup,
                                        confirm: {
                                          title: `Bỏ mục "${primary}"?`,
                                          description: `${group.items.length} bài học sẽ chuyển về Chung.`,
                                          confirmLabel: "Bỏ mục",
                                        },
                                        onSelect: () => void handleDissolveSection(group.section as string),
                                      },
                                    ]}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        <ul className="mt-3 divide-y divide-border">
                          {group.items.map((item) => {
                            const dotClass =
                              canWrite && item.status && item.status !== "known"
                                ? STATUS_DOT[item.status]
                                : "";
                            return (
                              <li
                                key={item.id}
                                className="flex items-baseline justify-between gap-3 py-2.5 text-sm leading-relaxed"
                              >
                                <div className="flex min-w-0 items-baseline gap-2.5">
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "mt-2 size-1.5 shrink-0 rounded-full",
                                      dotClass || "bg-muted-foreground/50"
                                    )}
                                  />
                                  <div className="min-w-0">
                                    <Link
                                      href={lessonPath(
                                        topic.slug,
                                        item.slug || item.id
                                      )}
                                      prefetch={true}
                                      className="font-medium text-foreground transition-colors hover:text-[var(--editorial-accent)] hover:underline underline-offset-4"
                                    >
                                      {item.title}
                                    </Link>
                                    {item.description && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        — {item.description}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {canWrite && item.status && item.status !== "known" && (
                                  <LessonStatusBadge status={item.status} />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </LectureShell>

      <CreateItemModal
        isOpen={isCreateItemOpen}
        sections={namedSections}
        targetSection={targetSection}
        onClose={() => setIsCreateItemOpen(false)}
        onSubmit={handleCreateItem}
      />

      <EditTopicModal
        isOpen={isEditTopicOpen}
        topic={topic}
        onClose={() => setIsEditTopicOpen(false)}
        onSubmit={handleEditTopic}
      />

      <EditSectionModal
        isOpen={renamingSection !== null}
        section={renamingSection}
        existingSections={namedSections}
        onClose={() => setRenamingSection(null)}
        onSubmit={handleRenameSection}
      />
    </>
  );
}
