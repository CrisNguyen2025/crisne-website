/**
 * Roadmap API Service
 *
 * Handles all HTTP calls for roadmap data.
 * UI components and hooks must NOT call fetch() directly — use this module.
 *
 * Replace the stub implementations below with real API endpoints
 * once the backend routes are available. The shape of request/response
 * is defined by the DTOs in lib/roadmap/types.ts.
 */

import {
  ChecklistItem,
  CreateItemDto,
  CreateLayerDto,
  GetRoadmapResponseDto,
  ReorderGroupItemsDto,
  RoadmapLevel,
  UpdateItemContentDto,
  UpdateItemInfoDto,
  UpdateLayerDto,
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
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`[RoadmapService] ${options?.method ?? 'GET'} ${path} failed: ${message}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Layers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all roadmap layers with nested groups and items */
export async function fetchRoadmap(): Promise<GetRoadmapResponseDto> {
  return apiFetch<GetRoadmapResponseDto>('/api/v1/roadmap');
}

/** Create a new layer */
export async function createLayer(payload: CreateLayerDto): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/api/v1/roadmap/layers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update an existing layer's metadata */
export async function updateLayer(payload: UpdateLayerDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/layers/${payload.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Delete a layer by ID */
export async function deleteLayer(layerId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/layers/${layerId}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Items
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single item by ID (e.g. for content lazy-loading) */
export async function fetchItem(itemId: string): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>(`/api/v1/roadmap/items/${itemId}`);
}

/** Create a new item inside a layer group */
export async function createItem(payload: CreateItemDto): Promise<ChecklistItem> {
  return apiFetch<ChecklistItem>('/api/v1/roadmap/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update item title, description, and/or level */
export async function updateItemInfo(payload: UpdateItemInfoDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/items/${payload.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Update item rich HTML content only */
export async function updateItemContent(payload: UpdateItemContentDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/items/${payload.id}/content`, {
    method: 'PATCH',
    body: JSON.stringify({ content: payload.content }),
  });
}

/** Delete an item by ID */
export async function deleteItem(itemId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/items/${itemId}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roadmap — Ordering
// ─────────────────────────────────────────────────────────────────────────────

/** Persist the new display order of items within a group */
export async function reorderGroupItems(payload: ReorderGroupItemsDto): Promise<void> {
  return apiFetch<void>('/api/v1/roadmap/items/reorder', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

/** Create a custom group inside a layer */
export async function createGroup(layerId: string, title: string, level?: RoadmapLevel): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/api/v1/roadmap/groups', {
    method: 'POST',
    body: JSON.stringify({ layerId, title, level }),
  });
}

/** Delete a group by layer + group level */
export async function deleteGroup(layerId: string, groupLevel: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmap/groups`, {
    method: 'DELETE',
    body: JSON.stringify({ layerId, groupLevel }),
  });
}
