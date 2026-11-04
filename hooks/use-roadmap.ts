'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import { ChecklistItem, GetRoadmapResponseDto, RoadmapMeta } from '@/lib/roadmap/types';
import * as roadmapService from '@/logic/roadmap/roadmapService';
import { sectionSpelling } from '@/lib/roadmap/sections';
import type { LessonStatus } from '@/lib/roadmap/status';

/** One topic as the page holds it: lessons in page order, and their sections (ADR-0009). */
interface TopicState {
  roadmap: RoadmapMeta;
  items: ChecklistItem[];
  sections: (string | null)[];
}

/** A section and the lessons in it, in page order. `section` is null for lessons outside any section. */
export interface SectionGroup {
  section: string | null;
  items: ChecklistItem[];
}

// In-memory cache across topic switches for instant, smooth transitions
const topicCache = new Map<string, TopicState>();

function syncCache(slug: string, updater: (cached: TopicState) => TopicState) {
  const current = topicCache.get(slug);
  if (current) {
    topicCache.set(slug, updater(current));
  }
}

/** Lessons grouped by section, in the order the sections appear. */
function groupBySection(items: ChecklistItem[], sections: (string | null)[]): SectionGroup[] {
  return sections.map((section) => ({
    section,
    items: items.filter((item) => (item.section ?? null) === section),
  }));
}

/** Loads a topic and keeps it in sync. An empty slug (Home, no topic open) loads nothing. */
export function useRoadmap(slug: string, initialActiveItemId?: string) {
  const cached = topicCache.get(slug);
  const [roadmapMeta, setRoadmapMeta] = useState<RoadmapMeta | null>(() => cached?.roadmap ?? null);
  const [items, setItems] = useState<ChecklistItem[]>(() => cached?.items ?? []);
  const [sections, setSections] = useState<(string | null)[]>(() => cached?.sections ?? []);
  const [activeItemId, setActiveItemId] = useState<string>(initialActiveItemId || '');
  const [selectedSection, setSelectedSection] = useState<string | null | 'all'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(slug) && !topicCache.has(slug));
  const [isError, setIsError] = useState<boolean>(false);
  // The slug that answered 404 (e.g. deleted through the assistant while open). Kept per slug: a 404 for the
  // topic just left must not mark the one just opened as missing.
  const [notFoundSlug, setNotFoundSlug] = useState<string | null>(null);
  const isNotFound = Boolean(slug) && notFoundSlug === slug;

  // The slug on screen: a response for another one (the user switched topics meanwhile) only fills the cache.
  // Synced in an effect declared before the load effect, so it is current when a load starts.
  const currentSlugRef = useRef(slug);
  useEffect(() => {
    currentSlugRef.current = slug;
  }, [slug]);

  // Keep a ref of initialActiveItemId so loadRoadmap doesn't recreate when clicking items
  const initialActiveItemIdRef = useRef(initialActiveItemId);
  useEffect(() => {
    initialActiveItemIdRef.current = initialActiveItemId;
  }, [initialActiveItemId]);

  const pickActive = useCallback((list: ChecklistItem[]) => {
    const wanted = initialActiveItemIdRef.current;
    const match = wanted
      ? list.find((i) => i.id === wanted || i.slug === wanted || i.title === wanted)
      : undefined;
    return match?.id ?? list[0]?.id ?? '';
  }, []);

  // 1. Fetch a topic and its lessons by slug
  const loadRoadmap = useCallback(async (targetSlug: string, silent: boolean = false) => {
    const hit = topicCache.get(targetSlug);
    if (hit) {
      setRoadmapMeta(hit.roadmap);
      setItems(hit.items);
      setSections(hit.sections);
      if (!silent) {
        setIsLoading(false);
        setActiveItemId(pickActive(hit.items));
      }
    } else if (!silent) {
      setIsLoading(true);
      setActiveItemId('');
    }
    setIsError(false);
    setNotFoundSlug(null);

    const isCurrent = () => currentSlugRef.current === targetSlug;
    try {
      const data: GetRoadmapResponseDto = await roadmapService.fetchRoadmapBySlug(targetSlug);
      const state: TopicState = { roadmap: data.roadmap, items: data.items, sections: data.sections };
      topicCache.set(targetSlug, state);
      if (!isCurrent()) return;

      setRoadmapMeta(state.roadmap);
      setItems(state.items);
      setSections(state.sections);
      if (!silent) setActiveItemId(pickActive(state.items));
    } catch (err) {
      // Also on a silent refresh: the cached copy of a deleted topic must not stay on screen
      if ((err as { status?: number }).status === 404) {
        topicCache.delete(targetSlug);
        setNotFoundSlug(targetSlug);
        return;
      }
      if (!isCurrent()) return;
      console.error('[useRoadmap] Failed to load roadmap:', err);
      if (!hit && !silent) {
        setIsError(true);
      }
    } finally {
      if (!silent && isCurrent()) {
        setIsLoading(false);
      }
    }
  }, [pickActive]);

  useEffect(() => {
    if (!slug) return;
    loadRoadmap(slug);
  }, [slug, loadRoadmap]);

  // Re-fetch the open topic when the assistant creates/updates/deletes data
  useEffect(() => {
    if (!slug) return;
    const handleUpdate = () => loadRoadmap(slug, true);
    window.addEventListener('roadmap:updated', handleUpdate);
    return () => window.removeEventListener('roadmap:updated', handleUpdate);
  }, [slug, loadRoadmap]);

  // 2. Topic settings
  const editRoadmap = useCallback(
    async (title: string, description?: string) => {
      try {
        const { roadmap: updated } = await roadmapService.updateRoadmapBySlug(slug, {
          title: title.trim(),
          description: description?.trim(),
        });
        setRoadmapMeta((prev) => (prev ? { ...prev, ...updated } : updated));
        syncCache(slug, (curr) => ({ ...curr, roadmap: { ...curr.roadmap, ...updated } }));
      } catch (err) {
        console.error('[useRoadmap] Failed to edit roadmap:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  const toggleRoadmapLock = useCallback(async () => {
    const next = !roadmapMeta?.isLocked;
    try {
      const { roadmap: updated } = await roadmapService.updateRoadmapBySlug(slug, { isLocked: next });
      setRoadmapMeta((prev) => (prev ? { ...prev, ...updated } : updated));
      syncCache(slug, (curr) => ({ ...curr, roadmap: { ...curr.roadmap, ...updated } }));
    } catch (err) {
      console.error('[useRoadmap] Failed to toggle lock:', err);
    }
  }, [roadmapMeta?.isLocked, slug]);

  // 3. Add a lesson. The section is reused by its existing spelling, or created with the name given.
  const addItem = useCallback(
    async (section: string | null, title: string, description: string, content?: string) => {
      const tempId = `temp-item-${Date.now()}`;
      const usedSection = sectionSpelling(sections, section);
      const optimisticItem: ChecklistItem = {
        id: tempId,
        title: title.trim(),
        description: description.trim(),
        section: usedSection,
        order: items.length + 1,
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      };

      // Optimistic insert: the lesson shows before the server answers
      const withItem = (prev: ChecklistItem[]) => [...prev, optimisticItem];
      setItems(withItem);
      setActiveItemId(tempId);
      const newSections = usedSection !== null && !sections.includes(usedSection) ? [...sections, usedSection] : sections;
      setSections(newSections);
      syncCache(slug, (curr) => ({ ...curr, items: withItem(curr.items), sections: newSections }));

      try {
        const { item } = await roadmapService.createItem({
          roadmapSlug: slug,
          section: usedSection,
          title: title.trim(),
          description: description.trim(),
          content,
        });
        setActiveItemId(item.id);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to add item:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [items.length, sections, slug, loadRoadmap]
  );

  // 4. Edit a lesson. A changed section moves it; the list is reloaded so it lands in the right place.
  const editItem = useCallback(
    async (id: string, title: string, description: string, section?: string | null) => {
      try {
        const patch = (prev: ChecklistItem[]) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, title: title.trim(), description: description.trim(), updatedAt: dayjs().toISOString() }
              : item
          );
        setItems(patch);
        syncCache(slug, (curr) => ({ ...curr, items: patch(curr.items) }));

        await roadmapService.updateItemInfo({
          id,
          title: title.trim(),
          description: description.trim(),
          section,
        });

        if (section !== undefined) {
          topicCache.delete(slug);
          await loadRoadmap(slug, true);
        }
      } catch (err) {
        console.error('[useRoadmap] Failed to update item info:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 4b. Set a lesson's Lesson Status (ADR-0010): shown at once, reloaded from the server if the write fails
  const changeItemStatus = useCallback(
    async (id: string, status: LessonStatus) => {
      const patch = (prev: ChecklistItem[]) =>
        prev.map((item) =>
          item.id === id ? { ...item, status, statusUpdatedAt: dayjs().toISOString() } : item
        );
      setItems(patch);
      syncCache(slug, (curr) => ({ ...curr, items: patch(curr.items) }));
      try {
        await roadmapService.updateItemStatus(id, status);
      } catch (err) {
        console.error('[useRoadmap] Failed to update lesson status:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 5. Delete a lesson
  const deleteItem = useCallback(
    async (itemId: string) => {
      const remaining = items.filter((item) => item.id !== itemId);
      setItems(remaining);
      if (activeItemId === itemId) setActiveItemId(remaining[0]?.id ?? '');
      syncCache(slug, (curr) => ({ ...curr, items: curr.items.filter((item) => item.id !== itemId) }));
      try {
        await roadmapService.deleteItem(itemId);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to delete item:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [activeItemId, items, slug, loadRoadmap]
  );

  // 6. Rename a section: every lesson in it moves to the new name
  const renameSection = useCallback(
    async (from: string, to: string) => {
      try {
        await roadmapService.renameSection(slug, { from, to });
        topicCache.delete(slug);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to rename section:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 6b. Dissolve a section: its lessons move to the general group
  const dissolveSection = useCallback(
    async (section: string) => {
      try {
        await roadmapService.dissolveSection(slug, section);
        if (selectedSection === section) {
          setSelectedSection('all');
        }
        topicCache.delete(slug);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to dissolve section:', err);
        topicCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap, selectedSection, setSelectedSection]
  );

  // 7. Update a lesson's rich-text content (editor). Rolled back when the server refuses.
  const updateNote = useCallback(
    async (itemId: string, content: string) => {
      const prevItems = items;
      const patch = (prev: ChecklistItem[]) =>
        prev.map((item) => (item.id === itemId ? { ...item, content, updatedAt: dayjs().toISOString() } : item));
      setItems(patch);
      syncCache(slug, (curr) => ({ ...curr, items: patch(curr.items) }));

      try {
        await roadmapService.updateItemContent({ id: itemId, content });
      } catch (err) {
        console.error('[useRoadmap] Failed to update item content:', err);
        setItems(prevItems);
        syncCache(slug, (curr) => ({ ...curr, items: prevItems }));
        throw err;
      }
    },
    [items, slug]
  );

  // 8. Reorder the topic's lessons (drag and drop on the page)
  const reorderItems = useCallback(
    async (newItems: ChecklistItem[]) => {
      try {
        setItems(newItems);
        syncCache(slug, (curr) => ({ ...curr, items: newItems }));
        await roadmapService.reorderItems({ orderedItemIds: newItems.map((item) => item.id) });
      } catch (err) {
        console.error('[useRoadmap] Failed to reorder items:', err);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  const selectActiveItem = useCallback((id: string) => {
    setActiveItemId(id);
  }, []);

  const stats = useMemo(() => ({ total: items.length }), [items.length]);

  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    const found = items.find((item) => item.id === activeItemId);
    return found ? { ...found, sections: sections.filter((s): s is string => s !== null) } : null;
  }, [items, sections, activeItemId]);

  const sectionGroups = useMemo(() => groupBySection(items, sections), [items, sections]);

  const filteredItems = useMemo(() => {
    if (selectedSection === 'all') return items;
    return items.filter((item) => (item.section ?? null) === selectedSection);
  }, [items, selectedSection]);

  return {
    roadmapMeta,
    items,
    sections,
    sectionGroups,
    filteredItems,
    activeItemId,
    activeItem,
    selectedSection,
    stats,
    isLoading,
    isError,
    isNotFound,
    setSelectedSection,
    editRoadmap,
    toggleRoadmapLock,
    addItem,
    editItem,
    changeItemStatus,
    deleteItem,
    renameSection,
    dissolveSection,
    updateNote,
    reorderItems,
    selectActiveItem,
    refetch: () => loadRoadmap(slug),
  };
}
