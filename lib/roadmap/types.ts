// A topic holds its lessons directly; a lesson may name a section (mục) of the topic (ADR-0009).
import type { LessonStatus } from './status';

/** A lesson as the UI and the API see it. `section` is null for lessons outside any section. */
export interface ChecklistItem {
  id: string;
  slug?: string;
  title: string;
  description: string;
  section: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  content?: string;
  notes?: string;
  tags?: string[];
  /** Lesson Status (ADR-0010); present only for the Owner */
  status?: LessonStatus;
  statusUpdatedAt?: string | null;
}

export interface RoadmapStats {
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs — Data Transfer Objects for API integration
// ─────────────────────────────────────────────────────────────────────────────

export interface RoadmapMeta {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  order: number;
  isLocked?: boolean;
}

/** A topic with its lessons, in page order. `sections` lists the sections in the order they first appear. */
export interface GetRoadmapResponseDto {
  roadmap: RoadmapMeta;
  items: ChecklistItem[];
  /** Section names in page order; null is the group of lessons outside any section. */
  sections: (string | null)[];
}

/** Payload to create a lesson. The topic is named by slug; the section is optional and reused if it exists. */
export interface CreateItemDto {
  roadmapSlug: string;
  section?: string | null;
  title: string;
  description?: string;
  /** Optional rich-text (HTML) body, saved in the same request */
  content?: string;
}

/** Payload to update a lesson's title and description. `section` moves it; "" or null takes it out of its section. */
export interface UpdateItemInfoDto {
  id: string;
  title: string;
  description: string;
  section?: string | null;
}

/** Payload to update item detailed HTML content only */
export interface UpdateItemContentDto {
  id: string;
  content: string;
}

/** Payload to reorder the lessons of a topic */
export interface ReorderItemsDto {
  orderedItemIds: string[];
}

/** Payload to rename a section; every lesson in it moves to the new name */
export interface RenameSectionDto {
  from: string;
  to: string;
}

/** Payload to create a new Topic / Roadmap */
export interface CreateRoadmapDto {
  title: string;
  description?: string;
}

/** Payload to update an existing Topic / Roadmap */
export interface UpdateRoadmapDto {
  title?: string;
  description?: string;
  isLocked?: boolean;
}
