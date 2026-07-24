export type EntityType =
  | 'topic'
  | 'note'
  | 'project'
  | 'skill'
  | 'mcp'
  | 'agent'
  | 'prompt'
  | 'best-practice'
  | 'architecture'
  | 'reference'
  | 'roadmap';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface KnowledgeReference {
  title: string;
  url: string;
  type?: 'official-doc' | 'github' | 'paper' | 'article';
}

export interface KnowledgeEntity {
  id: string;
  slug: string;
  type: EntityType;
  title: string;
  description: string;
  summary: string;
  category: string;
  tags: string[];
  difficulty: DifficultyLevel;
  createdAt: string;
  updatedAt: string;
  readingTimeMin: number;
  githubLinks?: string[];
  officialDocs?: string[];
  references?: KnowledgeReference[];
  
  // Knowledge Graph Relationships
  relatedTopics?: string[];     // IDs or Slugs
  relatedSkills?: string[];     // IDs or Slugs
  relatedMcps?: string[];       // IDs or Slugs
  relatedAgents?: string[];     // IDs or Slugs
  relatedProjects?: string[];   // IDs or Slugs
  relatedArchitectures?: string[];
}

export interface KnowledgeNode {
  id: string;
  slug: string;
  type: EntityType;
  title: string;
  category: string;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface ApiResponseMeta {
  total: number;
  page: number;
  limit: number;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
