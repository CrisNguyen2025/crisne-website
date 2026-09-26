# Left Panel (MasterPanel) — BE/Dynamic Data Trace Audit

## 1. Architecture Diagram

```
app/page.tsx
  ├── useRoadmap()                   ← state source (currently localStorage)
  │     ├── layers[]                 → passed as props to MasterPanel
  │     ├── filteredLayers[]         → rendered in left panel
  │     ├── stats{}                  → displayed in header
  │     └── callbacks (add/edit/delete/reorder)
  │
  └── <ResizableLayout>
        └── leftContent: <MasterPanel>
              ├── Header bar         ← "AI Architecture" + stats.total
              ├── Layer filter tabs  ← allLayers.map(layer.shortTag)
              ├── Layers list        ← filteredLayers.map(layer)
              │     └── SortableGroup ← layer.groups.map(group)
              │           └── ChecklistItemRow ← group.items.map(item)
              ├── <EditLayerModal>   ← triggered by ⋯ > Edit
              └── <CreateGroupModal> ← triggered by ⋯ > New Group
```

## 2. BE Adaptation Analysis — Will it work with dynamic data?

### ✅ Things that ALREADY work with dynamic data

| Feature | Why it works |
|---------|--------------|
| Layer list rendering | `layers.map(layer)` — fully data-driven, no hardcoding |
| Layer filter tabs | `allLayers.map(layer.shortTag)` — adapts to any number of layers |
| Group rendering | `layer.groups.map(group)` — groups come from data |
| Item list rendering | `group.items.map(item)` — items fully data-driven |
| Item title + description | Uses `item.title`, `item.description` fields |
| DnD reorder | Calls `onReorderGroupItems(layerId, level, reorderedItems)` — emits new order |
| Active item highlight | `item.id === activeItemId` — ID-based, works with any ID format |
| Layer collapse state | Stored locally in component state (not in data) — no issues |
| Empty state | `layers.length === 0` check already exists |

### ⚠️ Issues / Gaps when connecting real BE

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | **No loading skeleton** | `MasterPanel.tsx:299` | When API fetches, panel shows empty state flash before data arrives |
| 2 | **No error state** | `MasterPanel.tsx` | If API fails, users see empty state with no error message |
| 3 | **`isLoaded` not used in left panel** | `hooks/use-roadmap.ts` returns `isLoaded` but `MasterPanel` ignores it | Left panel flashes empty before hydration |
| 4 | **Vietnamese hardcoded UI strings** | Many locations in `MasterPanel`, modals | Violates no-Vietnamese rule |
| 5 | **`useRoadmap` not API-aware** | `hooks/use-roadmap.ts` | All mutations bypass actual API; need to wire mutations to `roadmapService` |
| 6 | **`onReorderGroupItems` sends full objects** | `MasterPanel.tsx:83`, `use-roadmap.ts:323` | API contract for reorder should send only ordered IDs (per `ReorderGroupItemsDto`) |
| 7 | **Item badge says "khái niệm"** | `MasterPanel.tsx:116, 434` | Should be "items" or localized properly |
| 8 | **`deleteLayer` guard uses Vietnamese alert/confirm** | `MasterPanel.tsx:414-421` | Should use English and be a proper modal |
| 9 | **No optimistic update mechanism** | `use-roadmap.ts` | When API is slow, UI lags; need optimistic pattern |
| 10 | **`filteredLayers` derived client-side** | `use-roadmap.ts:401` | Fine for localStorage; with BE could be a server-side filter param |

## 3. Data Contract — What BE must return

```ts
// GET /api/v1/roadmap → GetRoadmapResponseDto
{
  layers: [
    {
      id: "layer-01",
      order: 1,
      shortTag: "01-DB",
      title: "Knowledge Base",
      subtitle: "...",
      groups: [
        {
          id: "group-core",
          level: "core",
          title: "🟢 Core",
          items: [
            {
              id: "kb-core-01",
              layerId: "layer-01",
              level: "core",
              title: "Knowledge Base (KB)",
              description: "...",
              content: "<p>...</p>",   // can be null → empty state shown
              tags: [],
              createdAt: "2026-08-25T08:00:00Z",
              updatedAt: "2026-09-23T14:30:00Z"
            }
          ]
        }
      ]
    }
  ]
}
```

**All existing components will render this structure correctly without modification** — the data shape matches exactly.

## 4. Loading States Needed

```
MasterPanel loading state:
- Layer filter tabs → skeleton pills
- Layers list → 2-3 skeleton layer cards

ChecklistItemRow loading:
- Skeleton rows inside groups

After mutation (add/delete/reorder):
- Optimistic update: immediately reflect change in UI
- On error: revert to previous state + show toast
```

## 5. Migration Checklist

- [x] DTO types defined (`lib/roadmap/types.ts`)
- [x] API service layer created (`logic/roadmap/roadmapService.ts`)
- [x] Query keys defined (`logic/roadmap/queryKeys.ts`)
- [ ] Add `isLoading` / `isError` props to `MasterPanel`
- [ ] Add skeleton loading UI to left panel
- [ ] Add error state UI to left panel
- [ ] Translate remaining Vietnamese strings in `MasterPanel`
- [ ] Translate strings in `CreateLayerModal`, `EditLayerModal`, `CreateGroupModal`
- [ ] Create `logic/roadmap/useRoadmapQueries.ts` (React Query hooks)
- [ ] Wire `use-roadmap.ts` mutations to `roadmapService`
- [ ] Install `@tanstack/react-query` + `qs`
