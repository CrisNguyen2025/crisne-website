/**
 * Plan for flattening Topic → Layer → Group → Item into Topic → Item with an optional `section` (ADR-0009).
 *
 * Pure: no database access, so the rules are testable. scripts/flatten-to-sections.ts reads the rows,
 * calls this, and writes the result.
 */

export interface LayerRow {
  id: string;
  roadmapId: string;
  order: number;
  title: string;
}

export interface GroupRow {
  id: string;
  layerId: string;
  order: number;
  title: string;
}

export interface ItemRow {
  id: string;
  groupId: string;
  order: number;
  title: string;
}

export interface TriageRow {
  id: string;
  layerId: string | null;
  groupTitle: string | null;
}

export interface ItemUpdate {
  id: string;
  roadmapId: string;
  section: string | null;
  order: number;
}

export interface TriageUpdate {
  id: string;
  section: string | null;
}

export interface FlattenPlan {
  items: ItemUpdate[];
  triage: TriageUpdate[];
  /** Two lessons of one topic that would have the same name: the migration stops until one is renamed. */
  conflicts: string[];
}

/** Same comparison as lib/roadmap/duplicates.ts normalizeTitle. */
export function normalizeTitle(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A layer with one group keeps the layer's name as its section. A layer with several groups keeps both:
 * "Layer · Group", so no lesson loses the group it was in.
 */
export function sectionName(layer: LayerRow, groupTitle: string | null, groupsInLayer: number): string {
  if (groupsInLayer <= 1 || !groupTitle) return layer.title.trim();
  return `${layer.title.trim()} · ${groupTitle.trim()}`;
}

export function planFlatten(input: {
  layers: LayerRow[];
  groups: GroupRow[];
  items: ItemRow[];
  triage: TriageRow[];
}): FlattenPlan {
  const layerById = new Map(input.layers.map((l) => [l.id, l]));
  const groupById = new Map(input.groups.map((g) => [g.id, g]));
  const groupsPerLayer = new Map<string, number>();
  for (const g of input.groups) groupsPerLayer.set(g.layerId, (groupsPerLayer.get(g.layerId) ?? 0) + 1);

  // Each lesson's place in the old tree, sorted into the order it had on the page
  const placed = input.items
    .map((item) => {
      const group = groupById.get(item.groupId);
      const layer = group && layerById.get(group.layerId);
      if (!group || !layer) throw new Error(`Lesson ${item.id} has no group or layer`);
      return { item, group, layer };
    })
    .sort(
      (a, b) =>
        a.layer.order - b.layer.order ||
        a.group.order - b.group.order ||
        a.item.order - b.item.order
    );

  const items: ItemUpdate[] = [];
  const conflicts: string[] = [];
  const nextOrder = new Map<string, number>();
  const seenTitle = new Map<string, string>();

  for (const { item, group, layer } of placed) {
    const roadmapId = layer.roadmapId;
    const key = `${roadmapId}\u0000${normalizeTitle(item.title)}`;
    if (seenTitle.has(key)) {
      conflicts.push(`"${item.title}" appears twice in one topic (${seenTitle.get(key)} and ${item.id})`);
    } else {
      seenTitle.set(key, item.id);
    }
    const order = (nextOrder.get(roadmapId) ?? 0) + 1;
    nextOrder.set(roadmapId, order);
    items.push({
      id: item.id,
      roadmapId,
      section: sectionName(layer, group.title, groupsPerLayer.get(layer.id) ?? 0),
      order,
    });
  }

  // Triage keeps the target it was drafted for, as a section name; no layer means no section
  const triage: TriageUpdate[] = input.triage.map((t) => {
    const layer = t.layerId ? layerById.get(t.layerId) : undefined;
    if (!layer) return { id: t.id, section: null };
    return { id: t.id, section: sectionName(layer, t.groupTitle, groupsPerLayer.get(layer.id) ?? 0) };
  });

  return { items, triage, conflicts };
}
