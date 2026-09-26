export type RoadmapLevel = 'core' | 'intermediate' | 'advanced' | string;

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  level: RoadmapLevel;
  layerId: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  content?: string;
  tags?: string[];
}

export interface LevelGroup {
  id?: string;
  level: RoadmapLevel;
  title: string;
  items: ChecklistItem[];
}

export interface RoadmapLayer {
  id: string;
  order: number;
  shortTag: string; // e.g. '01-DB', '02-LLM', '03-RAG', '04-OPS'
  title: string;
  subtitle: string;
  groups: LevelGroup[];
}

export interface RoadmapStats {
  total: number;
  byLevel: {
    core: number;
    intermediate: number;
    advanced: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs — Data Transfer Objects for API integration
// ─────────────────────────────────────────────────────────────────────────────

/** Response shape when listing all roadmap layers from the API */
export interface GetRoadmapResponseDto {
  layers: RoadmapLayer[];
}

/** Payload to create a new roadmap item */
export interface CreateItemDto {
  layerId: string;
  level: RoadmapLevel;
  title: string;
  description?: string;
}

/** Payload to update item title, description, and level */
export interface UpdateItemInfoDto {
  id: string;
  title: string;
  description: string;
  level?: RoadmapLevel;
}

/** Payload to update item detailed HTML content only */
export interface UpdateItemContentDto {
  id: string;
  content: string;
}

/** Payload to reorder items within a group */
export interface ReorderGroupItemsDto {
  layerId: string;
  level: RoadmapLevel;
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
