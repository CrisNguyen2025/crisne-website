---
task_id: "TASK-roadmap-dissolve-section-001"
branch: "feature/roadmap-dissolve-section"
version: "2.0.0"
priority: "P2" # [P0 | P1 | P2]
status: "COMPLETED" # [READY | IN_PROGRESS | COMPLETED | ESCALATED | ABORTED]
assigned_executor: "antigravity" # [antigravity | codex]
max_attempts: 3
current_attempt: 2

boundaries:
  allowed_to_modify:
    - "app/api/v1/roadmaps/[slug]/sections/route.ts"
    - "logic/roadmap/roadmapService.ts"
    - "hooks/use-roadmap.ts"
    - "components/roadmap/SectionList.tsx"
    # Wiring only: pass onDissolveSection through, same as onRenameSection (approved by Owner)
    - "components/roadmap/MasterPanel.tsx"
    - "app/page.tsx"
    # New file only
    - "tests/route/roadmap-sections-route.test.ts"
  read_only_references:
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "lib/roadmap/duplicates.ts"
    - "lib/roadmap/sections.ts"
    - "lib/roadmap/types.ts"
    - "lib/roadmap/rag-reindex.ts"
    - "lib/auth/write-access.ts"
    - "components/ui/action-menu.tsx"
    - "hooks/use-roadmap-webmcp.ts"
    - "tests/route/write-routes-guard.test.ts"
    - "tests/route/triage-routes.test.ts"
    - "tests/unit/use-roadmap-not-found.test.tsx"
  strictly_forbidden:
    - "prisma/schema.prisma"
    - "prisma/migrations/**"
    - "prisma/dev.db"
    - "auth.ts"
    - "package.json"
    - "yarn.lock"
    - "lib/roadmap/types.ts"
    - "tests/route/write-routes-guard.test.ts"

verification_gate:
  type_check: "yarn tsc --noEmit"
  lint: "yarn lint"
  test: "yarn test tests/route/write-routes-guard.test.ts tests/route/roadmap-sections-route.test.ts"
  boundary_check: "git status --porcelain"
---

# TASK: Dissolve Section (Bỏ mục, chuyển bài về Chung)

## 1. Context & Architectural Intent

- **Goal**: Người dùng bỏ được một section của Topic. Mọi Lesson trong section đó chuyển về nhóm chung (`section: null`). Không Lesson nào bị xoá.
- **Why**: Hiện chỉ có đổi tên section (`PATCH /api/v1/roadmaps/[slug]/sections`). Khi không muốn gom nhóm nữa, người dùng phải sửa từng bài. Theo ADR-0009, section không có bảng riêng, nó tồn tại khi còn Lesson mang tên đó. Vì vậy "bỏ mục" là một thao tác trên mọi Lesson của section, giống "đổi tên mục".
- **Dependencies** (pointer-over-payload):
  - ADR: `docs/adr/0009-topic-holds-lessons-by-section.md` (section là chuỗi tự do, so khớp bằng `normalizeTitle()`).
  - Pattern backend: `app/api/v1/roadmaps/[slug]/sections/route.ts#PATCH`.
  - So khớp tên: `lib/roadmap/duplicates.ts#normalizeTitle`.
  - Reindex RAG: `lib/roadmap/rag-reindex.ts#notifyRoadmapChanged`.
  - Guard ghi: `lib/auth/write-access.ts#requireWriteAccess`.
  - Pattern service: `logic/roadmap/roadmapService.ts#renameSection`, `#deleteRoadmapBySlug` (DELETE không body).
  - Pattern hook: `hooks/use-roadmap.ts#renameSection`.
  - Menu và xác nhận: `components/ui/action-menu.tsx#ActionMenuItem` (trường `confirm`).
  - Wiring UI: `app/page.tsx` → `MasterPanel` (prop `onRenameSection`) → `SectionList` (prop `onRenameSection`).

## 2. Invariants & Rules

- TypeScript strict, cấm `any`, cấm `@ts-ignore`, cấm `eslint-disable`.
- Comment: chỉ một dòng header cho handler DELETE và một dòng JSDoc cho hàm service, cùng kiểu với `PATCH` và `renameSection` ngay bên cạnh. Không thêm comment khác. (Repo rule "match surrounding code" thắng template.)
- **Không bao giờ xoá Lesson**: handler chỉ được gọi `prisma.roadmapItem.updateMany` với `data: { section: null }`. Cấm `delete`, `deleteMany`, cấm đụng `prisma.roadmap`.
- `requireWriteAccess(req)` là dòng đầu tiên của handler, trước mọi truy cập dữ liệu (test guard tự phát hiện route DELETE mới và yêu cầu 401).
- Không tạo DTO mới, không sửa `lib/roadmap/types.ts`. Tham số `section` đi qua query string.
- Naming theo hàm, không theo use-case: `dissolveSection`, `onDissolveSection`, `section`.
- Styling: Tailwind 4 + rem, không hardcode px, không inline style.
- Không thêm dependency. Icon lấy từ `lucide-react` đã có sẵn.
- Không sửa `hooks/use-roadmap-webmcp.ts` (WebMCP tool cho dissolve là ngoài scope).

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1 (API)**: Thêm `export async function DELETE(req: NextRequest, context: RouteContext)` vào `app/api/v1/roadmaps/[slug]/sections/route.ts`.
  - Header comment: `// DELETE /api/v1/roadmaps/[slug]/sections?section=... - Dissolve a section: every lesson in it moves to the topic's general group.`
  - Thứ tự: `requireWriteAccess` → đọc `slug` từ `context.params` → đọc `section` bằng `req.nextUrl.searchParams.get('section')`.
  - `section` rỗng hoặc thiếu (sau `trim()`) → `400 { error: 'section is required' }`.
  - `prisma.roadmap.findUnique({ where: { slug }, include: { items: true } })`; không có → `404 { error: 'Roadmap not found' }`.
  - Lọc `moving` bằng `normalizeTitle(i.section) === normalizeTitle(section)` (giống PATCH). Rỗng → `404 { error: \`No section "${section}" in this topic\` }`.
  - `prisma.roadmapItem.updateMany({ where: { id: { in: moving.map((i) => i.id) } }, data: { section: null } })`.
  - `notifyRoadmapChanged()` rồi trả `200 { success: true, dissolved: moving.length }`.
  - `catch`: `console.error('[API DELETE /api/v1/roadmaps/[slug]/sections] Error:', error)` và `500 { error: 'Failed to dissolve section' }` (cùng kiểu với PATCH).
  - Không sửa handler `PATCH`.
- [x] **Step 2 (Service)**: Thêm vào `logic/roadmap/roadmapService.ts`, ngay sau `renameSection`:
  - `/** Dissolve a section; every lesson in it moves to the topic's general group */`
  - `export async function dissolveSection(slug: string, section: string): Promise<{ dissolved: number }>`
  - Gọi `apiFetch` tới `` `/api/v1/roadmaps/${slug}/sections?section=${encodeURIComponent(section)}` `` với `{ method: 'DELETE' }`.
- [x] **Step 3 (Hook)**: Thêm vào `hooks/use-roadmap.ts`, ngay sau `renameSection`:
  - Comment đánh số theo kiểu hiện có, ví dụ `// 6b. Dissolve a section: its lessons move to the general group`. Không đánh số lại các khối khác.
  - `const dissolveSection = useCallback(async (section: string) => { ... }, [slug, loadRoadmap])`. Thân hàm theo đúng `renameSection`: gọi `roadmapService.dissolveSection(slug, section)`, `topicCache.delete(slug)`, `await loadRoadmap(slug, true)`; `catch` log `'[useRoadmap] Failed to dissolve section:'`, `topicCache.delete(slug)`, `await loadRoadmap(slug)`.
  - Nếu `selectedSection === section` thì `setSelectedSection('all')` sau khi gọi API thành công (section đó không còn, bộ lọc sẽ trống). Thêm `selectedSection` vào deps nếu dùng.
  - Trả `dissolveSection` trong object return, cạnh `renameSection`.
- [x] **Step 4 (UI)**:
  - `components/roadmap/SectionList.tsx`: thêm prop `onDissolveSection: (section: string) => void` vào `SectionListProps` và destructuring. Trong nhánh `section !== null` của `items` của `ActionMenu`, thêm sau "Đổi tên mục":
    - `label: 'Bỏ mục (về Chung)'`, icon `Ungroup` từ `lucide-react` (đã có trong bản đang cài), `onSelect: () => onDissolveSection(section)`.
    - `confirm: { title: \`Bỏ mục "${section}"?\`, description: \`${items.length} bài chuyển về Chung. Bài học không bị xoá.\`, confirmLabel: 'Bỏ mục' }`.
    - Không đặt `danger` (thao tác không xoá dữ liệu).
    - Hiển thị theo `canWrite` giống "Đổi tên mục" (không chặn thêm theo `isLocked`, vì đổi tên cũng không chặn).
  - `components/roadmap/MasterPanel.tsx`: thêm `onDissolveSection: (section: string) => void` vào `MasterPanelProps`, destructuring, và truyền `onDissolveSection={onDissolveSection}` vào `<SectionList>`. Không đổi gì khác.
  - `app/page.tsx`: lấy `dissolveSection` từ `useRoadmap(...)` và truyền `onDissolveSection={dissolveSection}` vào `<MasterPanel>`. Không đổi gì khác.
- [x] **Step 5 (Tests)**: Tạo `tests/route/roadmap-sections-route.test.ts` (vitest). Mock `@/lib/auth/write-access` (`requireWriteAccess` trả `null`), `@/lib/prisma` (dùng `vi.hoisted` + `vi.mock` như `prismaMock` trong `tests/route/triage-routes.test.ts`), và `@/lib/roadmap/rag-reindex` (`notifyRoadmapChanged: vi.fn()`). Các case cho `DELETE`:
  - Thiếu `section` hoặc `section=%20` → 400, không gọi prisma.
  - Slug không tồn tại → 404.
  - Không có bài nào khớp → 404, không gọi `updateMany`.
  - Khớp không phân biệt hoa thường và khoảng trắng (`" react  hooks "` khớp `"React Hooks"`); `updateMany` nhận đúng id của các bài khớp và `data: { section: null }`; bài ở section khác và bài `section: null` không nằm trong `where`.
  - Không bao giờ gọi `roadmapItem.delete` hay `roadmapItem.deleteMany`.
  - Thành công → 200 `{ success: true, dissolved: n }` và `notifyRoadmapChanged` được gọi đúng một lần.
  - Không sửa `tests/route/write-routes-guard.test.ts`; nó phải tự thấy `DELETE /api/v1/roadmaps/[slug]/sections → 401`.

## 4. Verification Gate Results

- [x] `TypeCheck` (`yarn tsc --noEmit`): PASSED
- [x] `Lint`: PASSED (0 errors, 0 warnings on modified files)
- [x] `Test` (output has `DELETE /api/v1/roadmaps/[slug]/sections → 401`): PASSED (51/51 tests pass)
- [x] `Boundary Check` (all modified files within `allowed_to_modify`): PASSED

## 5. Execution Audit Log

- **Git Commit Hash**: `21e2499` (feature/roadmap-dissolve-section)
- **Modified Files**:
  - `app/api/v1/roadmaps/[slug]/sections/route.ts`
  - `logic/roadmap/roadmapService.ts`
  - `hooks/use-roadmap.ts`
  - `components/roadmap/SectionList.tsx`
  - `components/roadmap/MasterPanel.tsx`
  - `app/page.tsx`
  - `tests/route/roadmap-sections-route.test.ts` (New file)

## 6. Out of Scope (không làm trong task này)

- WebMCP tool `dissolve_section` trong `hooks/use-roadmap-webmcp.ts` và tool tương ứng của Roadmap Assistant (Python).
- Cập nhật `GLOSSARY.md` hay ADR mới. Thao tác nằm trong quyết định "thao tác trên mọi Lesson của section" của ADR-0009.
- Undo sau khi bỏ mục.
