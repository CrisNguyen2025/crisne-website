---
task_id: "TASK-docs-typography-001"
branch: "feat/typography-docs"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "hooks/use-typography.ts"
    - "components/design-menu.tsx"
    - "app/styles/docs-typography.css"
    - "app/styles/globals.css"
    - "docs/design-system.md"
    - "tests/unit/typography-setting.test.tsx"
    - "tests/manual/design-theme.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - ".handoff/doctor/baseline.json"
  continues_dirty: []
  read_only_references:
    - "hooks/use-design.ts"
    - "app/styles/roadmap-theme.css"
    - "app/styles/apple-theme.css"
    - "app/styles/posthog-theme.css"
    - "app/styles/railway-theme.css"
    - "tests/unit/design-theme.test.tsx"
    - "components/ui/action-menu.tsx"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "app/layout.tsx"
    - "hooks/use-design.ts"
    - "app/styles/roadmap-theme.css"
    - "app/styles/*-theme.css"

deploy_steps: []

fast_gate: ["type_check", "unit_typography", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  unit_typography: "yarn vitest run tests/unit/typography-setting.test.tsx tests/unit/design-theme.test.tsx"
  lint: "yarn lint"
  test: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-docs-typography-001"
---

# TASK: Thêm bản typography "Docs gọn" cho roadmap/news (trục riêng, phối được với mọi theme màu)

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-27 trên `feat/typography-docs`; đã rebase lên `main` (`e6b94f9`, 2026-11-28) và mở rộng selector H1 sang `:is(h1.font-display, article h1:not(.font-mono))` để phủ H1 `font-sans` mới của Lesson/News. Bản dở cũ của agy ở `../crisne-website-wt-docs-typography` (`feat/docs-typography`), không dùng.

## 1. Context & Architectural Intent

- **Goal**: Menu "Tùy chọn" (…) ở roadmap/news có thêm trục chữ, độc lập với theme màu: `Chữ: Mặc định` (giữ nguyên như hiện tại) và `Chữ: Docs gọn` (kiểu Mintlify / Discord docs). Chọn "Docs gọn" thì gắn `data-typography="docs"` lên `<html>`, lưu localStorage key `typography`; phối được với bất kỳ `data-design` nào.
- **Why**: User muốn một phiên bản font/size gọn, sạch kiểu docs (Discord docs, Mintlify), không đổi màu. Dev đã chốt: trục riêng, phong cách "Docs gọn".
- **Nhánh gốc**: `main` tại `7f40088` (có đủ 11 theme màu).
- **Dependencies**:
  - Mẫu store: `hooks/use-design.ts` (`useSyncExternalStore`, localStorage, dataset trên `<html>`, sự kiện `storage`). Hook mới làm y hệt, chỉ khác tên/khóa/thuộc tính.
  - Menu: `components/design-menu.tsx` dùng `ActionMenu` (`components/ui/action-menu.tsx`, list phẳng).
  - Token chữ hiện tại: `app/styles/roadmap-theme.css` (`.editorial-prose` 1.0625rem/1.75, h2 Fraunces `--font-display` 500 1.625rem, h3 1.1875rem, h4 1.0625rem, code 0.875rem).
  - Theme ghi đè chữ cùng độ ưu tiên selector: `apple-theme.css` (prose, `:is(p, li)`, h2, `.font-display`), `posthog-theme.css` (prose, h2, h3, h4, `.font-display`), `railway-theme.css` (`--font-display`, prose, `.font-display`).
  - `.font-display` dùng ở `PublicationHome.tsx:155`, `TopicEditorialPage.tsx:478/547/591`, `LessonEditorialReader.tsx:716`, `NewsFeedClient.tsx:316`, `NewsReaderPanel.tsx:163`, `NewsCard.tsx:132`, `RoadmapFormPrimitives.tsx:8` (chỉ đọc, không sửa).
  - Không đụng flow Abot nào.

## 2. Invariants & Rules

- Rule dự án: `AGENTS.md`. Theo `docs/design-system.md` mục "Theme roadmap và news".
- Trục chữ **không** đổi màu, không đổi layout/spacing của khung (chỉ margin của heading trong prose nếu cần cho nhịp chữ).
- Không sửa `hooks/use-design.ts`, các file `*-theme.css`, `app/layout.tsx`. Không thêm font mới (không `next/font` mới, không tải Google Fonts): "Docs gọn" dùng `var(--font-sans)` của theme đang chọn (Inter ở mặc định, system font ở Apple/PostHog).
- `docs-typography.css` phải `@import` **sau cùng** trong `app/styles/globals.css` (sau `posthog-theme.css`) để thắng các rule theme cùng specificity. Mọi selector bắt đầu bằng `html[data-typography="docs"] .roadmap-theme`.
- "Mặc định" = không có thuộc tính `data-typography` (giống `data-design`).
- Không `any`, không `console.log`. Không có giá trị hex trong tsx.
- Ngoài phạm vi: `/portfolio`, Abot widget, Cris AI, nháy theme lúc tải lần đầu (hạn chế đã biết giống `data-design`), gom `use-design` và `use-typography` thành một factory.

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1**: Tạo `hooks/use-typography.ts`, sao cấu trúc `hooks/use-design.ts`:
  - `export type Typography = "default" | "docs";` · `export const TYPOGRAPHIES: readonly Typography[] = ["default", "docs"];`
  - `STORAGE_KEY = "typography"`, mặc định `"default"`. `default` thì `delete root.dataset.typography`, ngược lại `root.dataset.typography = value`.
  - Export `setTypography(value)` và `useTypography()`; server snapshot trả `"default"`; nghe sự kiện `storage` đúng key.
  - JSDoc một dòng: trục chữ của roadmap/news, tách khỏi theme màu (`use-design`) và light/dark.
- [x] **Step 2**: `components/design-menu.tsx`: sau các mục theme, thêm 2 mục `Chữ: Mặc định` và `Chữ: Docs gọn`, icon `CircleCheck` cho mục đang chọn của trục chữ, `Circle` cho mục còn lại (độc lập với trục theme), `onSelect` gọi `setTypography`. Giữ nguyên label nút `Tùy chọn`, giữ nguyên toàn bộ mục theme và thứ tự của chúng. Cập nhật JSDoc của component (đổi theme và cỡ chữ).
- [x] **Step 3**: Tạo `app/styles/docs-typography.css` (comment đầu file: nguồn cảm hứng Mintlify/Discord docs, chọn từ DesignMenu, `hooks/use-typography.ts` gắn `html[data-typography="docs"]`, phối với mọi `data-design`). Nội dung, tất cả dưới tiền tố `html[data-typography="docs"] .roadmap-theme`:
  - Trên chính `.roadmap-theme`: `--font-display: var(--font-sans);`
  - `.font-display`: `font-family: var(--font-sans); font-weight: 600; letter-spacing: -0.025em;`
  - `h1.font-display`: `font-size: 1.75rem; line-height: 1.25;` và trong `@media (min-width: 40rem)`: `font-size: 1.875rem;`
  - `.editorial-prose`: `font-family: var(--font-sans); font-size: 1rem; line-height: 1.75; letter-spacing: normal;`
  - `.editorial-prose :is(p, li)`: `line-height: 1.75;`
  - `.editorial-prose h2`: `font-family: var(--font-sans); font-weight: 600; font-size: 1.5rem; line-height: 1.33; letter-spacing: -0.02em;`
  - `.editorial-prose h3`: `font-weight: 600; font-size: 1.25rem; line-height: 1.4; letter-spacing: -0.015em;`
  - `.editorial-prose h4`: `font-weight: 600; font-size: 1rem; line-height: 1.5; letter-spacing: normal;`
  - `.editorial-prose :is(pre, code.block)`: `font-size: 0.875rem; line-height: 1.7;`
  - `.editorial-prose table`: `font-size: 0.875rem;`
  - Không viết màu, không `!important` (trừ khi selector của theme có `!important` cho cùng thuộc tính; nếu có thì ghi comment lý do).
- [x] **Step 4**: `app/styles/globals.css`: thêm `@import "./docs-typography.css";` ngay sau dòng `@import "./posthog-theme.css";`.
- [x] **Step 5**: Tạo `tests/unit/typography-setting.test.tsx` (jsdom, theo khuôn `tests/unit/design-theme.test.tsx`):
  - Mặc định `default`, không có `data-typography`.
  - `setTypography("docs")` gắn `data-typography="docs"`, localStorage `typography=docs`; về `default` thì bỏ thuộc tính.
  - Trục độc lập: `setDesign("discord")` rồi `setTypography("docs")` → cả `data-design="discord"` và `data-typography="docs"` cùng có; đổi theme không xóa `data-typography`.
  - `DesignMenu`: mở "Tùy chọn", thấy menuitem `Chữ: Mặc định` và `Chữ: Docs gọn`; bấm `Chữ: Docs gọn` thì `data-typography="docs"`.
  - Dọn `localStorage`, `dataset.design`, `dataset.typography` ở `beforeEach`/`afterEach`.
- [x] **Step 6**: `docs/design-system.md` mục "Theme roadmap và news": thêm đoạn "Trục chữ" (key `typography`, thuộc tính `data-typography`, file `app/styles/docs-typography.css`, import sau cùng, dùng `--font-sans` của theme, bảng thang: body 16/28, H1 28→30, H2 24/600, H3 20/600, H4 16/600, code 14).
- [x] **Step 7**: `tests/manual/design-theme.md`: cập nhật dòng Phạm vi (thêm `hooks/use-typography.ts`, `app/styles/docs-typography.css`) và thêm case vào bảng (không ghi kết quả chạy, Claude chạy):
  - T9: Chọn "Chữ: Docs gọn" ở theme Figma → `data-typography="docs"`; prose 16px/28px; h2 Inter 600 24px; tiêu đề lesson h1 Inter 600, 30px ở desktop; màu không đổi.
  - T10: Giữ "Docs gọn", đổi sang Apple, PostHog, Railway → vẫn thang docs (prose 16px/28px, h2 24px/600, heading không còn serif ở Railway); màu theo theme.
  - T11: Chọn "Chữ: Mặc định" → bỏ `data-typography`, về prose 17px/1.75, h2 Fraunces 500 26px.
- [x] **Step 8**: `yarn intel status`; nếu báo lệch map thì cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json` theo hướng dẫn của lệnh. `yarn doctor --since HEAD --check`; chỉ cập nhật `.handoff/doctor/baseline.json` nếu finding mới là do file mới và đã được sửa.

## 4. Verification Gate Results
- [x] `TypeCheck`: PASSED
- [x] `Unit Typography`: PASSED (7/7, gồm `design-theme.test.tsx`)
- [x] `Lint`: PASSED cho file của task (`eslint` 3 file ts/tsx). `yarn lint` toàn repo fail 44 lỗi, y hệt trên `main` sạch tại `7f40088` cùng môi trường worktree (`tests/e2e/**`, `tests/load/**`, `next.config.ts`)
- [x] `Test`: không có fail mới. `yarn test` 81 fail / 15 file, cùng tập file fail với `main` sạch tại `7f40088` (Prisma `dev.db` local: thread, news-ingest, preflight thiếu venv); file mới +4 test pass
- [x] `Intel Status`: PASSED (310 ref map + 81 ref docs khớp)
- [x] `Doctor Delta`: PASSED (không finding bug/risk mới)
- [x] `Boundary Check`: không chạy script (không có Executor); file đổi đều nằm trong `allowed_to_modify`

## 5. Execution Audit Log
- **Executor**: Claude (Dev chuyển từ Antigravity giữa chừng). Không commit.
- **Modified Files**:
  - `hooks/use-typography.ts` (mới)
  - `components/design-menu.tsx`
  - `app/styles/docs-typography.css` (mới)
  - `app/styles/globals.css`
  - `docs/design-system.md`
  - `tests/unit/typography-setting.test.tsx` (mới)
  - `tests/manual/design-theme.md` (case T9–T11 và kết quả chạy)
- **Bài học**:
  - Turbopack từ chối `node_modules` symlink trong worktree; preview worktree chạy `next dev --webpack`.
  - Default prose `p` thực tế 16px/28px (không phải 17px của `.editorial-prose`), nên kỳ vọng manual đo trên `p`.
