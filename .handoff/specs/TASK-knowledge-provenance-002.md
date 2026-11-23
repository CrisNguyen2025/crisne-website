---
task_id: "TASK-knowledge-provenance-002"
branch: "feat/knowledge-provenance"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude" # Dev giao Claude làm hết Phase 1 (2026-11-23)
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "components/ui/editor/nodes/ProvenanceNode.tsx"
    - "components/ui/editor/Editor.tsx" # chỉ thêm ProvenanceNode vào danh sách nodes
    - "components/roadmap/LessonEditorialReader.tsx"
    - "components/roadmap/ProvenanceChip.tsx"
    - "components/roadmap/LessonSources.tsx"
    - "components/roadmap/useLessonProvenance.ts"
    - "logic/roadmap/roadmapService.ts" # chỉ thêm hàm fetchLessonProvenance
    - "tests/unit/provenance-node.test.ts"
    - "tests/unit/lesson-provenance-ui.test.tsx"
    - "tests/unit/roadmap-lecture-layout.test.tsx" # chỉ thêm fetchLessonProvenance vào mock của roadmapService
    - "tests/unit/slug-and-section-combobox.test.tsx" # như trên
  continues_dirty: [] # Claude kiểm lại ngay trước baseline: file của spec 001 không trùng allowed_to_modify ở đây
  read_only_references:
    - ".handoff/PLAN-knowledge-acquisition.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "lib/provenance/**" # do spec 001 tạo: markers.ts, dto.ts
    - "app/api/v1/roadmaps/items/*/provenance/route.ts"
    - "components/roadmap/useTopicOwnerStatuses.ts"
    - "lib/roadmap/owner-status-cache.ts"
    - "components/ui/editor/nodes/ImageNode.tsx"
    - "components/ui/editor/nodes/MentionNode.ts"
    - "components/ui/tooltip.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/CitationChip.tsx"
    - "lib/roadmap/content-utils.ts"
    - "lib/roadmap/date-utils.ts"
    - "tests/unit/editor-content-sync.test.ts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "middleware.ts"
    - "prisma/**"
    - "lib/roadmap/queries.ts"
    - 'app/\[topicSlug\]/**' # ngoặc vuông phải escape cho glob của bash
    - "app/api/**"
    - "lib/provenance/**"
    - "roadmap-rag-assistant/**"
    - "components/news/**"

deploy_steps: []

fast_gate: ["type_check", "provenance_ui_tests", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  provenance_ui_tests: "yarn vitest run tests/unit/provenance-node.test.ts tests/unit/lesson-provenance-ui.test.tsx tests/unit/editor-content-sync.test.ts tests/unit/roadmap-lecture-layout.test.tsx tests/unit/slug-and-section-combobox.test.tsx tests/route/topic-scoped-urls.test.ts"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-knowledge-provenance-002"
---

# TASK: Provenance trên trang Lesson — ProvenanceNode cho editor, chip nguồn và mục "Nguồn tham khảo của bài"

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-23 (Claude làm, Dev giao). Gate pass; `yarn test` toàn bộ chạy chung ở cuối Phase 1. Chưa kiểm trong trình duyệt. Chưa commit.

## 1. Context & Architectural Intent
- **Goal**: Owner mở một Lesson thấy chip nguồn ở cuối mỗi câu có marker provenance, bấm vào xem nguồn; những nguồn đã mất marker hiện ở mục "Nguồn tham khảo của bài". Owner sửa bài bằng editor không làm mất marker.
- **Why**: Phase 1 của `.handoff/PLAN-knowledge-acquisition.md` (Mục 5, bước 4). Theo ADR-0017, provenance chỉ nạp phía client cho Owner; Lexical đang bỏ mọi span lạ khi lưu (BLOCKER 3 ở Mục 9 của plan).
- **Dependencies**:
  - API của spec 001: `GET /api/v1/roadmaps/items/[id]/provenance` → `{ provenances, orphans }`, DTO ở `lib/provenance/dto.ts`, marker dạng `<span data-provenance-ref="<uuid>"></span>` (`lib/provenance/markers.ts`).
  - `components/roadmap/LessonEditorialReader.tsx`: đã có `canWrite` (`useCanWrite`) và render nội dung bằng `dangerouslySetInnerHTML` (`rendered.html`). Callers: `app/[topicSlug]/[lessonSlug]/page.tsx`, test `roadmap-lecture-layout`, `slug-and-section-combobox`, `topic-scoped-urls`.
  - Pattern nạp dữ liệu Owner phía client: `components/roadmap/useTopicOwnerStatuses.ts` + cache module trong `lib/roadmap/owner-status-cache.ts`.
  - Pattern `DecoratorNode`: `components/ui/editor/nodes/ImageNode.tsx`. `MentionNode` (`TextNode`) chỉ nhận span có `data-lexical-mention`, priority 1.
  - Editor dùng ở `components/roadmap/EditItemContentDrawer.tsx` (Lesson) và `app/notes/NotesClient.tsx` (Note); đăng ký node không đổi hành vi với nội dung không có marker.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. ADR: ADR-0017, ADR-0018.
- **Bất biến 2:** `ProvenanceNode` là `DecoratorNode`, inline, `getTextContent()` trả chuỗi rỗng. `exportDOM` ra đúng `<span data-provenance-ref="<key>"></span>`, không text, không thuộc tính khác. `importDOM` nhận `span[data-provenance-ref]` với priority cao hơn `MentionNode` (ví dụ 2).
- **Bất biến 3:** Chỉ gọi API provenance khi `canWrite === true`. Không fetch trong Server Component, không đổi `getLessonPageData` hay props mà trang truyền vào. Cache chỉ trong bộ nhớ module, không `localStorage`/`sessionStorage`.
- Visitor (hoặc `canWrite === false`) thấy HTML y như trước: không chip, không mục nguồn, không request tới API provenance.
- Không thêm dependency. Popover dùng `@base-ui/react` đã có (xem `components/ui/tooltip.tsx`) hoặc state React đơn giản. Không sửa SDK `roadmap-chat-sdk`; component chip viết riêng trong app (plan Mục 5 Phase 1, bước 4).
- Giá trị optional khi hiển thị phải qua hàm format: ngày giờ dùng `formatFriendlyTime` (`lib/roadmap/date-utils.ts`, đã xử lý giá trị rỗng); `extractedAt` có thể `null`.
- Ngoài phạm vi: API và schema (spec 001), luồng `/feed-ingestion` (spec 003), block `Related Lessons` (Phase 3), Abot.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — `ProvenanceNode`** (`components/ui/editor/nodes/ProvenanceNode.tsx`): `DecoratorNode` theo Bất biến 2, kèm `$createProvenanceNode`, `$isProvenanceNode`, `importJSON`/`exportJSON`. `decorate()` trong editor hiện một dấu nhỏ không chọn được (Owner biết câu có nguồn), không phải text.
- [x] **Step 2 — Đăng ký node** (`components/ui/editor/Editor.tsx`): thêm `ProvenanceNode` vào `nodes`. Không đổi gì khác.
- [x] **Step 3 — Test round-trip** (`tests/unit/provenance-node.test.ts`, theo cách dựng editor trong `tests/unit/editor-content-sync.test.ts`): HTML có marker → `$generateNodesFromDOM` → `$generateHtmlFromNodes` vẫn giữ đúng marker và key; marker nằm giữa đoạn văn không làm mất text xung quanh; span `data-lexical-mention` vẫn thành `MentionNode`; `plainTextExcerpt`/`contentStats` của HTML xuất ra không có text thừa.
- [x] **Step 4 — Service + hook**: thêm `fetchLessonProvenance(lessonId)` vào `logic/roadmap/roadmapService.ts`. Tạo `components/roadmap/useLessonProvenance.ts(lessonId, canWrite)`: không làm gì khi `!canWrite`; lỗi mạng thì im lặng như `useTopicOwnerStatuses`; nạp lại khi có event `roadmap:updated`.
- [x] **Step 5 — Chip** (`components/roadmap/ProvenanceChip.tsx`): nút nhỏ, đánh số theo thứ tự xuất hiện, bấm mở popover gồm 6 trường: tên nguồn + link (`target="_blank" rel="noopener noreferrer"`), tiêu đề gốc, `excerpt`, `collectedAt`, `extractedAt`, `authorType` (hiển thị nhãn tiếng Việt). Có `aria-label`.
- [x] **Step 6 — Gắn chip vào nội dung** (`components/roadmap/LessonEditorialReader.tsx`): khi `canWrite` và đã có dữ liệu, tìm các `[data-provenance-ref]` trong vùng nội dung và render `ProvenanceChip` vào đúng span bằng `createPortal`. Key không có trong `provenances` thì không render gì. Bảo đảm portal không làm React ghi đè lại `innerHTML`, và chip biến mất/ cập nhật đúng khi nội dung đổi (sau khi Owner lưu bài).
- [x] **Step 7 — Mục "Nguồn tham khảo của bài"** (`components/roadmap/LessonSources.tsx`): hiện dưới nội dung khi `canWrite` và `orphans.length > 0`; mỗi dòng gồm tên nguồn + link, tiêu đề, `excerpt` rút gọn. Không hiện gì khi không có orphan.
- [x] **Step 8 — Test UI** (`tests/unit/lesson-provenance-ui.test.tsx`): `canWrite=false` → không fetch, không chip, HTML giữ nguyên; `canWrite=true` → số chip bằng số marker có trong `provenances`, popover hiện đủ 6 trường, `extractedAt: null` hiển thị qua hàm format; orphan hiện trong mục nguồn; API lỗi thì trang vẫn hiển thị bình thường. Các test sẵn có trong `provenance_ui_tests` phải pass mà không sửa.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED cho mọi file của spec (`--quiet`). `yarn lint` toàn repo vẫn lỗi ở file ngoài diff, xem spec 001 mục 4. Cảnh báo `InitialToolbarState` không dùng trong `Editor.tsx` là có từ trước.
- [x] `Provenance UI Tests`: PASSED (6 file, 51 test)
- [x] `Test`: xem kết quả chung ở spec 003 mục 4
- [x] `Intel Status`: PASSED
- [x] `Boundary Check`: PASSED (0 vi phạm)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-knowledge-provenance-002/result.json`
- **Modified Files**:
  - `components/ui/editor/nodes/ProvenanceNode.tsx` (mới), `components/ui/editor/Editor.tsx` (thêm node)
  - `components/roadmap/ProvenanceChip.tsx` (mới; gồm `ProvenanceChips` gắn chip qua portal), `components/roadmap/LessonSources.tsx` (mới), `components/roadmap/useLessonProvenance.ts` (mới), `components/roadmap/LessonEditorialReader.tsx`
  - `logic/roadmap/roadmapService.ts` (thêm `fetchLessonProvenance`)
  - `tests/unit/provenance-node.test.ts`, `tests/unit/lesson-provenance-ui.test.tsx` (mới); `tests/unit/roadmap-lecture-layout.test.tsx`, `tests/unit/slug-and-section-combobox.test.tsx` (thêm `fetchLessonProvenance` vào mock)
- **Bài học**:
  - Test mock nguyên module `roadmapService`: thêm hàm mới vào service thì phải thêm vào mọi mock của module đó, nên spec phải cho phép sửa các test này.
  - Gắn UI vào HTML từ `dangerouslySetInnerHTML`: theo dõi span bằng `useSyncExternalStore` + `MutationObserver` (rule `react-hooks/set-state-in-effect` chặn quét DOM rồi `setState` trong effect).
