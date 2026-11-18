'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ChecklistItem, RoadmapMeta, SectionGroup } from '@/lib/roadmap/types';
import type { LessonStatus } from '@/lib/roadmap/status';
import {
  getCachedOwnerStatuses,
  invalidateCachedOwnerStatuses,
  setCachedOwnerStatuses,
} from '@/lib/roadmap/owner-status-cache';
import { markPendingLessonWrite } from '@/lib/roadmap/pending-write';
import { splitSectionLabel } from '@/lib/roadmap/section-label';
import { cn } from '@/lib/utils';
import { useCanWrite } from '@/hooks/use-can-write';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/action-menu';
import * as roadmapService from '@/logic/roadmap/roadmapService';
import { RoadmapMap } from './RoadmapMap';
import { CreateItemModal, type CreateItemOptions } from './CreateItemModal';
import { EditTopicModal } from './EditTopicModal';
import { EditSectionModal } from './EditSectionModal';
import { SECTIONS_ENABLED } from './sectionsEnabled';

interface TopicEditorialPageProps {
  topic: RoadmapMeta & { updatedAt: string };
  initialItems: ChecklistItem[];
  initialSections: (string | null)[];
  initialSelectedSection?: string | null | 'all';
}

export function TopicEditorialPage({
  topic,
  initialItems,
  initialSections,
  initialSelectedSection = 'all',
}: TopicEditorialPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [ownerStatusById, setOwnerStatusById] = useState<Record<string, LessonStatus>>(
    () => getCachedOwnerStatuses(topic.slug) ?? {}
  );
  const [selectedSection, setSelectedSection] = useState<string | null | 'all'>(
    initialSelectedSection
  );
  const [optimisticOrder, setOptimisticOrder] = useState<{
    baseKey: string;
    items: ChecklistItem[];
  } | null>(null);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [targetSection, setTargetSection] = useState<string | null>(null);
  const [isEditTopicOpen, setIsEditTopicOpen] = useState(false);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);

  const loadOwnerStatuses = useCallback(() => {
    if (!canWrite) return;
    roadmapService
      .fetchRoadmapBySlug(topic.slug, { mode: 'outline' })
      .then((data) => {
        const next: Record<string, LessonStatus> = {};
        for (const it of data.items) {
          if (it.status) next[it.id] = it.status;
        }
        setCachedOwnerStatuses(topic.slug, next);
        setOwnerStatusById(next);
      })
      .catch(() => {});
  }, [canWrite, topic.slug]);

  useEffect(() => {
    loadOwnerStatuses();
  }, [loadOwnerStatuses]);

  useEffect(() => {
    const handleUpdate = () => {
      invalidateCachedOwnerStatuses(topic.slug);
      router.refresh();
      loadOwnerStatuses();
    };
    window.addEventListener('roadmap:updated', handleUpdate);
    return () => window.removeEventListener('roadmap:updated', handleUpdate);
  }, [router, loadOwnerStatuses, topic.slug]);

  const baseKey = useMemo(
    () => initialItems.map((it) => `${it.id}:${it.section ?? ''}:${it.order}`).join('|'),
    [initialItems]
  );

  const items = useMemo<ChecklistItem[]>(() => {
    const sourceItems =
      optimisticOrder && optimisticOrder.baseKey === baseKey ? optimisticOrder.items : initialItems;
    if (!canWrite) return sourceItems;
    return sourceItems.map((it) =>
      ownerStatusById[it.id] ? { ...it, status: ownerStatusById[it.id] } : it
    );
  }, [initialItems, optimisticOrder, baseKey, canWrite, ownerStatusById]);

  const namedSections = useMemo(
    () => initialSections.filter((s): s is string => s !== null),
    [initialSections]
  );

  const activeSection =
    selectedSection === 'all' || initialSections.includes(selectedSection)
      ? selectedSection
      : 'all';

  const allSectionGroups = useMemo<SectionGroup[]>(() => {
    if (!SECTIONS_ENABLED) {
      return [{ section: null, items }];
    }
    return initialSections.map((sec) => ({
      section: sec,
      items: items.filter((it) => (it.section ?? null) === sec),
    }));
  }, [initialSections, items]);

  const visibleSectionGroups = useMemo<SectionGroup[]>(() => {
    if (!SECTIONS_ENABLED || activeSection === 'all') {
      return allSectionGroups;
    }
    return allSectionGroups.filter((g) => g.section === activeSection);
  }, [allSectionGroups, activeSection]);

  const ownerTotals = useMemo(() => {
    let learning = 0;
    let target = 0;
    for (const it of items) {
      if (it.status === 'learning') learning += 1;
      else if (it.status === 'target') target += 1;
    }
    return { learning, target };
  }, [items]);

  const handleSelectSection = (next: string | null | 'all') => {
    setSelectedSection(next);
    const url = new URL(window.location.href);
    if (next === 'all' || next === null) {
      url.searchParams.delete('section');
    } else {
      url.searchParams.set('section', next);
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

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
      invalidateCachedOwnerStatuses(topic.slug);
      window.dispatchEvent(new CustomEvent('roadmap:updated'));
      if (options?.openEditor && item?.slug) {
        markPendingLessonWrite(item.slug);
        router.push(`/lessons/${item.slug}`);
        return;
      }
      toast(`Đã thêm bài "${title}"`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không thêm được bài học.', 'error');
    }
  };

  const handleReorderSection = async (section: string | null, reordered: ChecklistItem[]) => {
    const nextItems = SECTIONS_ENABLED
      ? allSectionGroups.flatMap((g) => (g.section === section ? reordered : g.items))
      : reordered;
    setOptimisticOrder({ baseKey, items: nextItems });
    try {
      await roadmapService.reorderItems({
        orderedItemIds: nextItems.map((it) => it.id),
      });
      window.dispatchEvent(new CustomEvent('roadmap:updated'));
    } catch {
      setOptimisticOrder(null);
      toast('Không sắp xếp lại được bài học.', 'error');
    }
  };

  const handleEditTopic = async (title: string, description?: string) => {
    await roadmapService.updateRoadmapBySlug(topic.slug, { title, description });
    toast('Đã cập nhật Topic', 'success');
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
  };

  const handleDeleteTopic = async () => {
    try {
      await roadmapService.deleteRoadmapBySlug(topic.slug);
      invalidateCachedOwnerStatuses(topic.slug);
      toast(`Đã xoá topic "${topic.title}"`, 'success');
      router.push('/');
      router.refresh();
    } catch {
      toast('Không xoá được topic.', 'error');
    }
  };

  const handleRenameSection = async (from: string, to: string) => {
    try {
      await roadmapService.renameSection(topic.slug, { from, to });
      if (activeSection === from) {
        handleSelectSection(to);
      }
      toast(`Đã đổi tên mục thành "${to}"`, 'success');
      window.dispatchEvent(new CustomEvent('roadmap:updated'));
    } catch {
      toast('Không đổi tên được mục.', 'error');
    }
  };

  const handleDissolveSection = async (section: string) => {
    try {
      await roadmapService.dissolveSection(topic.slug, section);
      if (activeSection === section) {
        handleSelectSection('all');
      }
      toast(`Đã bỏ mục "${section}"`, 'success');
      window.dispatchEvent(new CustomEvent('roadmap:updated'));
    } catch {
      toast('Không bỏ được mục.', 'error');
    }
  };

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:px-6 sm:pb-16"
    >
      <Link
        href="/"
        prefetch={true}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Topics
      </Link>

      <div className="mt-2.5 flex items-start justify-between gap-4 border-b border-border/80 pb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance sm:text-3xl">
            {topic.title}
          </h1>
          {topic.description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {topic.description}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{items.length} bài học</span>
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
        </div>

        {canWrite && (
          <ActionMenu
            label="Thao tác topic"
            items={[
              {
                label: 'Thêm bài học',
                icon: FolderPlus,
                onSelect: () => {
                  setTargetSection(activeSection === 'all' ? null : activeSection);
                  setIsCreateItemOpen(true);
                },
              },
              {
                label: 'Sửa thông tin topic',
                icon: Pencil,
                onSelect: () => setIsEditTopicOpen(true),
              },
              {
                label: 'Xoá topic',
                icon: Trash2,
                danger: true,
                confirm: {
                  title: `Xoá "${topic.title}"?`,
                  description: 'Mọi bài học trong topic này cũng bị xoá.',
                  confirmLabel: 'Xoá topic',
                },
                onSelect: handleDeleteTopic,
              },
            ]}
          />
        )}
      </div>

      {SECTIONS_ENABLED && namedSections.length >= 2 && (
        <div
          role="tablist"
          aria-label="Lọc theo mục"
          className="mt-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'all'}
            onClick={() => handleSelectSection('all')}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-[border-color,background-color,color,transform] duration-150 active:scale-[0.98] cursor-pointer',
              activeSection === 'all'
                ? 'border-foreground bg-foreground font-medium text-background'
                : 'border-border/90 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            <span>Tất cả</span>
            <span
              className={cn(
                'tabular-nums text-[0.6875rem]',
                activeSection === 'all' ? 'text-background/75' : 'text-muted-foreground/75'
              )}
            >
              {items.length}
            </span>
          </button>

          {initialSections.map((sec) => {
            const key = sec ?? '__none__';
            const isSelected = activeSection === sec;
            const { primary, sub } = splitSectionLabel(sec);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectSection(sec)}
                title={sec ?? 'Chung'}
                className={cn(
                  'inline-flex max-w-[16rem] shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-[border-color,background-color,color,transform] duration-150 active:scale-[0.98] cursor-pointer',
                  isSelected
                    ? 'border-foreground bg-foreground font-medium text-background'
                    : 'border-border/90 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                <span className="truncate">{primary}</span>
                {sub && (
                  <span
                    className={cn(
                      'shrink-0 text-[0.6875rem]',
                      isSelected ? 'text-background/75' : 'text-muted-foreground/75'
                    )}
                  >
                    · {sub}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">Topic này chưa có bài học nào.</p>
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
                Thêm bài đầu tiên
              </button>
            )}
          </div>
        ) : (
          <RoadmapMap
            embedded
            sectionGroups={visibleSectionGroups}
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
        )}
      </div>

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
    </main>
  );
}
