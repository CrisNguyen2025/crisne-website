/**
 * Roadmap API Service
 *
 * Handles all HTTP calls for the roadmap: topics, their lessons, and sections (ADR-0009).
 * UI components and hooks must NOT call fetch() directly — use this module.
 */
import {
  ChecklistItem,
  CreateItemDto,
  CreateRoadmapDto,
  GetRoadmapResponseDto,
  ReorderItemsDto,
  RenameSectionDto,
  RoadmapMeta,
  UpdateItemContentDto,
  UpdateItemInfoDto,
  UpdateRoadmapDto,
} from '@/lib/roadmap/types';
import type { LessonStatus } from '@/lib/roadmap/status';
import { apiFetch } from '@/logic/api-fetch';

// ─────────────────────────────────────────────────────────────────────────────
// Topics
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all topics, with their lesson counts */
export async function fetchAllRoadmaps(): Promise<{ roadmaps: (RoadmapMeta & { _count: { items: number } })[] }> {
  return apiFetch<{ roadmaps: (RoadmapMeta & { _count: { items: number } })[] }>('/api/v1/roadmaps');
}

/** Export every topic with its lessons (the Roadmap Assistant's ingestion format) */
export async function exportAllRoadmaps(): Promise<unknown> {
  return apiFetch<unknown>('/api/v1/roadmaps/full-export');
}

/** Fetch a topic with its lessons and sections, by slug */
export async function fetchRoadmapBySlug(slug: string): Promise<GetRoadmapResponseDto> {
  return apiFetch<GetRoadmapResponseDto>(`/api/v1/roadmaps/${slug}`);
}

/** Create a topic. Lessons are added afterwards. */
export async function createRoadmap(payload: CreateRoadmapDto): Promise<{ roadmap: RoadmapMeta }> {
  return apiFetch<{ roadmap: RoadmapMeta }>('/api/v1/roadmaps', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Delete a topic and every lesson in it */
export async function deleteRoadmapBySlug(slug: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/${slug}`, { method: 'DELETE' });
}

/** Update a topic's title, description or lock */
export async function updateRoadmapBySlug(slug: string, payload: UpdateRoadmapDto): Promise<{ roadmap: RoadmapMeta }> {
  return apiFetch<{ roadmap: RoadmapMeta }>(`/api/v1/roadmaps/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Rename a section; every lesson in it moves to the new name */
export async function renameSection(slug: string, payload: RenameSectionDto): Promise<{ renamed: number; section: string | null }> {
  return apiFetch<{ renamed: number; section: string | null }>(`/api/v1/roadmaps/${slug}/sections`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Dissolve a section; every lesson in it moves to the topic's general group */
export async function dissolveSection(slug: string, section: string): Promise<{ dissolved: number }> {
  return apiFetch<{ dissolved: number }>(`/api/v1/roadmaps/${slug}/sections?section=${encodeURIComponent(section)}`, {
    method: 'DELETE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────────────

/** Add a lesson to a topic, optionally into a section */
export async function createItem(payload: CreateItemDto): Promise<{ item: ChecklistItem }> {
  return apiFetch<{ item: ChecklistItem }>('/api/v1/roadmaps/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update a lesson's title, description and section */
export async function updateItemInfo(payload: UpdateItemInfoDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${payload.id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Set a lesson's Lesson Status (ADR-0010); the Owner only */
export async function updateItemStatus(id: string, status: LessonStatus): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Update a lesson's rich HTML content */
export async function updateItemContent(payload: UpdateItemContentDto): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${payload.id}/content`, {
    method: 'PATCH',
    body: JSON.stringify({ content: payload.content }),
  });
}

/** Delete a lesson by ID */
export async function deleteItem(itemId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/roadmaps/items/${itemId}`, { method: 'DELETE' });
}

/** Persist the page order of a topic's lessons */
export async function reorderItems(payload: ReorderItemsDto): Promise<void> {
  return apiFetch<void>('/api/v1/roadmaps/items/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedItemIds: payload.orderedItemIds }),
  });
}
