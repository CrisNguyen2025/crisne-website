import { createHash } from "crypto";
import type { WorkflowGraph } from "./dsl-types";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function sortKeysDeep(value: unknown): Json {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        // Dropped like JSON.stringify does, so `{ a: undefined }` hashes as `{}`
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])])
    );
  }
  return value as Json;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stable JSON for a graph: object keys sorted, nodes and edges sorted by id.
 * Array order inside configs (e.g. condition branches) is meaningful and kept.
 */
export function canonicalizeGraph(graph: WorkflowGraph): string {
  return JSON.stringify(
    sortKeysDeep({
      ...graph,
      nodes: [...graph.nodes].sort(byId),
      edges: [...graph.edges].sort(byId),
    })
  );
}

/** sha256 of the canonical graph. Layout lives in `ui`, so moving nodes never changes it. */
export function graphHash(graph: WorkflowGraph): string {
  return createHash("sha256").update(canonicalizeGraph(graph)).digest("hex");
}
