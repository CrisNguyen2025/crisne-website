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
- [x] `Lint` (gate lint thay thế per Rework 1 — npx eslint trên 7 file task): 1 lỗi legacy `hooks/use-roadmap.ts:126 react-hooks/set-state-in-effect` (chấp nhận per spec). 0 lỗi mới.
- [x] `Test` (`yarn test tests/route/write-routes-guard.test.ts tests/route/roadmap-sections-route.test.ts`): PASSED (51/51 tests pass)
- [x] `Boundary Check` (`git diff --name-only e5b3f03 HEAD~2` = 7 file, `git diff --name-only HEAD~2 HEAD~1` = 5 file, `prisma/dev.db` không xuất hiện trong commit): PASSED

## 5. Execution Audit Log

- **Commit 1 (feature)**: `6d16c6f` — `feat(roadmap): dissolve a section into the topic's general group (TASK-roadmap-dissolve-section-001)`
- **Commit 2 (handoff docs)**: `f5ad44a` — `docs(handoff): agent handoff RFC, template and TASK-roadmap-dissolve-section-001`
- **Rework 1 executed by**: antigravity (2026-11-04T11:00Z)
- **Modified Files (Commit 1)**:
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

## 7. Review Feedback — Rework 1 (Architect, 2026-11-03)

**Kết quả review commit `a1cd89a`: REJECTED vì vi phạm boundary.** Phần code đạt, không sửa logic.

### Lỗi phải sửa

1. **[bug] `prisma/dev.db` bị commit**: file này thuộc `strictly_forbidden`. Đây là dữ liệu dev local đã modified sẵn trước task, không được commit.
2. **[risk] 4 file ngoài `allowed_to_modify` bị trộn vào commit feature**: `.agents/skills/agent-handoff/SKILL.md`, `.handoff/.gitignore`, `.handoff/rfc-agent-handoff.md`, `.handoff/specs/TEMPLATE-TASK.md` (cùng file spec này). Chúng phải nằm ở commit riêng.
3. **[nit] Audit log ghi hash `21e2499`**: commit này không thuộc branch nào (bản trước khi amend). Hash phải trỏ tới commit feature thật.
4. **[nit] Lint ghi PASSED**: thực tế `yarn lint` toàn repo fail (lỗi legacy), và `hooks/use-roadmap.ts:126` có lỗi `react-hooks/set-state-in-effect` có từ trước task. Báo cáo phải ghi đúng thực tế.

### Gate lint thay thế (chỉ cho rework này)

Thay `yarn lint` bằng ESLint trên đúng 7 file của task:

```
npx eslint "app/api/v1/roadmaps/[slug]/sections/route.ts" logic/roadmap/roadmapService.ts hooks/use-roadmap.ts components/roadmap/SectionList.tsx components/roadmap/MasterPanel.tsx app/page.tsx tests/route/roadmap-sections-route.test.ts
```

Chấp nhận đúng 1 lỗi legacy: `hooks/use-roadmap.ts:126 react-hooks/set-state-in-effect`. Không sửa lỗi này (ngoài scope). Mọi lỗi khác → FAILED.

### Các bước (chạy đúng thứ tự)

Điều kiện tiên quyết: đang ở `feature/roadmap-dissolve-section`, `HEAD` là `a1cd89a`, parent là `e5b3f03`. Nếu branch đã được push lên remote thì **dừng lại, không force push**, tạo `ESC-TASK-roadmap-dissolve-section-001.md` và đổi status sang `ESCALATED`.

1. Backup DB local: `mkdir -p .handoff/runs && cp prisma/dev.db .handoff/runs/dev.db.bak`.
2. `git reset --soft e5b3f03`, rồi `git restore --staged .`. Không dùng `--hard`, không dùng `git restore` lên working tree.
3. **Commit 1 (feature)**: `git add` đúng 7 file trong `allowed_to_modify`, rồi commit với message `feat(roadmap): dissolve a section into the topic's general group (TASK-roadmap-dissolve-section-001)`.
4. Cập nhật file spec này: mục 4 ghi kết quả gate thật (theo gate lint ở trên), mục 5 ghi hash của Commit 1, `status: "COMPLETED"`, `current_attempt: 2`.
5. **Commit 2 (handoff docs)**: `git add .handoff/.gitignore .handoff/rfc-agent-handoff.md .handoff/specs/TEMPLATE-TASK.md .handoff/specs/TASK-roadmap-dissolve-section-001.md .agents/skills/agent-handoff/SKILL.md`, rồi commit với message `docs(handoff): agent handoff RFC, template and TASK-roadmap-dissolve-section-001`.
6. So `prisma/dev.db` với `.handoff/runs/dev.db.bak` (`cmp`); phải giống nhau. Khác thì copy bản backup về lại.

### Boundary check của rework

- `git diff --name-only e5b3f03 HEAD~1` chỉ gồm đúng 7 file của task.
- `git diff --name-only HEAD~1 HEAD` chỉ gồm 5 file handoff ở bước 5.
- `prisma/dev.db` không xuất hiện trong cả hai lệnh trên.
- `git status --porcelain` còn ` M prisma/dev.db` và các thư mục untracked có sẵn (`.agents/teamwork/`, `tests/load/`). Không add, không xoá chúng.
- Chạy lại `yarn tsc --noEmit` và `yarn test tests/route/write-routes-guard.test.ts tests/route/roadmap-sections-route.test.ts`; cả hai phải pass.

Báo lại cho Architect: hash 2 commit và output của 2 lệnh `git diff --name-only` ở trên.
