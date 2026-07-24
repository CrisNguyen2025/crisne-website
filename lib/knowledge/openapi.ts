export function generateOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Personal AI-First Knowledge Operating System API',
      description:
        'REST APIs and OpenAPI contracts designed for AI Agents to search, reason, and query knowledge entities, skills, MCPs, and architectural projects.',
      version: '1.0.0',
      contact: {
        name: 'Cris Nguyen Knowledge OS',
        url: 'https://crisnguyen.dev'
      }
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Knowledge OS Primary v1 API'
      }
    ],
    paths: {
      '/topics': {
        get: {
          summary: 'List or search knowledge topics',
          operationId: 'listTopics',
          parameters: [
            { name: 'query', in: 'query', schema: { type: 'string' }, description: 'Search term' },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
          ],
          responses: {
            '200': { description: 'Successful response' }
          }
        }
      },
      '/topics/{slug}': {
        get: {
          summary: 'Get topic details by ID or slug',
          operationId: 'getTopicBySlug',
          parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Topic detail response' },
            '404': { description: 'Topic not found' }
          }
        }
      },
      '/notes': {
        get: {
          summary: 'List or search notes',
          operationId: 'listNotes',
          responses: { '200': { description: 'List of notes' } }
        }
      },
      '/skills': {
        get: {
          summary: 'List or search skills',
          operationId: 'listSkills',
          responses: { '200': { description: 'List of skills' } }
        }
      },
      '/mcps': {
        get: {
          summary: 'List available MCP tools and servers',
          operationId: 'listMcps',
          responses: { '200': { description: 'List of MCP entities' } }
        }
      },
      '/agents': {
        get: {
          summary: 'List autonomous agents and prompts',
          operationId: 'listAgents',
          responses: { '200': { description: 'List of AI Agents' } }
        }
      },
      '/projects': {
        get: {
          summary: 'List real-world architectural reference projects',
          operationId: 'listProjects',
          responses: { '200': { description: 'List of projects' } }
        }
      },
      '/graph': {
        get: {
          summary: 'Get Knowledge Graph nodes and relationship edges',
          operationId: 'getKnowledgeGraph',
          responses: { '200': { description: 'Full Knowledge Graph Network JSON' } }
        }
      },
      '/search': {
        get: {
          summary: 'Unified search across all Knowledge OS entities',
          operationId: 'unifiedSearch',
          parameters: [
            { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'difficulty', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'Search results' } }
        }
      },
      '/recommendations': {
        get: {
          summary: 'AI Agent learning path and skill tree recommendation synthesis',
          operationId: 'getRecommendations',
          parameters: [
            { name: 'target', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['learning-path', 'mcp'] } }
          ],
          responses: { '200': { description: 'Recommendation synthesis response' } }
        }
      }
    }
  };
}
