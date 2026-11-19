---
task_id: "TASK-lesson-ui-polish-001"
branch: "feat/lesson-ui-polish"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "ABORTED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "components/roadmap/LectureShell.tsx"
    - "components/roadmap/LectureToc.tsx"
    - "tests/unit/roadmap-lecture-layout.test.tsx"
  continues_dirty: []
  read_only_references:
    - "components/theme-toggle.tsx"
    - "components/roadmap/LessonEditorialReader.tsx"
    - "components/roadmap/TopicEditorialPage.tsx"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "components/theme-toggle.tsx"
    - "app/globals.css"

deploy_steps: []

fast_gate: ["type_check", "lecture_test", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lecture_test: "yarn test tests/unit/roadmap-lecture-layout.test.tsx"
  lint: "yarn lint"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-lesson-ui-polish-001"
---

# TASK: UI polish trang bài học (pager, header buttons, sidebar typography, TOC spacing)

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): ABORTED tại Preflight. Lệch branch (hiện tại `main`, spec yêu cầu `feat/lesson-ui-polish`) và các file trong `allowed_to_modify` (`LectureShell.tsx`, `LectureToc.tsx`, `roadmap-lecture-layout.test.tsx`) đang dirty trong working tree. Chưa tạo nhánh và chưa commit thay đổi trước đó. Claude verify (2026-11-19): ABORTED đúng SOP, Executor không sửa code. Chờ Dev commit, tạo nhánh, chạy lại `baseline.sh` rồi giao lại (`current_attempt` vẫn 0). Working tree còn thay đổi của plan topic-scoped-urls (ADR-0014, `lib/roadmap/content-utils.ts`, `tests/unit/heading-ids.test.ts`), không thuộc task này.

## 1. Context & Architectural Intent
- **Goal**: Sửa 4 điểm lệch về kích thước nút và thứ bậc chữ trên trang bài học (`/lessons/[lessonSlug]`) và trang tổng quan topic (`/topic/[topicSlug]`), chỉ bằng thay đổi className và markup trình bày.
- **Why**: Claude đã verify trên code (2026-11-19):
  - Pager trước/sau không có icon, title luôn màu accent nên trông giống link chữ hơn là nút.
  - 3 control trên header mobile cao 3 mức khác nhau (36/44/32px) và nút TOC không có border/bg.
  - Tên bài trong sidebar (13.5px) lớn hơn tiêu đề section (13px); nhãn phụ section 11px quá nhỏ.
  - Mục TOC rail dùng `py-0.5`, các đề mục 2 dòng hơi sát nhau.
- **Dependencies**:
  - `components/roadmap/LectureShell.tsx#LecturePager`, `#LectureShell` (header, `renderLessonItems`, `renderSidebarNavigation`).
  - `components/roadmap/LectureToc.tsx#MobileTocDropdown`, `#LectureTocLinks`.
  - Caller: `LessonEditorialReader.tsx`, `TopicEditorialPage.tsx`. Không đổi props/API nên caller không cần sửa.
  - `components/theme-toggle.tsx`: chỉ đọc. Class mặc định `w-10 h-10 rounded-full`; `cn` (tailwind-merge 3.5) để `size-8` do LectureShell truyền vào ghi đè.
  - Impact: chỉ đổi style trong 2 component trình bày, không đổi props, type hay behavior. Risk LOW.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Styling dùng Tailwind, không inline style.
- **Không đổi props, type, export, text label hay behavior** (link href, onClick, aria-label, aria-expanded, logic mở/đóng dropdown).
- **Touch target trên mobile ≥ 40px**: phần nhìn thấy của nút là 32px, vùng bấm mở rộng bằng pseudo-element (Step 2). Không được làm vùng bấm nhỏ hơn 40px.
- Icon trang trí phải có `aria-hidden="true"` để accessible name của link không đổi (test đang query `getByRole("link", { name: /Trang sau/ })`).
- Không thêm dependency; `ChevronLeft`/`ChevronRight` lấy từ `lucide-react` (đã có).
- Ngoài phạm vi:
  - Breadcrumb header (đã verify: hai vế cùng size, không sửa).
  - `ThemeToggle` và nút X trong header của drawer sidebar.
  - `sidebarHeaderAction` (menu topic).
  - `components/theme-toggle.tsx`.
  - `DesktopTocRail` heading, `TabletInlineToc`.
  - Cris AI (`components/floating-bot/**`).

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1: `LecturePager` có icon, title màu trung tính** (`LectureShell.tsx`, hàm `LecturePager`)
  - Import thêm `ChevronLeft` từ `lucide-react` (đã có `ChevronRight`).
  - Card `prev`: class của `Link` đổi `flex-col justify-center` thành `flex items-center gap-3` (giữ `group min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-[var(--editorial-accent)]`). Bên trong:
    - Đầu tiên là `<ChevronLeft aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-150 group-hover:-translate-x-0.5 group-hover:text-[var(--editorial-accent)]" />`.
    - Tiếp theo là `<span className="flex min-w-0 flex-1 flex-col">` bọc span label và span title như hiện tại.
  - Card `next`: tương tự, `text-right`. Span cột chữ đứng trước, `ChevronRight` đứng sau, dùng `group-hover:translate-x-0.5`.
  - Span title (cả hai card): `text-[var(--editorial-accent)]` đổi thành `text-foreground transition-colors duration-150 group-hover:text-[var(--editorial-accent)]`, giữ `mt-0.5 truncate text-sm font-medium`.
- [ ] **Step 2: Đồng bộ 3 control trên header mobile** (`LectureShell.tsx` phần `<header>`; `LectureToc.tsx#MobileTocDropdown`)
  - Style chung của khung nhìn thấy: `h-8 rounded-lg border border-border/70`.
  - Vùng bấm 40px: thêm `relative before:absolute before:-inset-1 before:content-['']`.
  - Nút "Bài học" (`LectureShell.tsx`, button `aria-label="Mở danh sách bài học"`):
    - Thay `min-h-[2.25rem]` và `py-1` bằng `h-8`.
    - Thêm `relative before:absolute before:-inset-1 before:content-['']`.
    - Giữ nguyên các class còn lại.
  - Nút "On this page" (`LectureToc.tsx`, `MobileTocDropdown`, button có `aria-expanded`):
    - Đổi className thành `relative inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--editorial-sidebar-hover)] hover:text-[var(--editorial-accent)] cursor-pointer before:absolute before:-inset-1 before:content-['']`.
    - Không thêm `relative` vào `div ref={rootRef}`: panel dropdown `absolute inset-x-4 top-full` phải tiếp tục định vị theo `<header>`.
  - `ThemeToggle` trong header chính (dòng có `size-8 rounded-lg border border-border/70 bg-background/50 ...`, **không phải** cái trong `renderSidebarHeader`): thêm `before:absolute before:-inset-1 before:content-['']`. Component gốc đã `relative`.
  - Container nhóm nút bên phải header: `gap-1.5 sm:gap-2` đổi thành `gap-2`, để vùng bấm mở rộng 4px mỗi bên không chồng nhau.
- [ ] **Step 3: Typography sidebar** (`LectureShell.tsx`)
  - `renderLessonItems`, class của `Link`: `text-[0.84375rem]` đổi thành `text-[0.8125rem]`.
  - `renderSidebarNavigation`, span `{sub}` (nhãn phụ dưới tên section): `text-[0.6875rem]` đổi thành `text-xs`. **Không** đổi span đếm số bài (`group.items.length`) hay span "N bài" ở sidebar header.
- [ ] **Step 4: Giãn mục TOC rail** (`LectureToc.tsx#LectureTocLinks`)
  - Nhánh `isRail`: `py-0.5` đổi thành `py-1`. Giữ `leading-snug`, `border-l-2`, `space-y-1.5`. Không đổi nhánh `inline`.
- [ ] **Step 5: Test**
  - Chạy `yarn test tests/unit/roadmap-lecture-layout.test.tsx`. Nếu test fail vì đổi class/markup (không phải vì behavior), chỉ sửa assertion tương ứng và ghi lý do vào mục 5.
  - Thêm 1 assertion vào test pager hiện có: link "Trang sau" chứa một `svg` có `aria-hidden="true"`.
- [ ] **Step 6: Gate**: chạy toàn bộ `verification_gate`, điền mục 4.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: SKIPPED (Preflight ABORTED)
- [ ] `LectureTest`: SKIPPED (Preflight ABORTED)
- [ ] `Lint`: SKIPPED (Preflight ABORTED)
- [ ] `Test`: SKIPPED (Preflight ABORTED)
- [ ] `Intel Status`: SKIPPED (Preflight ABORTED)
- [ ] `Boundary Check`: SKIPPED (Preflight ABORTED)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-lesson-ui-polish-001/result.json`
- **Modified Files**:
  - Không có (Preflight ABORTED do sai nhánh và file đang dirty)
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
