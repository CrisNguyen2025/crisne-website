"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpDown, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { markPendingLessonWrite } from "@/lib/roadmap/pending-write";
import { splitSectionLabel } from "@/lib/roadmap/section-label";
import { groupBySection } from "@/lib/roadmap/sections";
import type { LessonStatus } from "@/lib/roadmap/status";
import type {
  ChecklistItem,
  RoadmapMeta,
  SectionGroup,
} from "@/lib/roadmap/types";
import { useCanWrite } from "@/hooks/use-can-write";
import { ActionMenu } from "@/components/ui/action-menu";
import { useToast } from "@/components/ui/toast";
import * as roadmapService from "@/logic/roadmap/roadmapService";
import { cn } from "@/lib/utils";
import { lessonPath } from "@/lib/roadmap/paths";
import { CreateItemModal, type CreateItemOptions } from "./CreateItemModal";
import { EditSectionModal } from "./EditSectionModal";
import { EditTopicModal } from "./EditTopicModal";
import { LectureShell } from "./LectureShell";
import { LessonStatusBadge } from "./LessonStatus";
import { RoadmapMap } from "./RoadmapMap";
import { SECTIONS_ENABLED } from "./sectionsEnabled";
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
  const { ownerStatusById, invalidateStatuses } = useTopicOwnerStatuses(
    topic.slug,
    canWrite
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

  const baseKey = useMemo(
    () =>
      initialItems
        .map((it) => `${it.id}:${it.section ?? ""}:${it.order}`)
        .join("|"),
    [initialItems]
  );

  const items = useMemo<ChecklistItem[]>(() => {
    const sourceItems =
      optimisticOrder && optimisticOrder.baseKey === baseKey
        ? optimisticOrder.items
        : initialItems;
    if (!canWrite) return sourceItems;
    return sourceItems.map((it) =>
      ownerStatusById[it.id] ? { ...it, status: ownerStatusById[it.id] } : it
    );
  }, [initialItems, optimisticOrder, baseKey, canWrite, ownerStatusById]);

  const namedSections = useMemo(
    () => initialSections.filter((s): s is string => s !== null),
    [initialSections]
  );

  const siblingGroups = useMemo<SectionGroup[]>(() => {
    if (!SECTIONS_ENABLED) {
      return [{ section: null, items }];
    }
    return groupBySection(items, initialSections);
  }, [items, initialSections]);

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

  useEffect(() => {
    if (!initialSelectedSection || initialSelectedSection === "all") return;
    const idx = siblingGroups.findIndex(
      (g) => g.section === initialSelectedSection
    );
    if (idx < 0) return;
    const el = document.getElementById(`sec-${idx + 1}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    try {
      const { item } = await roadmapService.createItem({
        roadmapSlug: topic.slug,
        section,
        title,
        description,
      });
      invalidateStatuses();
      window.dispatchEvent(new CustomEvent("roadmap:updated"));
      if (options?.openEditor && item?.slug) {
        markPendingLessonWrite(item.slug);
        router.push(lessonPath(topic.slug, item.slug));
        return;
      }
      toast(`Đã thêm bài "${title}"`, "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Không thêm được bài học.",
        "error"
      );
    }
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
      router.push("/");
      router.refresh();
    } catch {
      toast("Không xoá được topic.", "error");
    }
  };

  const handleRenameSection = async (from: string, to: string) => {
    try {
      await roadmapService.renameSection(topic.slug, { from, to });
      toast(`Đã đổi tên mục thành "${to}"`, "success");
      window.dispatchEvent(new CustomEvent("roadmap:updated"));
    } catch {
      toast("Không đổi tên được mục.", "error");
    }
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
                className="group block rounded-xl border border-border bg-card p-3 transition-colors duration-150 hover:border-[var(--editorial-accent)] hover:shadow-xs"
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
        rail={focusRail}
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
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
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
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
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

        {items.length === 0 ? (
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
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Thêm bài đầu tiên</span>
              </button>
            )}
          </div>
        ) : isReorderMode && canWrite ? (
          <div className="mt-8">
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
        ) : (
          <div className="mt-8 space-y-10">
            {focusItems.length > 0 && (
              <section aria-labelledby="h-focus" className="xl:hidden">
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
                      className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:border-[var(--editorial-accent)]"
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
              <h2
                id="h-curriculum"
                className="scroll-mt-16 border-t border-border pt-6 font-display text-[1.5rem] font-normal leading-snug tracking-[-0.015em] text-foreground sm:text-[1.75rem]"
              >
                Nội dung lộ trình
              </h2>

              {isSingleUnscopedGroup ? (
                <ul className="mt-4 space-y-3">
                  {siblingGroups[0].items.map((item) => {
                    const dotClass =
                      canWrite && item.status && item.status !== "known"
                        ? STATUS_DOT[item.status]
                        : "";
                    return (
                      <li
                        key={item.id}
                        className="flex items-baseline gap-2.5 text-sm leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-2 size-1.5 shrink-0 rounded-full",
                            dotClass || "bg-[var(--editorial-accent)]"
                          )}
                        />
                        <div className="min-w-0">
                          <Link
                            href={lessonPath(topic.slug, item.slug || item.id)}
                            prefetch={true}
                            className="font-medium text-[var(--editorial-accent)] hover:underline underline-offset-4"
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
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-5 space-y-8">
                  {siblingGroups.map((group, idx) => {
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
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetSection(group.section);
                                  setIsCreateItemOpen(true);
                                }}
                                aria-label={`Thêm bài vào ${primary}`}
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)] hover:text-foreground cursor-pointer"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <ul className="mt-3 space-y-2.5">
                          {group.items.map((item) => {
                            const dotClass =
                              canWrite && item.status && item.status !== "known"
                                ? STATUS_DOT[item.status]
                                : "";
                            return (
                              <li
                                key={item.id}
                                className="flex items-baseline gap-2.5 text-sm leading-relaxed"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "mt-2 size-1.5 shrink-0 rounded-full",
                                    dotClass || "bg-[var(--editorial-accent)]"
                                  )}
                                />
                                <div className="min-w-0">
                                  <Link
                                    href={lessonPath(
                                      topic.slug,
                                      item.slug || item.id
                                    )}
                                    prefetch={true}
                                    className="font-medium text-[var(--editorial-accent)] hover:underline underline-offset-4"
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
        onClose={() => setRenamingSection(null)}
        onSubmit={handleRenameSection}
      />
    </>
  );
}
