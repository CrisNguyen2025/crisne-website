/**
 * Centralized React Query key factory for all roadmap-related queries.
 * Use these keys for useQuery / useMutation cache management.
 */
export const ROADMAP_QUERY_KEYS = {
  /** All layers with their groups and items */
  all: ['roadmap'] as const,

  /** All layers list */
  layers: () => [...ROADMAP_QUERY_KEYS.all, 'layers'] as const,

  /** A single layer by ID */
  layer: (layerId: string) => [...ROADMAP_QUERY_KEYS.layers(), layerId] as const,

  /** All items (flattened) */
  items: () => [...ROADMAP_QUERY_KEYS.all, 'items'] as const,

  /** A single item by ID */
  item: (itemId: string) => [...ROADMAP_QUERY_KEYS.items(), itemId] as const,

  /** Item content (heavy HTML blob fetched separately) */
  itemContent: (itemId: string) => [...ROADMAP_QUERY_KEYS.item(itemId), 'content'] as const,
} as const;
