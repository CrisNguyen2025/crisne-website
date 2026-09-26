# Roadmap — API Migration Guide

This document describes what to do to replace the current `localStorage`-only state with a real backend API.

---

## Current Architecture (localStorage)

```
app/page.tsx
  └── hooks/use-roadmap.ts          ← all state + localStorage persistence
        └── lib/roadmap/data.ts     ← hardcoded seed data
```

## Target Architecture (API-ready)

```
app/page.tsx
  └── hooks/use-roadmap.ts          ← thin wrapper exposing state & mutations
        ├── logic/roadmap/useRoadmapQueries.ts   ← useQuery / useMutation hooks (TODO)
        └── logic/roadmap/roadmapService.ts      ← HTTP calls (ready)
              ← lib/roadmap/types.ts (DTOs defined)
              ← logic/roadmap/queryKeys.ts (keys ready)
```

---

## Step-by-Step Migration

### Step 1 — Install dependencies

```bash
yarn add @tanstack/react-query qs
yarn add -D @types/qs
```

### Step 2 — Wrap app with QueryClientProvider

In `app/layout.tsx`, add the React Query provider:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function RootLayout({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Step 3 — Create `useRoadmapQueries.ts`

Create `logic/roadmap/useRoadmapQueries.ts` with:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROADMAP_QUERY_KEYS } from './queryKeys';
import * as roadmapService from './roadmapService';
import type { UpdateItemContentDto, UpdateItemInfoDto, CreateItemDto } from '@/lib/roadmap/types';

export function useRoadmapQuery() {
  return useQuery({
    queryKey: ROADMAP_QUERY_KEYS.layers(),
    queryFn: roadmapService.fetchRoadmap,
  });
}

export function useUpdateItemContentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateItemContentDto) => roadmapService.updateItemContent(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ROADMAP_QUERY_KEYS.item(variables.id) });
    },
  });
}

export function useUpdateItemInfoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateItemInfoDto) => roadmapService.updateItemInfo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROADMAP_QUERY_KEYS.layers() });
    },
  });
}

export function useCreateItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateItemDto) => roadmapService.createItem(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROADMAP_QUERY_KEYS.layers() });
    },
  });
}
```

### Step 4 — Update `hooks/use-roadmap.ts`

Replace the manual `setLayers` + `persistLayers` calls with calls to the React Query mutations above. The hook becomes a thin selector/dispatcher:

```ts
// Instead of:
const addItem = useCallback((layerId, level, title, desc) => {
  // ... manual state manipulation + localStorage
}, []);

// Use:
const { mutate: addItem } = useCreateItemMutation();
```

### Step 5 — Point `roadmapService.ts` to real backend

Update the API paths in `logic/roadmap/roadmapService.ts`. Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend.com
```

### Step 6 — Add Prisma models (if backend is Next.js/Prisma)

Add to `prisma/schema.prisma`:

```prisma
model RoadmapLayer {
  id       String         @id @default(cuid())
  order    Int
  shortTag String
  title    String
  subtitle String         @default("")
  groups   RoadmapGroup[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}

model RoadmapGroup {
  id      String         @id @default(cuid())
  level   String
  title   String
  layerId String
  layer   RoadmapLayer   @relation(fields: [layerId], references: [id], onDelete: Cascade)
  items   RoadmapItem[]
}

model RoadmapItem {
  id          String       @id @default(cuid())
  title       String
  description String       @default("")
  level       String
  content     String?
  tags        String[]
  groupId     String
  group       RoadmapGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}
```

---

## Files Already Done ✅

| File | Status | Purpose |
|------|--------|---------|
| `lib/roadmap/types.ts` | ✅ Done | Domain models + DTOs (CreateItemDto, UpdateItemContentDto, etc.) |
| `lib/roadmap/content-utils.ts` | ✅ Done | XSS sanitization + Callout rendering |
| `logic/roadmap/queryKeys.ts` | ✅ Done | Centralized React Query key factory |
| `logic/roadmap/roadmapService.ts` | ✅ Done | HTTP API service — replace paths with real backend |
| `components/roadmap/DetailPanel.tsx` | ✅ Done | Empty state UX + English labels |
| `components/ui/editor/plugins/SetContentPlugin/` | ✅ Done | Empty paragraph fallback on load |

## Files TODO (when API is ready)

| File | Action |
|------|--------|
| `logic/roadmap/useRoadmapQueries.ts` | Create — contains useQuery / useMutation hooks |
| `hooks/use-roadmap.ts` | Migrate from localStorage to useRoadmapQueries |
| `app/layout.tsx` | Add QueryClientProvider |
| `app/api/v1/roadmap/` | Create Next.js route handlers for CRUD |
| `prisma/schema.prisma` | Add RoadmapLayer, RoadmapGroup, RoadmapItem models |
