import { KnowledgeGraphData, KnowledgeNode, KnowledgeEdge } from '@/types/knowledge';
import { KnowledgeRegistry } from './registry';

export class KnowledgeGraphEngine {
  public static buildGraph(): KnowledgeGraphData {
    const { items: entities } = KnowledgeRegistry.getAllEntities({ limit: 1000 });

    const nodes: KnowledgeNode[] = entities.map(e => ({
      id: e.id,
      slug: e.slug,
      type: e.type,
      title: e.title,
      category: e.category
    }));

    const edges: KnowledgeEdge[] = [];
    const edgeSet = new Set<string>();

    const addEdge = (source: string, targetIdOrSlug: string, relationship: string) => {
      const targetEntity = KnowledgeRegistry.getEntityByIdOrSlug(targetIdOrSlug);
      if (!targetEntity) return;

      const key = `${source}->${targetEntity.id}:${relationship}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({
          source,
          target: targetEntity.id,
          relationship
        });
      }
    };

    for (const e of entities) {
      e.relatedTopics?.forEach(id => addEdge(e.id, id, 'related_topic'));
      e.relatedSkills?.forEach(id => addEdge(e.id, id, 'requires_skill'));
      e.relatedMcps?.forEach(id => addEdge(e.id, id, 'uses_mcp'));
      e.relatedAgents?.forEach(id => addEdge(e.id, id, 'uses_agent'));
      e.relatedProjects?.forEach(id => addEdge(e.id, id, 'implemented_in'));
      e.relatedArchitectures?.forEach(id => addEdge(e.id, id, 'follows_architecture'));
    }

    return { nodes, edges };
  }
}
