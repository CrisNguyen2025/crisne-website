'use client';

import { useEffect } from 'react';
import { useCanWrite } from '@/hooks/use-can-write';
import {
  clearDeletedTopicSlug,
  recordPendingDeletion,
} from '@/lib/roadmap/pending-write';
import {
  createItem,
  createRoadmap,
  deleteItem,
  deleteRoadmapBySlug,
  exportAllRoadmaps,
  fetchAllRoadmaps,
  fetchRoadmapBySlug,
  renameSection,
  reorderItems,
  updateItemContent,
  updateItemInfo,
  updateRoadmapBySlug,
} from '@/logic/roadmap/roadmapService';
import { getRoadmapPageContext } from '@/logic/roadmap/roadmapAssistantService';

// WebMCP: navigator-level tool registry exposed as document.modelContext.
// Typed locally because the API is not yet in TypeScript's DOM lib.
interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
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

const CONFIRM_SCHEMA = {
  type: 'boolean',
  description: 'Must be true. Deletion is irreversible; confirm with the user first.',
};

function typedTool<TArgs>(
  tool: Omit<WebMcpTool, 'execute'> & { execute: (args: TArgs) => Promise<unknown> },
): WebMcpTool {
  return {
    ...tool,
    execute: (args) => tool.execute(args as TArgs),
  };
}

// Notify the workspace to refresh after any write, same as the chatbot does.
function notifyUpdated<T>(
  result: T,
  detail?: { deletedLessonId?: string; deletedTopicSlug?: string },
): T {
  recordPendingDeletion(detail);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('roadmap:updated', detail ? { detail } : undefined),
    );
  }
  return result;
}

function requireConfirm(args: { confirm?: boolean }) {
  if (args.confirm !== true) {
    throw new Error('Deletion requires confirm: true after the user has agreed.');
  }
}

const ROADMAP_WEBMCP_TOOLS: WebMcpTool[] = [
  {
    name: 'get_current_context',
    description: 'Get the topic, section and lesson the user is currently viewing, so "this" or "here" can be resolved.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => getRoadmapPageContext() ?? {},
  },
  {
    name: 'list_roadmaps',
    description: 'List all topics with their lesson counts.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => fetchAllRoadmaps(),
  },
  typedTool<{ slug: string }>({
    name: 'get_roadmap',
    description: 'Get one topic with its lessons in page order and its sections. Accepts slug or title.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
    execute: ({ slug }) => fetchRoadmapBySlug(slug),
  }),
  {
    name: 'export_roadmaps',
    description: 'Export all topics with their lessons, each lesson naming its section.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => exportAllRoadmaps(),
  },
  typedTool<Parameters<typeof createRoadmap>[0]>({
    name: 'create_roadmap',
    description: 'Create a new topic. Lessons are added afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const created = await createRoadmap(args);
      if (created?.roadmap?.slug) {
        clearDeletedTopicSlug(created.roadmap.slug);
      }
      return notifyUpdated(created);
    },
  }),
  typedTool<{ slug: string } & Parameters<typeof updateRoadmapBySlug>[1]>({
    name: 'update_roadmap',
    description: 'Update a topic title, description or lock state.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        isLocked: { type: 'boolean' },
      },
      required: ['slug'],
    },
    execute: async ({ slug, ...payload }) => notifyUpdated(await updateRoadmapBySlug(slug, payload)),
  }),
  typedTool<{ slug: string; confirm?: boolean }>({
    name: 'delete_roadmap',
    description: 'Delete a topic and all its lessons. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['slug', 'confirm'],
    },
    execute: async ({ slug, ...args }) => {
      requireConfirm(args);
      await deleteRoadmapBySlug(slug);
      return notifyUpdated(
        { success: true, deletedSlug: slug },
        { deletedTopicSlug: slug },
      );
    },
  }),
  typedTool<Parameters<typeof createItem>[0]>({
    name: 'create_item',
    description:
      'Add a lesson to a topic. section is optional: it names a section of the topic (reused if it exists, created if not); leave it out for a lesson outside any section.',
    inputSchema: {
      type: 'object',
      properties: {
        roadmapSlug: { type: 'string' },
        section: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string', description: 'Optional body (HTML) saved in the same request' },
      },
      required: ['roadmapSlug', 'title'],
    },
    execute: async (args) => notifyUpdated(await createItem(args)),
  }),
  typedTool<Parameters<typeof updateItemInfo>[0]>({
    name: 'update_item',
    description: 'Update a lesson title and description. section moves it to another section ("" takes it out of its section).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        section: { type: 'string' },
      },
      required: ['id', 'title', 'description'],
    },
    execute: async (args) => notifyUpdated(await updateItemInfo(args)),
  }),
  typedTool<{ slug: string; from: string; to: string }>({
    name: 'rename_section',
    description: 'Rename a section of a topic; every lesson in it moves to the new name. Renaming onto an existing section merges them.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['slug', 'from', 'to'],
    },
    execute: async ({ slug, from, to }) => notifyUpdated(await renameSection(slug, { from, to })),
  }),
  typedTool<Parameters<typeof updateItemContent>[0]>({
    name: 'update_item_content',
    description: 'Replace the body content of a lesson.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, content: { type: 'string' } },
      required: ['id', 'content'],
    },
    execute: async (args) => notifyUpdated(await updateItemContent(args)),
  }),
  typedTool<{ id: string; confirm?: boolean }>({
    name: 'delete_item',
    description: 'Delete a lesson. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, confirm: CONFIRM_SCHEMA },
      required: ['id', 'confirm'],
    },
    execute: async ({ id, ...args }) => {
      requireConfirm(args);
      await deleteItem(id);
      return notifyUpdated(
        { success: true, deletedId: id },
        { deletedLessonId: id },
      );
    },
  }),
  typedTool<Parameters<typeof reorderItems>[0]>({
    name: 'reorder_items',
    description: 'Set the page order of the lessons of a topic.',
    inputSchema: {
      type: 'object',
      properties: {
        orderedItemIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['orderedItemIds'],
    },
    execute: async (args) => notifyUpdated(await reorderItems(args)),
  }),
];

/**
 * Registers the roadmap WebMCP tools on the current document while mounted.
 * Handlers call logic/roadmap/roadmapService, so API logic is not duplicated here.
 */
export function useRoadmapWebMcpTools() {
  const canWrite = useCanWrite();

  useEffect(() => {
    if (!canWrite) return;
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    for (const tool of ROADMAP_WEBMCP_TOOLS) {
      modelContext.registerTool(tool, { signal: controller.signal }).catch(() => {
        // Already registered (e.g. Strict Mode double mount) or rejected; ignore.
      });
    }

    return () => controller.abort();
  }, [canWrite]);
}
