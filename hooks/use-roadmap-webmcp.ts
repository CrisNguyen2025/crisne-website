'use client';

import { useEffect } from 'react';
import {
  createGroup,
  createItem,
  createLayer,
  createRoadmap,
  deleteGroup,
  deleteItem,
  deleteLayer,
  deleteRoadmapBySlug,
  exportAllRoadmaps,
  fetchAllRoadmaps,
  fetchRoadmapBySlug,
  reorderGroupItems,
  updateGroup,
  updateItemContent,
  updateItemInfo,
  updateLayer,
  updateRoadmapBySlug,
} from '@/logic/roadmap/roadmapService';
import { RoadmapLevel } from '@/lib/roadmap/types';
import { getRoadmapPageContext } from '@/logic/roadmap/roadmapAssistantService';

// WebMCP: navigator-level tool registry exposed as document.modelContext.
// Typed locally because the API is not yet in TypeScript's DOM lib.
interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, any>) => Promise<unknown>;
}

interface WebMcpRegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface WebMcpModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>;
  getTools(): Promise<WebMcpRegisteredTool[]>;
  executeTool(tool: WebMcpRegisteredTool, args: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }
}

const LEVEL_SCHEMA = { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] };
const CONFIRM_SCHEMA = {
  type: 'boolean',
  description: 'Must be true. Deletion is irreversible; confirm with the user first.',
};

// Notify the workspace (app/page.tsx) to refresh after any write, same as the chatbot does.
function notifyUpdated<T>(result: T): T {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('roadmap:updated'));
  }
  return result;
}

function requireConfirm(args: Record<string, any>) {
  if (args.confirm !== true) {
    throw new Error('Deletion requires confirm: true after the user has agreed.');
  }
}

const ROADMAP_WEBMCP_TOOLS: WebMcpTool[] = [
  {
    name: 'get_current_context',
    description: 'Get the roadmap and item the user is currently viewing, so "this" or "here" can be resolved.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => getRoadmapPageContext() ?? {},
  },
  {
    name: 'list_roadmaps',
    description: 'List all roadmap topics with their layer counts.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => fetchAllRoadmaps(),
  },
  {
    name: 'get_roadmap',
    description: 'Get one roadmap with its layers, groups and items. Accepts slug, shortCode or title.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    execute: ({ slug }) => fetchRoadmapBySlug(slug),
  },
  {
    name: 'export_roadmaps',
    description: 'Export all roadmaps with full layer, group and item data.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => exportAllRoadmaps(),
  },
  {
    name: 'create_roadmap',
    description: 'Create a new roadmap topic.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        shortCode: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'shortCode'],
    },
    execute: async (args) => notifyUpdated(await createRoadmap({ ...args, layers: [] } as any)),
  },
  {
    name: 'update_roadmap',
    description: 'Update a roadmap title, shortCode, description or lock state.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        shortCode: { type: 'string' },
        description: { type: 'string' },
        isLocked: { type: 'boolean' },
      },
      required: ['slug'],
    },
    execute: async ({ slug, ...payload }) =>
      notifyUpdated(await updateRoadmapBySlug(slug, payload)),
  },
  {
    name: 'delete_roadmap',
    description: 'Delete a roadmap topic and all its content. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['slug', 'confirm'],
    },
    execute: async ({ slug, ...args }) => {
      requireConfirm(args);
      await deleteRoadmapBySlug(slug);
      return notifyUpdated({ success: true, deletedSlug: slug });
    },
  },
  {
    name: 'create_layer',
    description: 'Create a layer inside a roadmap.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        shortTag: { type: 'string' },
        subtitle: { type: 'string' },
      },
      required: ['slug', 'title', 'shortTag'],
    },
    execute: async ({ slug, ...payload }) =>
      notifyUpdated(await createLayer(slug, payload as any)),
  },
  {
    name: 'update_layer',
    description: 'Update a layer title, shortTag or subtitle.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        shortTag: { type: 'string' },
        subtitle: { type: 'string' },
      },
      required: ['id', 'title', 'shortTag'],
    },
    execute: async (args) => notifyUpdated(await updateLayer(args as any)),
  },
  {
    name: 'delete_layer',
    description: 'Delete a layer and its groups and items. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['id', 'confirm'],
    },
    execute: async ({ id, ...args }) => {
      requireConfirm(args);
      await deleteLayer(id);
      return notifyUpdated({ success: true, deletedId: id });
    },
  },
  {
    name: 'create_group',
    description: 'Create a group (level section) inside a layer.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        title: { type: 'string' },
        level: LEVEL_SCHEMA,
      },
      required: ['layerId', 'title'],
    },
    execute: async ({ layerId, title, level }) =>
      notifyUpdated(await createGroup(layerId, title, level as RoadmapLevel | undefined)),
  },
  {
    name: 'update_group',
    description: 'Rename a group.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' } },
      required: ['id', 'title'],
    },
    execute: async ({ id, title }) => notifyUpdated(await updateGroup(id, title)),
  },
  {
    name: 'delete_group',
    description: 'Delete a group and its items. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['id', 'confirm'],
    },
    execute: async ({ id, ...args }) => {
      requireConfirm(args);
      await deleteGroup(id);
      return notifyUpdated({ success: true, deletedId: id });
    },
  },
  {
    name: 'create_item',
    description: 'Create a learning item (lesson) inside a layer.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        level: LEVEL_SCHEMA,
        title: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string', description: 'Optional body (HTML) saved in the same request' },
      },
      required: ['layerId', 'level', 'title'],
    },
    execute: async (args) => notifyUpdated(await createItem(args as any)),
  },
  {
    name: 'update_item',
    description: 'Update an item title, description or level.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        level: LEVEL_SCHEMA,
      },
      required: ['id', 'title', 'description'],
    },
    execute: async (args) => notifyUpdated(await updateItemInfo(args as any)),
  },
  {
    name: 'update_item_content',
    description: 'Replace the body content of an item.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, content: { type: 'string' } },
      required: ['id', 'content'],
    },
    execute: async (args) => notifyUpdated(await updateItemContent(args as any)),
  },
  {
    name: 'delete_item',
    description: 'Delete an item. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['id', 'confirm'],
    },
    execute: async ({ id, ...args }) => {
      requireConfirm(args);
      await deleteItem(id);
      return notifyUpdated({ success: true, deletedId: id });
    },
  },
  {
    name: 'reorder_items',
    description: 'Set the order of items within one group of a layer.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        level: LEVEL_SCHEMA,
        orderedItemIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['layerId', 'level', 'orderedItemIds'],
    },
    execute: async (args) => notifyUpdated(await reorderGroupItems(args as any)),
  },
];

/**
 * Registers the roadmap WebMCP tools on the current document while mounted.
 * Handlers call logic/roadmap/roadmapService, so API logic is not duplicated here.
 */
export function useRoadmapWebMcpTools() {
  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    for (const tool of ROADMAP_WEBMCP_TOOLS) {
      modelContext.registerTool(tool, { signal: controller.signal }).catch(() => {
        // Already registered (e.g. Strict Mode double mount) or rejected; ignore.
      });
    }

    return () => controller.abort();
  }, []);
}
