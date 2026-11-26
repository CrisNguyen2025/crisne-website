---
task_id: "TASK-visual-hierarchy-004"
branch: "feat/visual-hierarchy-004"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "DRAFT" # Chờ Owner chốt mục 0, tách nhánh từ `main` và chạy baseline.sh trước khi đổi sang READY
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "app/page.tsx"
    - "app/login/page.tsx"
    - "app/styles/roadmap-theme.css"
    - "app/styles/globals.css"
    - "lib/auth/write-access.ts"
    - "lib/roadmap/queries.ts"
    - "components/roadmap/PublicationHome.tsx"
    - "tests/unit/roadmap-lecture-layout.test.tsx"
    - "tests/route/lesson-status-visibility.test.ts"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/design-system.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "docs/adr/0019-owner-only-site-no-public-news.md"
    - "components/ui/button.tsx"
    - "components/theme-toggle.tsx"
    - "lib/roadmap/status.ts"
    - "lib/roadmap/types.ts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "app/portfolio/**"
    - "components/floating-bot/**"
    - "components/roadmap/TopicEditorialPage.tsx" # Thuộc TASK-visual-hierarchy-001
    - "components/roadmap/LectureShell.tsx"
    - "components/roadmap/LessonEditorialReader.tsx"
    - "components/news/**"
    - "roadmap-rag-assistant/**"
    - "prisma/**"

deploy_steps: []

fast_gate: ["type_check", "home_test", "global_tokens_untouched", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint app/page.tsx app/login/page.tsx lib/auth/write-access.ts lib/roadmap/queries.ts components/roadmap/PublicationHome.tsx tests/unit/roadmap-lecture-layout.test.tsx tests/route/lesson-status-visibility.test.ts"
  home_test: "yarn test tests/unit/roadmap-lecture-layout.test.tsx tests/route/lesson-status-visibility.test.ts"
  test: "yarn test"
  global_tokens_untouched: "git diff -U0 app/styles/globals.css | grep '^-[^-]' && exit 1 || exit 0"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-visual-hierarchy-004"
---

# TASK: Visual Hierarchy cho PublicationHome, /login & Đồng bộ Token `.roadmap-theme`

> **Trạng thái hiện tại**: DRAFT — đã chốt toàn bộ mục `0.` theo `Option (A)` (2026-11-26); chờ tách nhánh/worktree `feat/visual-hierarchy-004` từ `main` (sau `001` hoặc xử lý conflict `roadmap-lecture-layout.test.tsx`) và chạy `baseline.sh` để chuyển `READY`.

## 0. Quyết định đã chốt của Owner (2026-11-26)

| # | Câu hỏi | Quyết định đã chốt |
|---|---|---|
| Q1 | Màu nút hành động chính (`--primary`) trong `.roadmap-theme` (`app/styles/roadmap-theme.css:13`) | **Option (A):** Giữ `--primary` đen mực `#1a1a1a` (editorial ink) trên các nút nền đặc để tương phản 15:1 với nền trắng ngà, kết hợp bỏ tô `--editorial-accent` hàng loạt trên các danh sách text (làm ở `001`), giúp nút CTA đen và accent Terracotta phân vai rõ: Ink cho button chính, Terracotta cho active state / focus ring / hover. |
| Q2 | Hiển thị `ThemeToggle` trong Workspace (`PublicationHome`, `LectureShell`, `NewsFeedHeader`) | **Option (A):** Gắn `ThemeToggle` gọn ở header `PublicationHome` (tôn trọng lựa chọn Light/Dark xuyên site cùng với Abot dark override ở `002`), đồng thời cập nhật assertion header trong `tests/unit/roadmap-lecture-layout.test.tsx` nếu cần. |

## 1. Context & Architectural Intent
- **Goal**: Làm Topic Cards trên `PublicationHome` phản ánh đúng tiến độ học của Owner (`learning` / `target`) mà vẫn giữ rào chắn `ADR-0010` cho Visitor, cân chỉnh độ rộng phần `Mới cập nhật` với lưới Topic `max-w-5xl`, đưa trang `/login` vào ngôn ngữ `.roadmap-theme`, và bổ sung thang token typography dùng chung nếu cần để dọn dần `DS-ARBITRARY-VALUE`.
- **Why**:
  - `PublicationHome.tsx` (L198–L226): mọi Topic Card chỉ có `lessonCount` và `sectionNames.length`, thiếu tín hiệu cho biết Topic nào đang có bài `đang học` / `mục tiêu`; `Mới cập nhật` (L232) dùng `max-w-3xl` lệch 1/3 cột so với `max-w-5xl` của header & grid Topic.
  - `app/login/page.tsx` (L49–L96): đang dùng bảng màu cool slate của `:root` thay vì `.roadmap-theme` ấm áp của Workspace.
  - Nhiều file trong `components/roadmap/**` và `components/news/**` phải tự viết `text-[0.6875rem]` / `text-[0.8125rem]` vì `@theme inline` của `app/styles/globals.css` chưa khai báo biến cỡ chữ trung gian (hoặc cần chuẩn hóa về `text-xs` / `text-sm`).
- **Dependencies**:
  - `app/page.tsx#Home`, `lib/roadmap/queries.ts#getPublicationHomeData`, `#PublicationTopicSummary`.
  - `lib/auth/write-access.ts` (bổ sung helper kiểm tra session server không cần `Request`).
  - `components/roadmap/PublicationHome.tsx`, `app/login/page.tsx`, `app/styles/roadmap-theme.css`, `app/styles/globals.css`.
  - Flows & ADRs: `ADR-0010` (chỉ Owner thấy `Lesson Status`), `ADR-0019` (site Owner-only trừ `/login`).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`, `docs/design-system.md`.
- **Không fetch trong `useEffect` mới** (`FE-EFFECT-FETCH` / `AGENTS.md`): dữ liệu `statusCounts` cho Owner trên `PublicationHome` lấy từ Server Component `app/page.tsx` (`force-dynamic`) thông qua `hasServerOwnerAccess()`.
- **ADR-0010 (Visitor isolation)**: Khi `hasServerOwnerAccess()` là `false`, `getPublicationHomeData({ includeStatusCounts: false })` tuyệt đối **không** select/trả `statusCounts` về client HTML.
- **Bảo toàn Portfolio (`global_tokens_untouched`)**: Trong `app/styles/globals.css`, **không sửa, không xoá bất kỳ dòng nào** của `:root`, `.dark`, hoặc các token đang có trong `@theme inline`; chỉ được phép thêm biến mới (nếu cần). Gate `global_tokens_untouched` fail nếu `git diff -U0 app/styles/globals.css` có dòng bị xoá/sửa (`^-`).
- **Giữ test `PublicationHome` (`tests/unit/roadmap-lecture-layout.test.tsx#L379-L422`)**: giữ nguyên cấu trúc không có `<footer>` hay `<nav>` thừa trên `PublicationHome`, giữ text `"X topics · Y bài học"` và thứ tự `<AbotMascot>` trước `<h1>Crisne</h1>`.
- Ngoài phạm vi: `TopicEditorialPage.tsx`, `LectureShell.tsx`, `LessonEditorialReader.tsx`, `components/news/**`, `roadmap-rag-assistant/**`.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1: Helper Server Auth & Query `statusCounts` an toàn (`lib/auth/write-access.ts`, `lib/roadmap/queries.ts`, `app/page.tsx`)**
  - Thêm `hasServerOwnerAccess(): Promise<boolean>` vào `lib/auth/write-access.ts` (tái dùng `isDevOwnerBypass`, `auth()`, `isOwnerEmail`, fail-closed về `false` khi lỗi auth).
  - Mở rộng `PublicationTopicSummary` trong `lib/roadmap/queries.ts`: thêm trường optional `statusCounts?: { target: number; learning: number; known: number }`.
  - Mở rộng `getPublicationHomeData(options?: { includeStatusCounts?: boolean })`: khi `includeStatusCounts === true`, select thêm `status` trong `items` của `prisma.roadmap.findMany` để đếm theo `isLessonStatus` (không rò khi `false`).
  - Trong `app/page.tsx`: gọi `const canViewStatuses = await hasServerOwnerAccess();` và truyền `includeStatusCounts: canViewStatuses` vào `getPublicationHomeData`.
- [ ] **Step 2: Nâng Hierarchy của `PublicationHome.tsx`**
  - Trên Topic Card (`L198–L226`):
    - Khi `topic.statusCounts` có dữ liệu và (`learning > 0` hoặc `target > 0`), hiển thị chỉ báo tiến độ gọn ở chân card (ví dụ thanh progress phân đoạn mảnh hoặc text đếm màu token `--status-learning` / `--status-target` kèm icon nhỏ `CircleDot`/`Target` thay vì chỉ `"X mục"` đơn điệu).
    - Nâng title Topic Card lên `text-base font-semibold`, đưa footer về `text-xs` (bỏ `text-[0.6875rem]`).
  - Căn lại độ rộng khối `Mới cập nhật` (`L232`): mở rộng từ `max-w-3xl` lên đồng nhất với lưới `max-w-5xl` (dùng lưới 2 cột `sm:grid-cols-2` hoặc danh sách full-width có cột topic/time thẳng hàng) để không hụt 1/3 bên phải trên desktop.
  - Chuẩn hóa nút `"Tạo topic"` dùng `<Button>` từ `@/components/ui/button`, dọn `DS-ARBITRARY-VALUE` trong `PublicationHome.tsx` (kèm xử lý `Q2` nếu chốt thêm `ThemeToggle`).
- [ ] **Step 3: Đồng bộ `/login` vào `.roadmap-theme` (`app/login/page.tsx`)**
  - Bọc `<main>` của `app/login/page.tsx` bằng `roadmap-theme`, dùng `font-display` cho tiêu đề `Cris.dev`, dùng `<Button>` cho nút `"Đăng nhập với Google"` và giữ nguyên server action `handleSignIn` + thông báo lỗi OAuth.
- [ ] **Step 4: Chuẩn hóa Theme Tokens (`app/styles/roadmap-theme.css`, `app/styles/globals.css`)**
  - Áp dụng `Q1` trong `app/styles/roadmap-theme.css` nếu đổi `--primary`, và nếu cần cỡ chữ trung gian (`--text-2xs` / `--text-sm-compact`), thêm mới vào cuối `@theme inline` của `app/styles/globals.css` (không sửa/xoá dòng cũ).
- [ ] **Step 5: Tests & Verification Gate**
  - Bổ sung unit test cho `getPublicationHomeData({ includeStatusCounts: false })` đảm bảo `statusCounts` là `undefined` với Visitor và trả đủ số đếm với Owner; thêm case test `PublicationHome` có `statusCounts` hiển thị số bài `đang học`/`mục tiêu`.
  - Chạy toàn bộ `verification_gate`, cập nhật mục 4 & 5, ghi `.handoff/runs/TASK-visual-hierarchy-004/result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `Home Test`: PENDING
- [ ] `Test`: PENDING
- [ ] `Global tokens untouched`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Doctor Delta`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-visual-hierarchy-004/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
