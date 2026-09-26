'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dayjs from 'dayjs';
import { ChecklistItem, RoadmapLayer, RoadmapLevel, RoadmapStats, LevelGroup } from '@/lib/roadmap/types';
import { INITIAL_ROADMAP_DATA } from '@/lib/roadmap/data';

const STORAGE_KEYS = {
  NOTES: 'roadmap_item_notes_v1',
  CUSTOM_DATA: 'roadmap_layers_data_v1',
  ACTIVE_ITEM: 'roadmap_active_item_id_v1',
  SPLIT_RATIO: 'roadmap_split_ratio_v1',
};

export function useRoadmap() {
  const [layers, setLayers] = useState<RoadmapLayer[]>(INITIAL_ROADMAP_DATA);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeItemId, setActiveItemId] = useState<string>('kb-core-01');
  const [selectedLayerId, setSelectedLayerId] = useState<string | 'all'>('all');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage on client mount
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem(STORAGE_KEYS.NOTES);
      if (savedNotes) {
        setNotes(JSON.parse(savedNotes));
      }

      const savedActiveItem = localStorage.getItem(STORAGE_KEYS.ACTIVE_ITEM);
      if (savedActiveItem) {
        setActiveItemId(savedActiveItem);
      }

      const savedLayers = localStorage.getItem(STORAGE_KEYS.CUSTOM_DATA);
      if (savedLayers) {
        setLayers(JSON.parse(savedLayers));
      }
    } catch {
      // Fallback silently if storage unavailable
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Persist layers helper
  const persistLayers = (newLayers: RoadmapLayer[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_DATA, JSON.stringify(newLayers));
    } catch {}
  };

  // Add a new Layer dynamically
  const addLayer = useCallback((title: string, shortTag: string, subtitle?: string) => {
    const newLayerId = `layer-${Date.now()}`;
    const newLayer: RoadmapLayer = {
      id: newLayerId,
      order: layers.length + 1,
      title: title.trim(),
      shortTag: shortTag.trim().toUpperCase(),
      subtitle: subtitle?.trim() || '',
      groups: [
        { level: 'core', title: '🟢 Core', items: [] },
        { level: 'intermediate', title: '🟡 Intermediate', items: [] },
        { level: 'advanced', title: '🔴 Advanced', items: [] },
      ],
    };

    setLayers((prev) => {
      const updated = [...prev, newLayer];
      persistLayers(updated);
      return updated;
    });

    setSelectedLayerId(newLayerId);
    return newLayer;
  }, [layers.length]);

  // Edit an existing Layer
  const editLayer = useCallback((layerId: string, title: string, shortTag: string, subtitle?: string) => {
    setLayers((prev) => {
      const updated = prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        return {
          ...layer,
          title: title.trim(),
          shortTag: shortTag.trim().toUpperCase(),
          subtitle: subtitle !== undefined ? subtitle.trim() : layer.subtitle,
        };
      });
      persistLayers(updated);
      return updated;
    });
  }, []);

  // Delete a Layer
  const deleteLayer = useCallback((layerId: string) => {
    setLayers((prev) => {
      const updated = prev.filter((layer) => layer.id !== layerId);
      persistLayers(updated);
      return updated;
    });

    setSelectedLayerId((curr) => (curr === layerId ? 'all' : curr));
  }, []);

  const addGroup = useCallback((layerId: string, title: string) => {
    const newGroupId = `group-${Date.now()}`;
    const newGroup: LevelGroup = {
      id: newGroupId,
      level: newGroupId,
      title: title.trim(),
      items: [],
    };

    setLayers((prev) => {
      const updated = prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        return {
          ...layer,
          groups: [...layer.groups, newGroup],
        };
      });
      persistLayers(updated);
      return updated;
    });

    return newGroup;
  }, []);

  const deleteGroup = useCallback((layerId: string, groupLevel: string) => {
    setLayers((prev) => {
      const updated = prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        return {
          ...layer,
          groups: layer.groups.filter((g) => g.level !== groupLevel),
        };
      });
      persistLayers(updated);
      return updated;
    });
  }, []);

  // Add a new Item dynamically
  const addItem = useCallback((layerId: string, level: RoadmapLevel, title: string, description: string) => {
    const now = dayjs().toISOString();
    const newItemId = `item-${Date.now()}`;
    const newItem: ChecklistItem = {
      id: newItemId,
      layerId,
      level,
      title: title.trim(),
      description: description.trim(),
      content: '',
      createdAt: now,
      updatedAt: now,
      notes: '',
    };

    setLayers((prev) => {
      const updated = prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        return {
          ...layer,
          groups: layer.groups.map((group) => {
            if (group.level !== level) return group;
            return {
              ...group,
              items: [newItem, ...group.items],
            };
          }),
        };
      });
      persistLayers(updated);
      return updated;
    });

    setActiveItemId(newItemId);
    return newItem;
  }, []);

  const editItem = useCallback((
    itemId: string,
    title: string,
    description: string,
    newLevel?: RoadmapLevel,
    content?: string,
  ) => {
    const now = dayjs().toISOString();
    setLayers((prev) => {
      let targetItem: ChecklistItem | null = null;
      let currentLayerId = '';
      let currentLevel: RoadmapLevel = 'core';

      for (const layer of prev) {
        for (const group of layer.groups) {
          const found = group.items.find((i) => i.id === itemId);
          if (found) {
            targetItem = found;
            currentLayerId = layer.id;
            currentLevel = group.level;
            break;
          }
        }
        if (targetItem) break;
      }

      if (!targetItem) return prev;

      if (!newLevel || newLevel === currentLevel) {
        const updated = prev.map((layer) => ({
          ...layer,
          groups: layer.groups.map((group) => ({
            ...group,
            items: group.items.map((item) => {
              if (item.id !== itemId) return item;
              return {
                ...item,
                title: title.trim(),
                description: description.trim(),
                ...(content !== undefined ? { content } : {}),
                updatedAt: now,
              };
            }),
          })),
        }));
        persistLayers(updated);
        return updated;
      }

      const updatedItem: ChecklistItem = {
        ...targetItem,
        title: title.trim(),
        description: description.trim(),
        ...(content !== undefined ? { content } : {}),
        level: newLevel,
        updatedAt: now,
      };

      const updated = prev.map((layer) => {
        if (layer.id !== currentLayerId) return layer;
        return {
          ...layer,
          groups: layer.groups.map((group) => {
            if (group.level === currentLevel) {
              return {
                ...group,
                items: group.items.filter((i) => i.id !== itemId),
              };
            }
            if (group.level === newLevel) {
              return {
                ...group,
                items: [updatedItem, ...group.items],
              };
            }
            return group;
          }),
        };
      });

      persistLayers(updated);
      return updated;
    });
  }, []);

  // Delete an Item
  const deleteItem = useCallback((itemId: string) => {
    setLayers((prev) => {
      const updated = prev.map((layer) => ({
        ...layer,
        groups: layer.groups.map((group) => ({
          ...group,
          items: group.items.filter((item) => item.id !== itemId),
        })),
      }));
      persistLayers(updated);
      return updated;
    });

    setActiveItemId((curr) => (curr === itemId ? '' : curr));
  }, []);

  // Update notes
  const updateNote = useCallback((id: string, text: string) => {
    const now = dayjs().toISOString();
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      try {
        localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Also update updatedAt timestamp for the item
    setLayers((prevLayers) => {
      const updated = prevLayers.map((layer) => ({
        ...layer,
        groups: layer.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            if (item.id !== id) return item;
            return {
              ...item,
              updatedAt: now,
            };
          }),
        })),
      }));
      persistLayers(updated);
      return updated;
    });
  }, []);

  const selectActiveItem = useCallback((id: string) => {
    setActiveItemId(id);
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ITEM, id);
    } catch {}
  }, []);

  // Reorder items in a specific group (strictly within its parent layer and group)
  const updateGroupItems = useCallback((layerId: string, level: RoadmapLevel, newItems: ChecklistItem[]) => {
    setLayers((prevLayers) => {
      const updated = prevLayers.map((layer) => {
        if (layer.id !== layerId) return layer;
        return {
          ...layer,
          groups: layer.groups.map((group) => {
            if (group.level !== level) return group;
            return { ...group, items: newItems };
          }),
        };
      });
      persistLayers(updated);
      return updated;
    });
  }, []);

  // Reset to initial seed data
  const resetToInitialData = useCallback(() => {
    if (typeof window !== 'undefined' && window.confirm('Reset all roadmap data to default? All custom changes will be lost.')) {
      setLayers(INITIAL_ROADMAP_DATA);
      setSelectedLayerId('all');
      setActiveItemId('kb-core-01');
      try {
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_DATA);
        localStorage.removeItem(STORAGE_KEYS.NOTES);
      } catch {}
    }
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
        const lvl = group.level;
        group.items.forEach(() => {
          total += 1;
          if (lvl === 'core' || lvl === 'intermediate' || lvl === 'advanced') {
            byLevel[lvl] += 1;
          }
        });
      });
    });

    return {
      total,
      byLevel,
    };
  }, [layers]);

  // Find active item
  const activeItem = useMemo(() => {
    for (const layer of layers) {
      for (const group of layer.groups) {
        const found = group.items.find((item) => item.id === activeItemId);
        if (found) {
          return {
            ...found,
            layerTitle: layer.title,
            groupTitle: group.title,
            notes: notes[found.id] || '',
            content: found.content !== undefined ? found.content : (notes[found.id] || ''),
          };
        }
      }
    }
    return null;
  }, [layers, activeItemId, notes]);

  // Filtered layers based on selected parent layer (shortTag)
  const filteredLayers = useMemo(() => {
    if (selectedLayerId === 'all') return layers;
    return layers.filter((layer) => layer.id === selectedLayerId);
  }, [layers, selectedLayerId]);

  return {
    layers,
    filteredLayers,
    notes,
    activeItemId,
    activeItem,
    selectedLayerId,
    stats,
    isLoaded,
    setSelectedLayerId,
    addLayer,
    editLayer,
    deleteLayer,
    addGroup,
    deleteGroup,
    addItem,
    editItem,
    deleteItem,
    updateNote,
    selectActiveItem,
    updateGroupItems,
    resetToInitialData,
  };
}
