'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import {
  ChecklistItem,
  RoadmapLayer,
  RoadmapLevel,
  RoadmapStats,
  RoadmapMeta,
} from '@/lib/roadmap/types';
import * as roadmapService from '@/logic/roadmap/roadmapService';
import { slugify } from '@/lib/utils';

// In-memory cache across topic switches for instant, smooth transitions
const roadmapCache = new Map<string, { roadmap: RoadmapMeta; layers: RoadmapLayer[] }>();

function syncCache(slug: string, updater: (cached: { roadmap: RoadmapMeta; layers: RoadmapLayer[] }) => { roadmap: RoadmapMeta; layers: RoadmapLayer[] }) {
  const current = roadmapCache.get(slug);
  if (current) {
    roadmapCache.set(slug, updater(current));
  }
}

export function useRoadmap(slug: string = 'ai-architecture', initialActiveItemId?: string) {
  const [roadmapMeta, setRoadmapMeta] = useState<RoadmapMeta | null>(() => roadmapCache.get(slug)?.roadmap || null);
  const [layers, setLayers] = useState<RoadmapLayer[]>(() => roadmapCache.get(slug)?.layers || []);
  const [activeItemId, setActiveItemId] = useState<string>(initialActiveItemId || '');
  const [selectedLayerId, setSelectedLayerId] = useState<string | 'all'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(() => !roadmapCache.has(slug));
  const [isError, setIsError] = useState<boolean>(false);

  // Keep a ref of initialActiveItemId so loadRoadmap doesn't recreate when clicking items
  const initialActiveItemIdRef = useRef(initialActiveItemId);
  useEffect(() => {
    initialActiveItemIdRef.current = initialActiveItemId;
  }, [initialActiveItemId]);

  // 1. Fetch roadmap hierarchy from API by slug
  const loadRoadmap = useCallback(async (targetSlug: string, silent: boolean = false) => {
    const targetItemId = initialActiveItemIdRef.current;
    // If cached, apply cache immediately for seamless zero-flicker transition
    const cached = roadmapCache.get(targetSlug);
    if (cached) {
      setRoadmapMeta(cached.roadmap);
      setLayers(cached.layers);
      if (!silent) setIsLoading(false);
      // Select first item or matching item immediately from cache if no active item
      let matchedId = '';
      if (targetItemId) {
        for (const layer of cached.layers) {
          for (const group of layer.groups) {
            const found = group.items.find(
              (i) => i.id === targetItemId || i.slug === targetItemId || slugify(i.title) === targetItemId
            );
            if (found) {
              matchedId = found.id;
              break;
            }
          }
          if (matchedId) break;
        }
      }
      if (!silent) {
        setActiveItemId(matchedId || cached.layers[0]?.groups[0]?.items[0]?.id || '');
      }
    } else {
      if (!silent) {
        setIsLoading(true);
        setActiveItemId('');
      }
    }
    setIsError(false);

    try {
      const data = await roadmapService.fetchRoadmapBySlug(targetSlug);
      // Update cache
      roadmapCache.set(targetSlug, data);

      setRoadmapMeta(data.roadmap);
      setLayers(data.layers);

      // Select initial item (match by id OR slug) or first available item
      let matchedId = '';
      const currentTarget = initialActiveItemIdRef.current;
      if (currentTarget) {
        for (const layer of data.layers) {
          for (const group of layer.groups) {
            const found = group.items.find(
              (i) => i.id === currentTarget || i.slug === currentTarget || slugify(i.title) === currentTarget
            );
            if (found) {
              matchedId = found.id;
              break;
            }
          }
          if (matchedId) break;
        }
      }

      if (matchedId) {
        setActiveItemId(matchedId);
      } else if (!silent) {
        const firstItem = data.layers[0]?.groups[0]?.items[0];
        setActiveItemId(firstItem ? firstItem.id : '');
      }
    } catch (err) {
      console.error('[useRoadmap] Failed to load roadmap:', err);
      if (!cached && !silent) {
        setIsError(true);
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadRoadmap(slug);
  }, [slug, loadRoadmap]);

  // 2. Add Layer with Instant Optimistic UI
  const addLayer = useCallback(
    async (title: string, shortTag: string, subtitle?: string) => {
      const tempLayerId = `temp-layer-${Date.now()}`;
      const optimisticLayer: RoadmapLayer = {
        id: tempLayerId,
        order: layers.length + 1,
        shortTag: shortTag.trim().toUpperCase(),
        title: title.trim(),
        subtitle: subtitle?.trim() || '',
        groups: [
          {
            id: `temp-grp-core-${Date.now()}`,
            level: 'core',
            title: '🟢 Core',
            items: [],
          },
        ],
      };

      const updatedLayers = (prev: RoadmapLayer[]) => [...prev, optimisticLayer];
      setLayers(updatedLayers);
      syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

      try {
        await roadmapService.createLayer(slug, {
          title: title.trim(),
          shortTag: shortTag.trim().toUpperCase(),
          subtitle: subtitle?.trim(),
        });
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to add layer:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, layers.length, loadRoadmap]
  );

  // 2.1 Edit Roadmap
  const editRoadmap = useCallback(
    async (title: string, shortCode: string, description?: string) => {
      try {
        const { roadmap: updated } = await roadmapService.updateRoadmapBySlug(slug, {
          title: title.trim(),
          shortCode: shortCode.trim().toUpperCase(),
          description: description?.trim(),
        });
        setRoadmapMeta((prev) => (prev ? { ...prev, ...updated } : updated));
        const currentCache = roadmapCache.get(slug);
        if (currentCache) {
          roadmapCache.set(slug, {
            ...currentCache,
            roadmap: { ...currentCache.roadmap, ...updated },
          });
        }
      } catch (err) {
        console.error('[useRoadmap] Failed to edit roadmap:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 2.2 Toggle Roadmap Lock
  const toggleRoadmapLock = useCallback(
    async (locked?: boolean) => {
      const nextLocked = locked !== undefined ? locked : !roadmapMeta?.isLocked;
      // Optimistic update
      setRoadmapMeta((prev) => (prev ? { ...prev, isLocked: nextLocked } : null));
      const currentCache = roadmapCache.get(slug);
      if (currentCache) {
        roadmapCache.set(slug, {
          ...currentCache,
          roadmap: { ...currentCache.roadmap, isLocked: nextLocked },
        });
      }

      try {
        await roadmapService.updateRoadmapBySlug(slug, { isLocked: nextLocked });
      } catch (err) {
        console.error('[useRoadmap] Failed to toggle roadmap lock:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, roadmapMeta?.isLocked, loadRoadmap]
  );

  // 3. Edit Layer
  const editLayer = useCallback(
    async (layerId: string, title: string, shortTag: string, subtitle?: string) => {
      try {
        await roadmapService.updateLayer({
          id: layerId,
          title: title.trim(),
          shortTag: shortTag.trim().toUpperCase(),
          subtitle: subtitle?.trim(),
        });
        roadmapCache.delete(slug);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to edit layer:', err);
      }
    },
    [slug, loadRoadmap]
  );

  // 4. Delete Layer
  const deleteLayer = useCallback(
    async (layerId: string) => {
      try {
        const updatedLayers = (prev: RoadmapLayer[]) => prev.filter((l) => l.id !== layerId);
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

        await roadmapService.deleteLayer(layerId);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to delete layer:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 4.1 Add Group to Layer with Instant Optimistic UI
  const addGroup = useCallback(
    async (layerId: string, title: string, level?: string) => {
      const tempGroupId = `temp-grp-${Date.now()}`;
      const groupLevel = (level || 'core') as RoadmapLevel;
      const optimisticGroup = {
        id: tempGroupId,
        level: groupLevel,
        title: title.trim(),
        items: [],
      };

      const updatedLayers = (prev: RoadmapLayer[]) =>
        prev.map((layer) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            groups: [...layer.groups, optimisticGroup],
          };
        });

      setLayers(updatedLayers);
      syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

      try {
        const { group: created } = await roadmapService.createGroup(layerId, title, level);
        if (created?.id) {
          const replaceGroupIdLayers = (prev: RoadmapLayer[]) =>
            prev.map((layer) => ({
              ...layer,
              groups: layer.groups.map((g) => (g.id === tempGroupId ? { ...g, id: created.id } : g)),
            }));
          setLayers(replaceGroupIdLayers);
          syncCache(slug, (curr) => ({ ...curr, layers: replaceGroupIdLayers(curr.layers) }));
        }
      } catch (err) {
        console.error('[useRoadmap] Failed to add group:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 4.2 Edit Group Title
  const editGroup = useCallback(
    async (groupId: string, title: string) => {
      try {
        // Optimistic update
        const updatedLayers = (prev: RoadmapLayer[]) =>
          prev.map((layer) => ({
            ...layer,
            groups: layer.groups.map((group) =>
              group.id === groupId ? { ...group, title: title.trim() } : group
            ),
          }));
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));
        await roadmapService.updateGroup(groupId, title.trim());
      } catch (err) {
        console.error('[useRoadmap] Failed to edit group:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 4.3 Delete Group
  const deleteGroup = useCallback(
    async (groupId: string) => {
      try {
        const updatedLayers = (prev: RoadmapLayer[]) =>
          prev.map((layer) => ({
            ...layer,
            groups: layer.groups.filter((g) => g.id !== groupId),
          }));
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

        await roadmapService.deleteGroup(groupId);
        await loadRoadmap(slug, true);
      } catch (err) {
        console.error('[useRoadmap] Failed to delete group:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
        throw err;
      }
    },
    [slug, loadRoadmap]
  );

  // 5. Add Item with Instant Optimistic UI
  const addItem = useCallback(
    async (layerId: string, level: RoadmapLevel, title: string, description: string) => {
      const tempId = `temp-item-${Date.now()}`;
      const optimisticItem: ChecklistItem = {
        id: tempId,
        slug: slugify(title),
        title: title.trim(),
        description: description.trim(),
        level,
        layerId,
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      };

      // 1. Optimistic insert into state immediately (0ms delay)
      const updatedLayers = (prev: RoadmapLayer[]) =>
        prev.map((layer) => {
          if (layer.id !== layerId) return layer;
          const groupExists = layer.groups.some((g) => g.level === level);
          if (groupExists) {
            return {
              ...layer,
              groups: layer.groups.map((g) =>
                g.level === level
                  ? { ...g, items: [...g.items, optimisticItem] }
                  : g
              ),
            };
          } else {
            const newGroup = {
              id: `temp-group-${Date.now()}`,
              level,
              title:
                level === 'core'
                  ? '🟢 Core'
                  : level === 'intermediate'
                    ? '🟡 Intermediate'
                    : '🔴 Advanced',
              items: [optimisticItem],
            };
            return {
              ...layer,
              groups: [...layer.groups, newGroup],
            };
          }
        });

      setLayers(updatedLayers);
      setActiveItemId(tempId);
      syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

      try {
        const { item: created } = await roadmapService.createItem({
          layerId,
          level,
          title: title.trim(),
          description: description.trim(),
        });
        if (created?.id) {
          const replaceIdLayers = (prev: RoadmapLayer[]) =>
            prev.map((layer) => ({
              ...layer,
              groups: layer.groups.map((g) => ({
                ...g,
                items: g.items.map((i) =>
                  i.id === tempId
                    ? { ...i, id: created.id, slug: created.slug || slugify(created.title) }
                    : i
                ),
              })),
            }));
          setLayers(replaceIdLayers);
          setActiveItemId(created.id);
          syncCache(slug, (curr) => ({ ...curr, layers: replaceIdLayers(curr.layers) }));
        }
      } catch (err) {
        console.error('[useRoadmap] Failed to add item:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 6. Edit Item (Title / Description / Level)
  const editItem = useCallback(
    async (id: string, title: string, description: string, level?: RoadmapLevel) => {
      try {
        // Optimistic UI update
        const updatedLayers = (prev: RoadmapLayer[]) =>
          prev.map((layer) => ({
            ...layer,
            groups: layer.groups.map((group) => ({
              ...group,
              items: group.items.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      title: title.trim(),
                      description: description.trim(),
                      ...(level ? { level } : {}),
                      updatedAt: dayjs().toISOString(),
                    }
                  : item
              ),
            })),
          }));
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

        await roadmapService.updateItemInfo({
          id,
          title: title.trim(),
          description: description.trim(),
          level,
        });

        // If level changed, reload hierarchy to re-place item in correct group
        if (level) {
          roadmapCache.delete(slug);
          await loadRoadmap(slug);
        }
      } catch (err) {
        console.error('[useRoadmap] Failed to update item info:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 7. Delete Item
  const deleteItem = useCallback(
    async (itemId: string) => {
      try {
        // Optimistic delete
        const updatedLayers = (prev: RoadmapLayer[]) =>
          prev.map((layer) => ({
            ...layer,
            groups: layer.groups.map((group) => ({
              ...group,
              items: group.items.filter((item) => item.id !== itemId),
            })),
          }));
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

        await roadmapService.deleteItem(itemId);
        roadmapCache.delete(slug);
      } catch (err) {
        console.error('[useRoadmap] Failed to delete item:', err);
        roadmapCache.delete(slug);
        await loadRoadmap(slug);
      }
    },
    [slug, loadRoadmap]
  );

  // 8. Update Rich-Text Content (Editor)
  const updateNote = useCallback(
    async (itemId: string, content: string) => {
      // Keep previous state in case rollback is needed
      const prevLayers = layers;

      // Optimistic update
      const updatedLayers = (prev: RoadmapLayer[]) =>
        prev.map((layer) => ({
          ...layer,
          groups: layer.groups.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.id === itemId
                ? { ...item, content, updatedAt: dayjs().toISOString() }
                : item
            ),
          })),
        }));
      setLayers(updatedLayers);
      syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

      try {
        await roadmapService.updateItemContent({
          id: itemId,
          content,
        });
      } catch (err) {
        console.error('[useRoadmap] Failed to update item content:', err);
        setLayers(prevLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: prevLayers }));
        throw err;
      }
    },
    [layers, slug]
  );

  // 9. Reorder items in group
  const updateGroupItems = useCallback(
    async (layerId: string, level: RoadmapLevel, newItems: ChecklistItem[]) => {
      try {
        // Optimistic update
        const updatedLayers = (prev: RoadmapLayer[]) =>
          prev.map((layer) => {
            if (layer.id !== layerId) return layer;
            return {
              ...layer,
              groups: layer.groups.map((g) => {
                if (g.level !== level) return g;
                return { ...g, items: newItems };
              }),
            };
          });
        setLayers(updatedLayers);
        syncCache(slug, (curr) => ({ ...curr, layers: updatedLayers(curr.layers) }));

        await roadmapService.reorderGroupItems({
          layerId,
          level,
          orderedItemIds: newItems.map((item) => item.id),
        });
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

  // Compute stats
  const stats: RoadmapStats = useMemo(() => {
    let total = 0;
    const byLevel = {
      core: 0,
      intermediate: 0,
      advanced: 0,
    };

    layers.forEach((layer) => {
      layer.groups.forEach((group) => {
        const count = group.items.length;
        total += count;
        if (group.level === 'core') byLevel.core += count;
        else if (group.level === 'intermediate') byLevel.intermediate += count;
        else if (group.level === 'advanced') byLevel.advanced += count;
      });
    });

    return { total, byLevel };
  }, [layers]);

  // Compute active item with layer & group metadata
  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    for (const layer of layers) {
      for (const group of layer.groups) {
        const found = group.items.find((item) => item.id === activeItemId);
        if (found) {
          return {
            ...found,
            layerTitle: layer.title,
            groupTitle: group.title,
          };
        }
      }
    }
    return null;
  }, [layers, activeItemId]);

  // Filtered layers
  const filteredLayers = useMemo(() => {
    if (selectedLayerId === 'all') return layers;
    return layers.filter((layer) => layer.id === selectedLayerId);
  }, [layers, selectedLayerId]);

  return {
    roadmapMeta,
    layers,
    filteredLayers,
    activeItemId,
    activeItem,
    selectedLayerId,
    stats,
    isLoading,
    isError,
    setSelectedLayerId,
    addLayer,
    editLayer,
    deleteLayer,
    editRoadmap,
    toggleRoadmapLock,
    addGroup,
    editGroup,
    deleteGroup,
    addItem,
    editItem,
    deleteItem,
    updateNote,
    selectActiveItem,
    updateGroupItems,
    refetch: () => loadRoadmap(slug),
  };
}
