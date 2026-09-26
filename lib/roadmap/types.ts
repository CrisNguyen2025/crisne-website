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
  shortTag: string; // Ví dụ: '01-DB', '02-LLM', '03-RAG', '04-OPS', '05-PROD'
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
