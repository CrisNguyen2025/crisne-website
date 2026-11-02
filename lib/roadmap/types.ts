export interface ChecklistItem {
  id: string;
  slug?: string;
  title: string;
  description: string;
  layerId: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  content?: string;
  tags?: string[];
}

/** A named group of lessons inside a layer; the title is unique within the layer (ADR-0008). */
export interface RoadmapGroup {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface RoadmapLayer {
  id: string;
  order: number;
  shortTag: string; // e.g. '01-DB', '02-LLM', '03-RAG', '04-OPS'
  title: string;
  subtitle: string;
  groups: RoadmapGroup[];
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
  shortCode?: string | null;
  description?: string | null;
  icon?: string | null;
  order: number;
  isLocked?: boolean;
  _count?: {
    layers: number;
  };
}

/** Response shape when listing all roadmap layers from the API */
export interface GetRoadmapResponseDto {
  roadmap: RoadmapMeta;
  layers: RoadmapLayer[];
}

/**
 * Payload to create a new roadmap item. The group is named by id, or by title (created when missing);
 * with neither, a layer holding exactly one group uses it, otherwise the API asks for one.
 */
export interface CreateItemDto {
  layerId: string;
  groupId?: string;
  groupTitle?: string;
  title: string;
  description?: string;
  /** Optional rich-text (HTML) body, saved in the same request */
  content?: string;
}

/** Payload to update item title and description; groupId moves the item to another group of its layer */
export interface UpdateItemInfoDto {
  id: string;
  title: string;
  description: string;
  groupId?: string;
}

/** Payload to update item detailed HTML content only */
export interface UpdateItemContentDto {
  id: string;
  content: string;
}

/** Payload to reorder items within a group */
export interface ReorderGroupItemsDto {
  groupId: string;
  orderedItemIds: string[];
}

/** Payload to create a new layer */
export interface CreateLayerDto {
  title: string;
  shortTag: string;
  subtitle?: string;
}

/** Payload to update an existing layer */
export interface UpdateLayerDto {
  id: string;
  title: string;
  shortTag: string;
  subtitle?: string;
}

/** Payload to create a new Topic / Roadmap */
export interface CreateRoadmapDto {
  title: string;
  shortCode: string;
  description?: string;
  layers: {
    title: string;
    shortTag: string;
    subtitle?: string;
  }[];
}

/** Payload to update an existing Topic / Roadmap */
export interface UpdateRoadmapDto {
  title?: string;
  shortCode?: string;
  description?: string;
  isLocked?: boolean;
}

