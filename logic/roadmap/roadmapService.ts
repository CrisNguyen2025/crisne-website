/**
 * Roadmap API Service
 *
 * Handles all HTTP calls for multi-roadmap architecture.
 * UI components and hooks must NOT call fetch() directly — use this module.
 */

import {
  ChecklistItem,
  CreateItemDto,
  CreateLayerDto,
  CreateRoadmapDto,
  GetRoadmapResponseDto,
  ReorderGroupItemsDto,
  RoadmapMeta,
  UpdateItemContentDto,
  UpdateItemInfoDto,
  UpdateLayerDto,
  UpdateRoadmapDto,
} from '@/lib/roadmap/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errorJson = await res.json();
      errorDetail = errorJson.error || JSON.stringify(errorJson);
    } catch {
      const text = await res.text().catch(() => '');
      if (text) errorDetail = text;
    }
    throw new Error(errorDetail || `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmaps List & Overview
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all roadmaps list */
export async function fetchAllRoadmaps(): Promise<{ roadmaps: (RoadmapMeta & { _count: { layers: number } })[] }> {
  return apiFetch<{ roadmaps: (RoadmapMeta & { _count: { layers: number } })[] }>('/api/v1/roadmaps');
}

/** Fetch full roadmap with nested layers, groups, and items by slug */
export async function fetchRoadmapBySlug(slug: string): Promise<GetRoadmapResponseDto> {
  return apiFetch<GetRoadmapResponseDto>(`/api/v1/roadmaps/${slug}`);
}

/** Create a new Topic / Roadmap with initial layers */
export async function createRoadmap(payload: CreateRoadmapDto): Promise<{ roadmap: any }> {
  return apiFetch<{ roadmap: any }>('/api/v1/roadmaps', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Delete an entire Topic / Roadmap by slug */
export async function deleteRoadmapBySlug(slug: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/${slug}`, {
    method: 'DELETE',
  });
}

/** Update an existing Topic / Roadmap by slug */
export async function updateRoadmapBySlug(
  slug: string,
  payload: UpdateRoadmapDto
): Promise<{ roadmap: RoadmapMeta }> {
  return apiFetch<{ roadmap: RoadmapMeta }>(`/api/v1/roadmaps/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Layers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new layer in a roadmap */
export async function createLayer(slug: string, payload: CreateLayerDto): Promise<{ layer: any }> {
  return apiFetch<{ layer: any }>(`/api/v1/roadmaps/${slug}/layers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update an existing layer's metadata */
export async function updateLayer(payload: UpdateLayerDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/layers/${payload.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Delete a layer by ID */
export async function deleteLayer(layerId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/layers/${layerId}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Items
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new item inside a layer group */
export async function createItem(payload: CreateItemDto): Promise<{ item: ChecklistItem }> {
  return apiFetch<{ item: ChecklistItem }>('/api/v1/roadmaps/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update item title and description */
export async function updateItemInfo(payload: UpdateItemInfoDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${payload.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Update item rich HTML content */
export async function updateItemContent(payload: UpdateItemContentDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${payload.id}/content`, {
    method: 'PATCH',
    body: JSON.stringify({ content: payload.content }),
  });
}

/** Delete an item by ID */
export async function deleteItem(itemId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${itemId}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Ordering
// ─────────────────────────────────────────────────────────────────────────────

/** Persist reordered item IDs in group */
export async function reorderGroupItems(payload: ReorderGroupItemsDto): Promise<void> {
  return apiFetch<void>('/api/v1/roadmaps/items/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedItemIds: payload.orderedItemIds }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

/** Create a custom group in a layer */
export async function createGroup(layerId: string, title: string, level?: string): Promise<{ group: any }> {
  return apiFetch<{ group: any }>('/api/v1/roadmaps/groups', {
    method: 'POST',
    body: JSON.stringify({ layerId, title, level }),
  });
}

/** Update an existing group's title */
export async function updateGroup(groupId: string, title: string): Promise<{ group: any }> {
  return apiFetch<{ group: any }>(`/api/v1/roadmaps/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

/** Delete a group by ID */
export async function deleteGroup(groupId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/groups/${groupId}`, {
    method: 'DELETE',
  });
}

