# Frontend Dead Code & Orphaned UI Audit Report

## 1. Observation

### Summary Table of Findings

| ID | File Path & Line | Type | Symbol / Item Name | Reference Count (External) | Status & Impact |
|---|---|---|---|:---:|---|
| **F-01** | `components/ui/skeleton.tsx:12-23` | UI Component | `HeroSkeleton` | 0 | Dead Component (unmounted fallback) |
| **F-02** | `components/ui/skeleton.tsx:25-36` | UI Component | `SkillsSkeleton` | 0 | Dead Component (unmounted fallback) |
| **F-03** | `components/ui/tooltip.tsx:20-66` | UI Component | `Tooltip`, `TooltipTrigger`, `TooltipContent` | 0 | Unused Base UI wrappers (only `TooltipProvider` used) |
| **F-04** | `components/ui/image-preview/PreviewImage.tsx:35-50` | UI Component | `PreviewImage` | 0 | Orphaned Component (only in README / index export) |
| **F-05** | `app/api/posts/slug/[slug]/route.ts:8-28` | API Route | `GET /api/posts/slug/:slug` | 0 | Orphaned API Route (Server Component calls direct) |
| **F-06** | `lib/roadmap/markdown.ts:29-53` | Utility Module | `markdownToSafeHtml`, `markdownToPlainText` | 0 (Prod) | Dead Module (0 production callers, only unit tests) |
| **F-07** | `lib/ai/generate-json.ts:12-63` | AI Utility Module | `generateJson`, `generateJsonWithFallback`, `stripCodeFence` | 0 (Prod) | Dead Module (0 production callers, only unit tests) |
| **F-08** | `lib/roadmap/date-utils.ts:13-16` | Utility Export | `formatExactDate` | 0 | Dead Export (0 callers across workspace) |
| **F-09** | `lib/roadmap/content-utils.ts:105-124` | Utility Export | `sanitizeDangerousHtml` | 0 (Ext) | Dead Export (only called internally by `contentToHtml`) |
| **F-10** | `lib/notion.ts:188, 198` | Utility Exports | `mapTag`, `mapPost` | 0 (Ext) | Dead Exports (only called internally inside `lib/notion.ts`) |
| **F-11** | `lib/notion.ts:356-363` | Helper Function | `slugify` (private) | - | Redundant Duplicate of `lib/utils.ts:18-28` |
| **F-12** | `lib/prisma.ts:30-52` | Architecture / Type Guard | `isCurrentClient()` delegates | - | Vestigial Code: checks deleted workflow/role models |
| **F-13** | `app/notes/layout.tsx:2, 58` | Component / Context | `<ToastProvider>` in `NotesLayout` | - | Duplicate Provider (already mounted in root `layout.tsx`) |
| **F-14** | `lib/ai/action-chips.ts:94, 163` | AI Utilities | `formatActionChip`, `appendEntityActionChips` | 0 (Prod) | Dead Functions (0 callers outside tests) |
| **F-15** | `components/floating-bot/*`, `hooks/use-floating-chat.ts` | Legacy Bot | Cris AI Chat Components | Active | Active on `/portfolio` via `SiteChatbot` (NOT dead) |

---

### Detailed Observations with Direct Code Quotes

#### Observation 1: `HeroSkeleton` & `SkillsSkeleton` (`components/ui/skeleton.tsx`)
In `components/ui/skeleton.tsx`:
```tsx
// Lines 12-23:
export function HeroSkeleton() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 p-8">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-6 w-96" />
      <div className="flex gap-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

// Lines 25-36:
export function SkillsSkeleton() {
  return (
    <div className="py-20 px-4">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
```
In `app/portfolio/page.tsx:3-5, 10-16`:
```tsx
import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section";
import { SkillsSection } from "@/components/skills-section";
...
import {
  ExperienceSkeleton,
  ProjectsSkeleton,
  TestimonialsSkeleton,
  FaqSkeleton,
  CtaSkeleton,
} from "@/components/ui/skeleton";
```
`HeroSection` and `SkillsSection` are imported statically without `dynamic()`. Their skeletons `HeroSkeleton` and `SkillsSkeleton` are never imported or rendered anywhere.
Search result:
- `grep_search "HeroSkeleton"` → 1 hit (definition only).
- `grep_search "SkillsSkeleton"` → 1 hit (definition only).

#### Observation 2: `Tooltip`, `TooltipTrigger`, `TooltipContent` (`components/ui/tooltip.tsx`)
In `components/ui/tooltip.tsx`:
```tsx
// Lines 20-30:
function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({ ... }: ...) { ... }

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```
In `app/layout.tsx:5`:
```tsx
import { TooltipProvider } from "@/components/ui/tooltip";
```
Search results:
- `grep_search "TooltipContent"` → 2 hits in `components/ui/tooltip.tsx` (definition & export). 0 external usages.
- `grep_search "TooltipTrigger"` → 2 hits in `components/ui/tooltip.tsx` (definition & export). 0 external usages.
- Outside of `app/layout.tsx:5` importing `TooltipProvider`, neither `Tooltip`, `TooltipTrigger`, nor `TooltipContent` is imported or rendered by any component across the application.

#### Observation 3: `PreviewImage` (`components/ui/image-preview/PreviewImage.tsx`)
In `components/ui/image-preview/PreviewImage.tsx`:
```tsx
// Lines 35-43:
export function PreviewImage({
  src,
  alt = 'Image preview',
  width,
  height,
  className = '',
  priority = false,
  quality = 85,
}: PreviewImageProps) { ... }
```
In `components/ui/image-preview/index.ts:1-2`:
```ts
export { ImagePreview } from './ImagePreview';
export { PreviewImage } from './PreviewImage';
```
Search results:
- `grep_search "PreviewImage"` → 0 imports in application code. References exist only in `PreviewImage.tsx`, `index.ts`, and `README.md`.
- In `app/notes/NotesClient.tsx:3073`, the state variable `previewImage` is a local React state object (`{ src: string; alt?: string } | null`), and renders `<ImagePreview ... />`, NOT `<PreviewImage />`.

#### Observation 4: Orphaned Route `app/api/posts/slug/[slug]/route.ts`
In `app/api/posts/slug/[slug]/route.ts`:
```ts
// Line 8:
export async function GET(_req: NextRequest, { params }: Params) { ... }
```
In `app/notes/[slug]/page.tsx:2-19`:
```tsx
import { getPostBySlug, getPostById, getTags } from "@/lib/notion";
...
export default async function NoteDetailPage({ params }: Props) {
  const { slug } = await params;
  const [rawPost, tags] = await Promise.all([
    getPostBySlug(slug).then((p) => p ?? getPostById(slug)),
    getTags(),
  ]);
  ...
```
Search results:
- `grep_search "/api/posts/slug"` → 2 hits, both inside `app/api/posts/slug/[slug]/route.ts` itself.
- 0 callers anywhere across frontend components, hooks, or backend logic. Server Component resolves directly from Notion library.

#### Observation 5: Dead Module `lib/roadmap/markdown.ts`
In `lib/roadmap/markdown.ts`:
```ts
// Line 29:
export function markdownToSafeHtml(markdown: string): string { ... }
// Line 46:
export function markdownToPlainText(markdown: string, maxLength: number): string { ... }
```
Search results:
- `grep_search "markdownToSafeHtml"` → 0 usages in `app/`, `components/`, `hooks/`, `lib/`, `logic/`. Only in `tests/unit/markdown.test.ts:2`.
- `grep_search "markdownToPlainText"` → 0 usages in `app/`, `components/`, `hooks/`, `lib/`, `logic/`. Only in `tests/unit/markdown.test.ts:2`.
- The actual lesson rendering in `components/roadmap/DetailPanel.tsx` uses Lexical editor HTML or `contentToHtml` from `lib/roadmap/content-utils.ts`.

#### Observation 6: Dead Module `lib/ai/generate-json.ts`
In `lib/ai/generate-json.ts`:
```ts
// Line 12:
export function stripCodeFence(text: string): string { ... }
// Line 35:
export async function generateJson<T>(...): Promise<JsonResult<T>> { ... }
// Line 53:
export async function generateJsonWithFallback<T>(...): Promise<JsonResult<T> ...> { ... }
```
Search results:
- `grep_search "generateJson"` → 0 usages in `app/`, `components/`, `hooks/`, `lib/` (except itself and `tests/unit/generate-json.test.ts`).
- `grep_search "generateJsonWithFallback"` → 0 usages outside `generate-json.ts` and `tests/unit/generate-json.test.ts`.
- Cris AI (`app/api/chat/route.ts`) exclusively streams text via `generateStreamWithFallback`; it never calls `generateJson`.

#### Observation 7: `formatExactDate` in `lib/roadmap/date-utils.ts`
In `lib/roadmap/date-utils.ts`:
```ts
// Lines 13-16:
export function formatExactDate(dateString?: string): string {
  if (!dateString) return '';
  return dayjs(dateString).format('DD/MM/YYYY HH:mm');
}
```
Search results:
- `grep_search "formatExactDate"` → 1 hit (definition in `lib/roadmap/date-utils.ts:13`).
- 0 callers in any component or page. Only `formatFriendlyTime` is imported in `components/roadmap/DetailPanel.tsx:17`.

#### Observation 8: `sanitizeDangerousHtml` in `lib/roadmap/content-utils.ts`
In `lib/roadmap/content-utils.ts`:
```ts
// Line 97:
html = sanitizeDangerousHtml(html);
// Line 105:
export function sanitizeDangerousHtml(rawHtml: string): string { ... }
```
Search results:
- `grep_search "sanitizeDangerousHtml"` → 0 external callers. It is only called internally at line 97 inside `contentToHtml`.

#### Observation 9: `mapTag` & `mapPost` in `lib/notion.ts`
In `lib/notion.ts`:
```ts
// Line 188:
export function mapTag(page: PageObjectResponse): NotionTag { ... }
// Line 198:
export function mapPost(page: PageObjectResponse): NotionPost { ... }
```
Search results:
- `grep_search "mapTag"` → only called internally within `lib/notion.ts` (lines 219, 225, 237, 252).
- `grep_search "mapPost"` → only called internally within `lib/notion.ts` (lines 285, 291, 298, 320, 345).
- 0 external imports across the project.

#### Observation 10: Private `slugify` Duplicate in `lib/notion.ts`
In `lib/notion.ts:356-363`:
```ts
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```
Meanwhile, `lib/utils.ts:18-28` provides:
```ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```
The private duplicate in `lib/notion.ts` is redundant and drops Vietnamese diacritics.

#### Observation 11: Vestigial Model Delegates in `lib/prisma.ts`
In `lib/prisma.ts:30-52`:
```ts
function isCurrentClient(client: PrismaClient) {
  const delegates = client as PrismaClient & {
    role?: unknown;
    apiEndpoint?: unknown;
    roleApiAccess?: unknown;
    roadmap?: unknown;
    workflow?: unknown;
    workflowProject?: unknown;
    workflowVersion?: unknown;
    projectDocument?: unknown;
  };

  return Boolean(
    delegates.role &&
    delegates.apiEndpoint &&
    delegates.roleApiAccess &&
    delegates.roadmap &&
    delegates.workflow &&
    delegates.workflowProject &&
    delegates.workflowVersion &&
    delegates.projectDocument
  );
}
```
In `prisma/schema.prisma:18-50`, only two models exist: `Roadmap` and `RoadmapItem`. `workflow`, `workflowProject`, `workflowVersion`, `projectDocument`, `role`, `apiEndpoint`, `roleApiAccess` were removed in previous architecture migrations.
Because all operands are joined with `&&`, `isCurrentClient` returns `false` unconditionally, defeating Prisma client caching across hot reloads.

#### Observation 12: Duplicate `<ToastProvider>` in `app/notes/layout.tsx`
In `app/layout.tsx:17-18, 177`:
```tsx
import { ToastProvider } from "@/components/ui/toast";
...
<ToastProvider>
  <NuqsAdapter>{children}</NuqsAdapter>
  <SiteChatbot />
  <RoadmapWebMcpRegistrar />
</ToastProvider>
```
In `app/notes/layout.tsx:2, 58`:
```tsx
import { ToastProvider } from "@/components/ui/toast";
...
<main className="relative">
  <ToastProvider>{children}</ToastProvider>
</main>
```
`<ToastProvider>` initializes a full `ToastContainer` with `position="top-center"`. Mounting it again in `NotesLayout` creates duplicate toast containers in the DOM when navigating to `/notes`.

#### Observation 13: `formatActionChip` & `appendEntityActionChips` in `lib/ai/action-chips.ts`
In `lib/ai/action-chips.ts`:
```ts
// Line 94:
export function formatActionChip(type: ActionChipType, id: string, label: string): string { ... }
// Line 163:
export function appendEntityActionChips(rawText: string): string { ... }
```
Search results:
- `grep_search "appendEntityActionChips"` → 0 calls in `app/api/chat/route.ts` or client components. Only in `tests/unit/action-chips.test.ts` and stress tests.
- In production, `FloatingChatDrawer.tsx:322` parses incoming tags with `parseMessageContentAndActions`, but the server never formats tags using `appendEntityActionChips`.

#### Observation 14: Project Structure Layout Compliance
- The task dispatch mentioned checking `components/shared/` and `components/layout/`.
- Neither `components/shared/` nor `components/layout/` exists in this repository. The project uses `components/`, `components/ui/`, `components/roadmap/`, `components/floating-bot/`, and `components/analytics/`.

#### Observation 15: Status of Floating-Bot / Cris AI Chat
- Files:
  - `components/floating-bot/FloatingChatBot.tsx`
  - `components/floating-bot/FloatingChatBotWrapper.tsx`
  - `components/floating-bot/FloatingChatDrawer.tsx`
  - `components/floating-bot/FloatingQuickBar.tsx`
  - `hooks/use-floating-chat.ts`
  - `app/api/chat/route.ts`
  - `app/api/chat/feedback/route.ts`
- Verification:
  - In `app/layout.tsx:179`, `<SiteChatbot />` is rendered for all pages.
  - In `components/site-chatbot.tsx:13-15`:
    ```tsx
    if (pathname?.startsWith("/portfolio")) {
      return <FloatingChatBot />;
    }
    ```
  - When a user navigates to `/portfolio`, `FloatingChatBot` is mounted dynamically.
  - Per `AGENTS.md` ("🎯 Phạm vi hiện tại"):
    > "Từ 2026-11-09 chỉ tập trung vào Abot (Roadmap Assistant, `roadmap-rag-assistant/`). Cris AI (`/portfolio`, `hooks/use-floating-chat.ts`, `components/floating-bot/**`) tạm ngoài phạm vi... Vẫn giữ nguyên luồng 👍/👎 hiện có của Cris AI."
  - Cris AI is preserved intentionally for `/portfolio` and is NOT orphaned.

---

## 2. Logic Chain

1. **Premise 1 (Unreferenced code is dead code)**: Any exported symbol, component, or route that has zero callers or references across all production runtime entry points (`app/`, `components/`, `hooks/`, `lib/`, `logic/`) constitutes dead code.
2. **Step 1 (UI Component Skeletons)**:
   - `HeroSkeleton` and `SkillsSkeleton` are exported from `components/ui/skeleton.tsx`.
   - `app/portfolio/page.tsx` imports `HeroSection` and `SkillsSection` statically without fallback skeletons.
   - Ripgrep confirms 0 calls. Therefore, `HeroSkeleton` and `SkillsSkeleton` are unused.
3. **Step 2 (Tooltip Primitives)**:
   - `components/ui/tooltip.tsx` exports `Tooltip`, `TooltipTrigger`, `TooltipContent`, and `TooltipProvider`.
   - Root layout imports only `TooltipProvider`.
   - Ripgrep across all `.tsx` files confirms zero occurrences of `<Tooltip>`, `<TooltipTrigger>`, or `<TooltipContent>`. Therefore, these primitive wrappers are unused.
4. **Step 3 (Image Preview)**:
   - `PreviewImage.tsx` exports `PreviewImage`.
   - The only occurrence in `NotesClient.tsx` is a lowercase state variable `previewImage` that feeds into `ImagePreview`.
   - Ripgrep confirms 0 references to `<PreviewImage>`. Therefore, `PreviewImage` is orphaned.
5. **Step 4 (API Routes & Server Components)**:
   - `app/api/posts/slug/[slug]/route.ts` defines `GET`.
   - The corresponding page `app/notes/[slug]/page.tsx` is an async Server Component and directly invokes `getPostBySlug()` and `getTags()` in-process via Notion SDK.
   - Ripgrep confirms 0 calls to `/api/posts/slug/`. Therefore, this route handler is orphaned.
6. **Step 5 (Orphaned Utility Modules)**:
   - `lib/roadmap/markdown.ts` exports markdown parsing utilities (`markdownToSafeHtml`, `markdownToPlainText`).
   - The roadmap UI exclusively uses Lexical editor content or `contentToHtml` from `content-utils.ts`.
   - Ripgrep confirms zero production usages; only `tests/unit/markdown.test.ts` references this file.
   - `lib/ai/generate-json.ts` exports JSON generation helpers (`generateJson`, `generateJsonWithFallback`, `stripCodeFence`).
   - Cris AI exclusively uses streaming text responses in `app/api/chat/route.ts`.
   - Ripgrep confirms zero production usages; only `tests/unit/generate-json.test.ts` references this file.
7. **Step 6 (Prisma Client Logic Flaw)**:
   - `lib/prisma.ts` defines `isCurrentClient(client)` to check for delegate presence on the Prisma singleton.
   - The delegates checked include deleted models (`workflow`, `role`, `projectDocument`).
   - Because `delegates.workflow` is `undefined`, the guard always returns `false`. This causes `createPrismaClient()` to be executed whenever hot reloading re-evaluates `lib/prisma.ts`.
8. **Step 7 (Duplicate Context Providers)**:
   - `app/layout.tsx` wraps all page content in `<ToastProvider>`.
   - `app/notes/layout.tsx` nests another `<ToastProvider>` around notes children.
   - This duplicates the React toast container in the DOM on `/notes`.

---

## 3. Caveats

1. **Test-Only Consumers**: `lib/roadmap/markdown.ts` and `lib/ai/generate-json.ts` have passing unit tests in `tests/unit/`. While they have 0 production callers, removing them would require removing or archiving their test suites.
2. **Public API Surface**: `app/api/posts/slug/[slug]/route.ts` could theoretically be called by external consumers/webhooks, although this repo is a personal blog and no public API documentation advertises it.
3. **Cris AI Scope Freeze**: While Cris AI (`components/floating-bot/**`) is not modified as part of Abot roadmap work, it is actively served on `/portfolio` and must be retained per `AGENTS.md`.
4. **Sections Feature Flag**: `components/roadmap/sectionsEnabled.ts` sets `SECTIONS_ENABLED = false`. Code paths behind this flag (such as `SectionField`, `SectionList`, `EditSectionModal`) are currently dormant in the UI, but they are fully wired into roadmap components and backend APIs (ADR-0009); they are feature-flagged rather than orphaned code.

---

## 4. Conclusion

The audit identifies:
- **4 Dead/Orphaned UI Components**: `HeroSkeleton`, `SkillsSkeleton`, `PreviewImage`, and `Tooltip/TooltipTrigger/TooltipContent`.
- **1 Orphaned Next.js API Route**: `app/api/posts/slug/[slug]/route.ts`.
- **2 Dead Modules (Test-Only, Zero Production Callers)**: `lib/roadmap/markdown.ts` and `lib/ai/generate-json.ts`.
- **4 Dead/Redundant Utility Exports & Helpers**: `formatExactDate` (`lib/roadmap/date-utils.ts`), `sanitizeDangerousHtml` export (`lib/roadmap/content-utils.ts`), `mapTag`/`mapPost` exports (`lib/notion.ts`), and private duplicate `slugify` (`lib/notion.ts`).
- **2 Architectural / Runtime Issues**:
  - `isCurrentClient` in `lib/prisma.ts` contains obsolete checks for non-existent models (`workflow`, `role`), always returning `false`.
  - Duplicate `<ToastProvider>` in `app/notes/layout.tsx` causing double toast container mounting.
- **Floating-Bot Status Verified**: Cris AI components in `components/floating-bot/` are actively mounted on `/portfolio` via `SiteChatbot` and are NOT dead code.

---

## 5. Verification Method

To independently verify all findings, run the following commands from the repository root:

### 1. Verify UI Skeletons are Unused
```bash
# Verify HeroSkeleton has 0 callers outside definition
git grep "HeroSkeleton" -- ':!components/ui/skeleton.tsx'
# Expected: no output (exit code 1)

# Verify SkillsSkeleton has 0 callers outside definition
git grep "SkillsSkeleton" -- ':!components/ui/skeleton.tsx'
# Expected: no output (exit code 1)
```

### 2. Verify Tooltip Primitives are Unused
```bash
git grep -n "TooltipContent"
# Expected: matches only in components/ui/tooltip.tsx:28, 66

git grep -n "TooltipTrigger"
# Expected: matches only in components/ui/tooltip.tsx:24, 66
```

### 3. Verify PreviewImage is Unused
```bash
git grep -n "PreviewImage" -- ':!components/ui/image-preview/*'
# Expected: matches only in README.md, no application code imports
```

### 4. Verify Orphaned Route `app/api/posts/slug/[slug]/route.ts`
```bash
git grep -n "/api/posts/slug"
# Expected: only matches inside app/api/posts/slug/[slug]/route.ts
```

### 5. Verify Dead Modules (Zero Production Callers)
```bash
# markdown.ts
git grep -n "markdownToSafeHtml" -- ':!tests/*'
# Expected: matches only in lib/roadmap/markdown.ts:29

# generate-json.ts
git grep -n "generateJson" -- ':!tests/*' ':!docs/*'
# Expected: matches only in lib/ai/generate-json.ts
```

### 6. Verify Vestigial Prisma Client Checks
Inspect `lib/prisma.ts:31-51` vs `prisma/schema.prisma`. Confirm models `workflow`, `workflowProject`, `role`, `projectDocument` do not exist in the schema.

### 7. Run CI Checks
Confirm the existing test suite and type check remain clean:
```bash
yarn tsc --noEmit -p .
yarn lint
yarn test
```
