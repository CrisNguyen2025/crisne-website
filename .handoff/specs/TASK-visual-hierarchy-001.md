---
task_id: "TASK-visual-hierarchy-001"
branch: "feat/visual-hierarchy-001"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "DRAFT" # Chờ Owner chốt mục 0, tách nhánh từ `main` và chạy baseline.sh trước khi đổi sang READY
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "components/roadmap/TopicEditorialPage.tsx"
    - "components/roadmap/LectureShell.tsx"
    - "components/roadmap/LessonEditorialReader.tsx"
    - "components/roadmap/LessonStatus.tsx"
    - "components/roadmap/RelatedLessons.tsx"
    - "components/roadmap/LessonSources.tsx"
    - "tests/unit/roadmap-lecture-layout.test.tsx"
    - "tests/unit/roadmap-cud-ui.test.tsx"
    - "tests/manual/lesson-status.md"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/design-system.md"
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "docs/adr/0014-topic-scoped-urls-and-heading-anchors.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "hooks/use-abot-sidebar.ts"
    - "components/ui/button.tsx"
    - "app/styles/roadmap-theme.css"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "app/styles/globals.css"
    - "app/portfolio/**"
    - "components/floating-bot/**"
    - "components/news/**"
    - "roadmap-rag-assistant/**"
    - "prisma/**"
    - "app/api/**"

deploy_steps: []

fast_gate: ["type_check", "lecture_test", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint components/roadmap/TopicEditorialPage.tsx components/roadmap/LectureShell.tsx components/roadmap/LessonEditorialReader.tsx components/roadmap/LessonStatus.tsx components/roadmap/RelatedLessons.tsx components/roadmap/LessonSources.tsx tests/unit/roadmap-lecture-layout.test.tsx tests/unit/roadmap-cud-ui.test.tsx"
  lecture_test: "yarn test tests/unit/roadmap-lecture-layout.test.tsx tests/unit/roadmap-cud-ui.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-visual-hierarchy-001"
---

# TASK: Cải thiện Visual Hierarchy cho Topic Syllabus & Lesson Editorial

> **Trạng thái hiện tại**: DRAFT — đã chốt toàn bộ mục `0.` theo `Option (A)` (2026-11-26); chờ tách nhánh/worktree `feat/visual-hierarchy-001` từ `main` và chạy `baseline.sh` để chuyển `READY`.

## 0. Quyết định đã chốt của Owner (2026-11-26)

| # | Câu hỏi | Quyết định đã chốt |
|---|---|---|
| Q1 | Chỉ báo `Lesson Status` trên danh sách bài học của `TopicEditorialPage` cho trạng thái `known` (mặc định) và khi người xem là `Visitor` | **Option (A):** Đồng bộ hoàn toàn với `LectureShell` — chỉ hiển thị chỉ báo trạng thái (`LessonStatusBadge` hoặc icon + text gọn) cho `target` và `learning` khi `canWrite === true`; bài `known` và `Visitor` không hiện badge hay chấm trang trí màu accent. |
| Q2 | Cách hiển thị & tương tác `Lesson Status` ở phần đầu bài `LessonEditorialReader` khi Right Rail bị ẩn (`!showDesktopRail` — màn `< xl` hoặc đang mở Abot Sidebar) | **Option (A):** Hiển thị `LessonStatusBadge` (chỉ đọc hoặc click để mở `LessonOwnerMenu`, **không** đặt `LessonStatusPicker` 3 nút `role="group"` trực tiếp vào `article header`) ngay cạnh cụm metadata thời gian đọc/cập nhật, đồng thời gắn nhãn rõ ràng cho nút `LessonOwnerMenu` (`Thao tác`). |

## 1. Context & Architectural Intent
- **Goal**: Giảm nhiễu màu nhấn trên trang `Topic`, khôi phục khả năng quét tiến độ học (`target` / `learning`) trên syllabus và giữ nguyên ngữ cảnh `Lesson Status` + thao tác Owner ở trang `Lesson` ngay cả khi Right Rail thu gọn lúc mở Abot Sidebar.
- **Why**:
  - `TopicEditorialPage.tsx` (L598–L609, L709–L724) đang tô `text-[var(--editorial-accent)]` cho mọi link bài học, nối `— {description}` inline làm vỡ hàng thẳng khi quét tiêu đề, dùng chấm `6px` (`STATUS_DOT`) cho `target`/`learning` và cùng chấm `6px` màu `--editorial-accent` cho `known`/`Visitor`, đồng thời tiêu đề `"Đang theo dõi 👀"` (L328) dùng emoji trong UI chrome.
  - `LectureShell.tsx` (L405, L475) dùng cùng `text-sm` cho cả tên Section (`font-semibold`) và tên Lesson (`font-medium`), khiến bậc cha-con trong sidebar trái khó phân tách khi có nhiều section.
  - `LessonEditorialReader.tsx` (L707–L723) đặt metadata dưới `<h1>` (ngược với `TopicEditorialPage.tsx` đặt metadata trên `<h1>`), và khi `!showDesktopRail` (mở Abot Sidebar trên laptop `< 105rem` hoặc màn `< xl`), Owner mất hoàn toàn tín hiệu `Lesson Status` hiện tại vì toàn bộ `LessonControlsPanel` bị gom vào nút `⋯` (`MoreHorizontal`).
  - Cuối bài học (`RelatedLessons.tsx`, `LessonSources.tsx`, `LecturePager`), 3 khối liên tiếp tạo 3 đường kẻ `border-t` xếp tầng.
- **Dependencies**:
  - `components/roadmap/TopicEditorialPage.tsx#TopicEditorialPage`, `components/roadmap/LectureShell.tsx#LectureShell`, `#LecturePager`.
  - `components/roadmap/LessonEditorialReader.tsx#LessonEditorialReader`, `#LessonOwnerMenu`.
  - `components/roadmap/LessonStatus.tsx#LessonStatusBadge`, `#LessonStatusPicker`.
  - `components/roadmap/RelatedLessons.tsx`, `components/roadmap/LessonSources.tsx`.
  - Flow liên quan (chỉ trình bày UI, không đổi API/logic): `FLOW_LESSON_STATUS_UPDATE`, `FLOW_TOPIC_SECTION_REORGANIZE`, `FLOW_NEWS_ADD_TO_LESSON` (`Provenance` / `RelatedLessons`).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`, `docs/design-system.md`. Dùng `<Button>` từ `@/components/ui/button` cho các nút mới/sửa, dùng token trong `roadmap-theme.css`, không viết hex/arbitrary font size mới, chỉ dùng icon `lucide-react`.
- **ADR-0009 & ADR-0010**: Không đổi cấu trúc `Topic -> Section -> Lesson` hay 3 giá trị `target | learning | known`; trạng thái vẫn chỉ hiển thị khi `canWrite === true` (Visitor tuyệt đối không thấy).
- **Giữ tương thích test layout hiện có (`tests/unit/roadmap-lecture-layout.test.tsx`)**:
  - Sidebar link trong `LectureShell` giữ `font-medium` (không `font-semibold`) ở cả trạng thái active và inactive, giữ cố định slot `span.size-1.5` cho indicator `"Mục đang đọc"` trên button section.
  - Không đổi `aria-label`, `data-roadmap-context*`, hay logic `debounce` lưu status.
- Ngoài phạm vi: `PublicationHome.tsx`, `RoadmapMap.tsx` (trừ không làm gãy reorder embedded), `EditItemContentDrawer.tsx`, `EditItemInfoDrawer.tsx`, `roadmap-rag-assistant/**`, `components/news/**`.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1: Làm sạch `TopicEditorialPage.tsx`**
  - Đổi tiêu đề link bài học (L598–L604 và L709–L718) từ `text-[var(--editorial-accent)]` sang `text-foreground transition-colors hover:text-[var(--editorial-accent)]` (hoặc `group-hover:text-[var(--editorial-accent)]`).
  - Tách `item.description` khỏi inline `—` thành dòng `<p>` riêng bên dưới (`mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground` hoặc `line-clamp-2`), tạo hàng thẳng để quét tiêu đề nhanh.
  - Thay chấm `6px` (`STATUS_DOT`) ở danh sách chính bằng hiển thị phân biệt bằng hình dạng + nhãn theo `Q1`: hiện `LessonStatusBadge` gọn (hoặc icon + badge trạng thái từ `LessonStatus.tsx`) cho `target` / `learning` khi `canWrite`; ẩn chấm ở `known` và `Visitor`.
  - Thay `"Đang theo dõi 👀"` ở `focusRail` (L328) bằng icon `lucide-react` (`Eye` `aria-hidden="true"` + chữ `"Đang theo dõi"`).
  - Rà các `<button>` và `text-[0.6875rem]` trong file này: chuyển sang `<Button>` (hoặc giữ semantic/design-system chuẩn) và dùng `text-xs` chuẩn thang Tailwind.
- [ ] **Step 2: Nâng phân cấp Sidebar trái (`LectureShell.tsx`)**
  - Trong `renderSidebarNavigation`, tách rõ bậc chữ giữa Section header và Lesson link: Section title dùng `text-xs font-semibold uppercase tracking-wide text-foreground/85` (hoặc giữ title thường nếu quá dài nhưng khác hẳn Lesson ở cỡ/tracking + weight), Lesson link giữ `text-sm font-medium` (đạt điều kiện test L644–L647).
  - Đổi nhãn phụ `{sub}` của section (L479) và badge đếm số bài (L495, L541) từ `text-[0.6875rem]` sang `text-xs` để bỏ `DS-ARBITRARY-VALUE`.
  - Đồng bộ chỉ báo trạng thái bài ở `renderLessonItems`: thay chấm tròn đơn thuần bằng icon nhỏ từ `LessonStatus` (`Target` / `CircleDot`, `aria-hidden="true"`) hoặc `LessonStatusBadge` siêu gọn khi `sibStatus !== "known"`, tránh phân biệt chỉ bằng màu.
- [ ] **Step 3: Bảo toàn ngữ cảnh `Lesson` & gom cụm chân trang (`LessonEditorialReader.tsx`, `RelatedLessons.tsx`, `LessonSources.tsx`)**
  - Thống nhất nhịp đầu bài với `TopicEditorialPage`: đưa dòng metadata (thời gian đọc · cập nhật) và (khi `canWrite && !showDesktopRail`) chỉ báo trạng thái hiện tại theo `Q2` vào một cụm rõ ràng ngay trên hoặc ngay dưới `<h1>` nhất quán với trang Topic.
  - Khi `canWrite && !showDesktopRail`, nâng cấp nút mở `LessonOwnerMenu` (`aria-label="Thao tác bài học"`) ở breadcrumb/header (L709) từ icon `⋯` trần `size-8` sang nút có nhãn hoặc trạng thái hiện tại (`LessonStatusBadge` + `MoreHorizontal`), giúp Owner nhận biết và mở panel điều khiển chỉ trong một nhịp nhìn.
  - Gom khối tham khảo cuối bài (`RelatedLessons.tsx` + `LessonSources.tsx`): bỏ bớt đường `border-t` lặp chồng lên `LecturePager` (ví dụ chỉ giữ một đường ngăn ở khối đầu tiên xuất hiện, các khối phụ bên dưới dùng `mt-6` không `border-t`, đổi link từ màu cam mặc định sang `text-foreground hover:text-[var(--editorial-accent)]`).
- [ ] **Step 4: Cập nhật test & kiểm tra thiết kế**
  - Kiểm tra và cập nhật `tests/unit/roadmap-lecture-layout.test.tsx` (test visitor/owner, `collapseRightRail`, status visibility) và `tests/unit/roadmap-cud-ui.test.tsx` nếu selector bị ảnh hưởng bởi `<Button>` hoặc đổi cấu trúc metadata.
  - Thêm test assert: danh sách bài trong `TopicEditorialPage` không render chấm/badge status cho `Visitor`; khi `canWrite && collapseRightRail` (mở Abot Sidebar trên `xl`), `LessonEditorialReader` vẫn hiển thị `LessonStatus` hiện tại của bài học ở vùng đọc chính.
- [ ] **Step 5: Verification Gate**
  - Chạy toàn bộ `verification_gate`, cập nhật mục 4 và 5, ghi `.handoff/runs/TASK-visual-hierarchy-001/result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `LectureTest`: PENDING
- [ ] `Test`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Doctor Delta`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-visual-hierarchy-001/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
