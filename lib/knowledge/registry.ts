import { KnowledgeEntity, EntityType, DifficultyLevel } from '@/types/knowledge';
import { INITIAL_KNOWLEDGE_BASE } from './data';

export interface SearchFilters {
  query?: string;
  type?: EntityType;
  category?: string;
  tag?: string;
  difficulty?: DifficultyLevel;
  technology?: string;
  limit?: number;
  offset?: number;
}

export class KnowledgeRegistry {
  private static entities: KnowledgeEntity[] = INITIAL_KNOWLEDGE_BASE;

  public static getAllEntities(filters?: SearchFilters): { items: KnowledgeEntity[]; total: number } {
    let result = [...this.entities];

    if (filters?.type) {
      result = result.filter(e => e.type === filters.type);
    }

    if (filters?.category) {
      const catLower = filters.category.toLowerCase();
      result = result.filter(e => e.category.toLowerCase().includes(catLower));
    }

    if (filters?.tag) {
      const tagLower = filters.tag.toLowerCase();
      result = result.filter(e => e.tags.some(t => t.toLowerCase() === tagLower));
    }

    if (filters?.difficulty) {
      result = result.filter(e => e.difficulty === filters.difficulty);
    }

    if (filters?.technology) {
      const techLower = filters.technology.toLowerCase();
      result = result.filter(
        e =>
          e.tags.some(t => t.toLowerCase().includes(techLower)) ||
          e.title.toLowerCase().includes(techLower) ||
          e.description.toLowerCase().includes(techLower)
      );
    }

    if (filters?.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(
        e =>
          e.title.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q)) ||
          e.category.toLowerCase().includes(q)
      );
    }

    const total = result.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;
    const paginated = result.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  public static getEntityByIdOrSlug(identifier: string): KnowledgeEntity | null {
    const found = this.entities.find(
      e => e.id === identifier || e.slug.toLowerCase() === identifier.toLowerCase()
    );
    return found || null;
  }

  public static getEntitiesByType(type: EntityType): KnowledgeEntity[] {
    return this.entities.filter(e => e.type === type);
  }

  public static recommendLearningPath(topicOrSkillSlug: string) {
    const root = this.getEntityByIdOrSlug(topicOrSkillSlug);
    if (!root) {
      return { root: null, path: [], relatedSkills: [], relatedProjects: [] };
    }

    const relatedSkillEntities = (root.relatedSkills || [])
      .map(id => this.getEntityByIdOrSlug(id))
      .filter((e): e is KnowledgeEntity => e !== null);

    const relatedProjectEntities = (root.relatedProjects || [])
      .map(id => this.getEntityByIdOrSlug(id))
      .filter((e): e is KnowledgeEntity => e !== null);

    const relatedMcpEntities = (root.relatedMcps || [])
      .map(id => this.getEntityByIdOrSlug(id))
      .filter((e): e is KnowledgeEntity => e !== null);

    return {
      root,
      steps: [
        { stage: '1. Fundamentals', entity: root },
        ...relatedSkillEntities.map((s, idx) => ({ stage: `${idx + 2}. Core Skill`, entity: s })),
        ...relatedProjectEntities.map((p, idx) => ({
          stage: `${idx + relatedSkillEntities.length + 2}. Real-World Project`,
          entity: p
        }))
      ],
      relatedMcps: relatedMcpEntities
    };
  }

  public static recommendMcps(tagOrQuery: string): KnowledgeEntity[] {
    const q = tagOrQuery.toLowerCase();
    return this.entities.filter(
      e =>
        e.type === 'mcp' &&
        (e.tags.some(t => t.toLowerCase().includes(q)) ||
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q))
    );
  }
}
