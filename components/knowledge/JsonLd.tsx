import type { ReactNode } from 'react';
import type { KnowledgeEntity } from '@/types/knowledge';

const DEFAULT_SITE_URL = 'https://crisne.blog';

export interface KnowledgeJsonLdProps {
  /** Single entity to render JSON-LD for */
  entity?: KnowledgeEntity;
  /** Multiple entities (for index/list pages) */
  entities?: KnowledgeEntity[];
  /** Custom base URL */
  baseUrl?: string;
  /** Force specific schema type or render comprehensive @graph */
  schemaType?: 'TechArticle' | 'DefinedTerm' | 'SoftwareApplication' | 'KnowledgeGraph' | 'auto';
  /** Include full Knowledge Graph connections in @graph */
  includeGraph?: boolean;
}

/**
 * Maps entity type to site URL path segment
 */
export function getEntityPathSegment(type: string): string {
  switch (type) {
    case 'topic':
      return 'topics';
    case 'skill':
      return 'skills';
    case 'mcp':
      return 'mcps';
    case 'agent':
      return 'agents';
    case 'project':
      return 'projects';
    case 'architecture':
      return 'architectures';
    case 'note':
      return 'notes';
    case 'prompt':
      return 'prompts';
    case 'best-practice':
      return 'best-practices';
    case 'reference':
      return 'references';
    case 'roadmap':
      return 'roadmaps';
    default:
      return 'knowledge';
  }
}

/**
 * Builds Schema.org TechArticle object
 */
export function generateTechArticleSchema(entity: KnowledgeEntity, baseUrl: string = DEFAULT_SITE_URL) {
  const entityUrl = `${baseUrl}/${getEntityPathSegment(entity.type)}/${entity.slug}`;
  const keywords = entity.tags ? entity.tags.join(', ') : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${entityUrl}#techarticle`,
    url: entityUrl,
    headline: entity.title,
    name: entity.title,
    description: entity.description || entity.summary,
    articleSection: entity.category,
    keywords,
    proficiencyLevel: entity.difficulty,
    datePublished: entity.createdAt,
    dateModified: entity.updatedAt || entity.createdAt,
    timeRequired: entity.readingTimeMin ? `PT${entity.readingTimeMin}M` : undefined,
    author: {
      '@type': 'Person',
      name: 'Cris Nguyen',
      url: baseUrl,
    },
    publisher: {
      '@type': 'Person',
      name: 'Cris Nguyen',
      url: baseUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': entityUrl,
    },
    ...(entity.githubLinks && entity.githubLinks.length > 0 ? { codeRepository: entity.githubLinks[0] } : {}),
    ...(entity.references && entity.references.length > 0
      ? { citation: entity.references.map(ref => ref.url) }
      : {}),
  };
}

/**
 * Builds Schema.org DefinedTerm object
 */
export function generateDefinedTermSchema(entity: KnowledgeEntity, baseUrl: string = DEFAULT_SITE_URL) {
  const entityUrl = `${baseUrl}/${getEntityPathSegment(entity.type)}/${entity.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': `${entityUrl}#definedterm`,
    url: entityUrl,
    name: entity.title,
    description: entity.description || entity.summary,
    termCode: entity.slug,
    inDefinedTermSet: `${baseUrl}/knowledge`,
    sameAs: entity.officialDocs && entity.officialDocs.length > 0 ? entity.officialDocs[0] : undefined,
  };
}

/**
 * Builds Schema.org SoftwareApplication object
 */
export function generateSoftwareApplicationSchema(
  entity: KnowledgeEntity,
  baseUrl: string = DEFAULT_SITE_URL
) {
  const entityUrl = `${baseUrl}/${getEntityPathSegment(entity.type)}/${entity.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${entityUrl}#softwareapplication`,
    url: entityUrl,
    name: entity.title,
    description: entity.description || entity.summary,
    applicationCategory: entity.category || 'DeveloperApplication',
    operatingSystem: 'Any',
    softwareVersion: '1.0.0',
    author: {
      '@type': 'Person',
      name: 'Cris Nguyen',
      url: baseUrl,
    },
    ...(entity.githubLinks && entity.githubLinks.length > 0 ? { codeRepository: entity.githubLinks[0] } : {}),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

/**
 * Builds comprehensive KnowledgeGraph schema incorporating nodes & relationships
 */
export function generateKnowledgeGraphSchema(
  entities: KnowledgeEntity[],
  baseUrl: string = DEFAULT_SITE_URL
) {
  const graphNodes = entities.map(entity => {
    const entityUrl = `${baseUrl}/${getEntityPathSegment(entity.type)}/${entity.slug}`;

    const relatedLinks: string[] = [
      ...(entity.relatedTopics || []).map(t => `${baseUrl}/topics/${t}`),
      ...(entity.relatedSkills || []).map(s => `${baseUrl}/skills/${s}`),
      ...(entity.relatedMcps || []).map(m => `${baseUrl}/mcps/${m}`),
      ...(entity.relatedAgents || []).map(a => `${baseUrl}/agents/${a}`),
      ...(entity.relatedProjects || []).map(p => `${baseUrl}/projects/${p}`),
      ...(entity.relatedArchitectures || []).map(ar => `${baseUrl}/architectures/${ar}`),
    ];

    let baseSchema: Record<string, unknown>;
    switch (entity.type) {
      case 'project':
      case 'mcp':
      case 'agent':
        baseSchema = generateSoftwareApplicationSchema(entity, baseUrl);
        break;
      case 'skill':
      case 'prompt':
        baseSchema = generateDefinedTermSchema(entity, baseUrl);
        break;
      default:
        baseSchema = generateTechArticleSchema(entity, baseUrl);
        break;
    }

    return {
      ...baseSchema,
      '@id': `${entityUrl}#node`,
      relatedLink: relatedLinks.length > 0 ? relatedLinks : undefined,
    };
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        '@id': `${baseUrl}/knowledge#graph`,
        name: 'Cris Nguyen Knowledge OS Graph',
        description: 'Interconnected Knowledge Graph of topics, skills, MCPs, AI agents, and architectures.',
        itemListElement: entities.map((entity, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: `${baseUrl}/${getEntityPathSegment(entity.type)}/${entity.slug}#node`,
        })),
      },
      ...graphNodes,
    ],
  };
}

/**
 * Selects standard schema based on entity type
 */
function getPrimarySchemaForEntity(entity: KnowledgeEntity, baseUrl: string) {
  switch (entity.type) {
    case 'project':
    case 'mcp':
    case 'agent':
      return generateSoftwareApplicationSchema(entity, baseUrl);
    case 'skill':
    case 'prompt':
      return generateDefinedTermSchema(entity, baseUrl);
    default:
      return generateTechArticleSchema(entity, baseUrl);
  }
}

/**
 * React Server Component: Knowledge JsonLd Generator
 * Generates structured JSON-LD (<script type="application/ld+json">)
 * for TechArticle, DefinedTerm, SoftwareApplication, and KnowledgeGraph schemas.
 */
export function KnowledgeJsonLd({
  entity,
  entities,
  baseUrl = DEFAULT_SITE_URL,
  schemaType = 'auto',
  includeGraph = true,
}: KnowledgeJsonLdProps): ReactNode {
  const targetEntities = entities || (entity ? [entity] : []);

  if (targetEntities.length === 0) {
    return null;
  }

  let finalSchema: Record<string, unknown>;

  if (schemaType === 'TechArticle' && entity) {
    finalSchema = generateTechArticleSchema(entity, baseUrl);
  } else if (schemaType === 'DefinedTerm' && entity) {
    finalSchema = generateDefinedTermSchema(entity, baseUrl);
  } else if (schemaType === 'SoftwareApplication' && entity) {
    finalSchema = generateSoftwareApplicationSchema(entity, baseUrl);
  } else if (schemaType === 'KnowledgeGraph' || targetEntities.length > 1 || includeGraph) {
    finalSchema = generateKnowledgeGraphSchema(targetEntities, baseUrl);
  } else if (entity) {
    finalSchema = getPrimarySchemaForEntity(entity, baseUrl);
  } else {
    finalSchema = generateKnowledgeGraphSchema(targetEntities, baseUrl);
  }

  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(finalSchema, null, 2) }}
    />
  );
}

export default KnowledgeJsonLd;
