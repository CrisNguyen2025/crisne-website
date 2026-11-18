---
task_id: "TASK-roadmap-theme-clean-001"
branch: "feat/roadmap-theme-clean"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "READY"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "components/roadmap/**"
    - "app/styles/globals.css"
    - "app/topic/**"
    - "app/page.tsx"
    - "lib/roadmap/status.ts"
    - "tests/unit/roadmap-*.test.ts"
    - "tests/unit/roadmap-*.test.tsx"
    - "tests/manual/roadmap-theme.md"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "tests/manual/README.md"
    - "components/ui/**"
    - "lib/roadmap/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "app/portfolio/**"
    - "app/layout.tsx"
    - "components/floating-bot/**"
    - "components/ui/**"
    - "roadmap-rag-assistant/**"
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "AGENTS.md"
    - "CLAUDE.md"

deploy_steps: []

fast_gate: ["type_check", "lint_scoped", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint_scoped: "yarn eslint components/roadmap app/topic app/page.tsx"
  test: "yarn test"
  global_tokens_untouched: "git diff -U0 app/styles/globals.css | grep '^-[^-]' && exit 1 || exit 0"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-roadmap-theme-clean-001"
---

# TASK: Theme clean, trực quan cho riêng các trang roadmap

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): READY. Chưa bắt đầu.

## 1. Context & Architectural Intent

- **Goal**: Đổi giao diện các trang roadmap (`/`, `/topic/[topicSlug]`, `/topic/[topicSlug]/[itemSlug]`) theo hướng tối giản nhưng trực quan: nhìn sidebar là biết đang ở Section nào và bài nào Owner đang học / đặt mục tiêu. Portfolio và phần còn lại của site **không được đổi một pixel nào**.
- **Why**: Owner thấy UI hiện tại (khảo sát 2026-11-17, `/topic/ai-architecture`) chưa trực quan: chế độ List là danh sách 117 bài liền nhau, không thấy trạng thái từng bài; chế độ Map là một cột chip với nhiều khoảng trống; trạng thái học chỉ thấy khi mở từng bài.
- **Hiện trạng đã xác nhận bằng code** (không suy diễn):
  - Token màu dùng chung toàn site: `@theme inline`, `:root`, `.dark` trong `app/styles/globals.css` (Tailwind v4, không có `tailwind.config`). Theme toggle qua `next-themes` (`components/theme-provider.tsx`, gắn ở `app/layout.tsx`).
  - 21 component trong `components/roadmap/` dùng token (`text-muted-foreground`, `border-border`, `bg-muted`, `bg-primary`…), không có hex. Ngoại lệ màu cứng: trạng thái bài học `sky`/`amber`/`emerald` ở `components/roadmap/LessonStatus.tsx#STATUS_TONE`, và `rose-500` (khoảng 16 chỗ) cho thao tác xoá/nguy hiểm.
  - Gốc giao diện: `components/roadmap/RoadmapWorkspace.tsx` (thẻ `div` ở dòng `return (` khoảng dòng 258: `flex h-dvh flex-col md:flex-row bg-background overflow-hidden`). Được render từ `app/page.tsx` và `app/topic/[topicSlug]/page.tsx`.
  - Trạng thái bài học (ADR-0010): `target` | `learning` | `known`, **chỉ Owner nhận được**; `known` là mặc định, nên dòng bài chỉ đánh dấu hai trạng thái còn lại (`components/roadmap/ChecklistItemRow.tsx` khoảng dòng 52–53). Nhãn tiếng Việt lấy từ `lib/roadmap/status.ts#LESSON_STATUS_LABEL`.
- **Dependencies**: `components/roadmap/RoadmapWorkspace.tsx`, `MasterPanel.tsx`, `SectionList.tsx`, `ChecklistItemRow.tsx`, `RoadmapMap.tsx`, `DetailPanel.tsx`, `LessonStatus.tsx`, `lib/roadmap/status.ts`. Flow liên quan (chỉ hiển thị, không đổi logic): `FLOW_TOPIC_SECTION_REORGANIZE`.

## 2. Invariants & Rules

- Rule dự án: `AGENTS.md` (Tailwind cho style tĩnh, inline style chỉ cho giá trị runtime; naming theo component, không theo use-case; không `console.log`; không `any`).
- **Phạm vi token**: mọi token mới chỉ khai báo trong selector `.roadmap-theme` và `.dark .roadmap-theme` (thêm mới vào cuối `app/styles/globals.css`). **Không sửa, không xoá dòng nào** trong `:root`, `.dark`, `@theme inline` hiện có. Gate `global_tokens_untouched` fail nếu diff của `globals.css` có dòng bị xoá/sửa.
- Class `roadmap-theme` chỉ gắn ở gốc `RoadmapWorkspace` (và trang loading/error của `app/topic/**` nếu chúng render ngoài workspace). Không gắn ở `app/layout.tsx`.
- ADR-0009: cấu trúc Topic → Section → Lesson giữ nguyên; chỉ đổi cách hiển thị. ADR-0010: đúng 3 trạng thái `target` / `learning` / `known`, không thêm trạng thái, không đổi tên lưu trữ. Visitor không thấy trạng thái nào (giữ hành vi hiện tại).
- Thuật ngữ trong UI và code mới theo `GLOSSARY.md` (Topic, Section, Lesson); không dùng "layer", "group", "level", "progress" làm tên biến/prop mới.
- Không thêm hoặc nâng dependency (font, icon set, thư viện animation). Dùng `lucide-react` và font đang có.
- Không đổi logic dữ liệu, API, hook fetch, hay hành vi CUD. Chỉ markup + class + token.
- Accessibility: contrast chữ thường ≥ 4.5:1 và chữ lớn ≥ 3:1 ở cả light và dark; trạng thái không chỉ phân biệt bằng màu (có icon hoặc nhãn kèm theo).
- Lỗi hoặc test fail "có từ trước": chỉ ghi khi kèm lệnh tái hiện, commit và ngày.
- Ngoài phạm vi: portfolio, floating bot của Cris AI, giao diện bên trong khung chat Abot (SDK ở `roadmap-rag-assistant/sdk/**`), trang `/notes`, `/login`, `components/ui/**` (dùng chung toàn site).

## 3. Step-by-Step Implementation Checklist

Hướng thiết kế đã được Owner chọn: "clean nhất có thể nhưng vẫn trực quan". Một màu nhấn duy nhất; màu chỉ dùng để mã hoá trạng thái; nền trung tính, viền mảnh, không bóng đổ, không gradient.

**P1: Token riêng cho roadmap**
- [ ] **Step 1**: Thêm khối `.roadmap-theme { ... }` và `.dark .roadmap-theme { ... }` vào cuối `app/styles/globals.css`, khai báo lại các token mà `components/roadmap/**` đang dùng (background, foreground, card, muted, muted-foreground, border, primary, primary-foreground, accent, ring, destructive…) theo hướng: nền trắng ấm / xám rất nhạt, chữ gần đen, một màu nhấn trung tính-lạnh cho thao tác chính; dark mode tương ứng.
- [ ] **Step 2**: Thêm token trạng thái trong cùng khối: `--status-target`, `--status-learning`, `--status-known` (mỗi cái kèm bản nền nhạt, ví dụ `--status-target-bg`) cho cả light và dark. Đăng ký tương ứng để dùng được như class Tailwind (ví dụ qua `@theme inline` **mới** đặt trong khối thêm vào, hoặc dùng `bg-[var(--status-target-bg)]`), không sửa khối `@theme inline` cũ.
- [ ] **Step 3**: Gắn `roadmap-theme` vào `className` gốc của `components/roadmap/RoadmapWorkspace.tsx`; kiểm `app/topic/[topicSlug]/loading.tsx`, `error.tsx`, `components/roadmap/GlobalPageLoader.tsx` và gắn nếu chúng hiển thị ngoài gốc workspace.
- [ ] **Step 4**: Thay `STATUS_TONE` trong `components/roadmap/LessonStatus.tsx` dùng token trạng thái thay cho `sky`/`amber`/`emerald`. Thay `rose-500` trong `components/roadmap/**` bằng token `destructive`.

**P2: Typography và mật độ**
- [ ] **Step 5**: Thống nhất phân cấp chữ trong `components/roadmap/**`: tiêu đề Topic, tên Section, tên Lesson, chữ phụ. Nội dung bài trong `DetailPanel.tsx` 15–16px, độ rộng dòng tối đa khoảng 70 ký tự (`max-w-prose` hoặc tương đương). Số đếm dùng `tabular-nums`.
- [ ] **Step 6**: Khoảng cách và bo góc nhất quán (một thang khoảng cách, bo góc nhẹ), bỏ bóng đổ trang trí; dòng trong danh sách dùng viền/hover thay vì thẻ nổi.

**P3: Trực quan hơn**
- [ ] **Step 7**: Sidebar chế độ List (`MasterPanel.tsx` / `SectionList.tsx` / `ChecklistItemRow.tsx`): nhóm Lesson theo Section với tiêu đề Section rõ ràng và số bài; Lesson đang mở được làm nổi bật. Với Owner, mỗi dòng có chấm/icon trạng thái nhỏ cho `target` và `learning` (giữ quy ước `known` là mặc định, không đánh dấu); tiêu đề Section hiển thị số bài `learning` và `target` trong Section đó. Visitor không thấy chấm hay số này.
- [ ] **Step 8**: Chế độ Map (`RoadmapMap.tsx`): bố cục lưới theo Section (mỗi Section một cột hoặc một khối, tự xuống hàng theo chiều rộng) thay cho một cột chip; chip Lesson dùng cùng chấm trạng thái như Step 7 (chỉ Owner).
- [ ] **Step 9**: Trang Lesson (`DetailPanel.tsx`): breadcrumb Topic · Section phía trên tiêu đề; bộ chọn trạng thái (Owner) dạng segmented control dùng token trạng thái.
- [ ] **Step 10**: Mobile (dưới `md`): sidebar/drawer vẫn dùng được, không cuộn ngang, vùng chạm ≥ 40px.

**P4: Verify và ghi lại**
- [ ] **Step 11**: Nếu có test trong `tests/unit/roadmap-*.test.ts(x)` bị ảnh hưởng bởi đổi markup, cập nhật cho đúng hành vi (không xoá assertion về hành vi). Thêm test nhỏ cho logic đếm `learning`/`target` theo Section nếu tách thành hàm.
- [ ] **Step 12**: Viết `tests/manual/roadmap-theme.md` theo quy ước `tests/manual/README.md`: các case light/dark, Owner/Visitor, List/Map, Lesson page, mobile 375px, và case "portfolio không đổi" (mở `/portfolio` ở light/dark, so với trước). Ghi kết quả chạy (ngày, commit, môi trường).
- [ ] **Step 13**: Chạy toàn bộ `verification_gate`, cập nhật mục 4, ghi `result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint (scoped)`: PENDING
- [ ] `Test`: PENDING
- [ ] `Global tokens untouched`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-roadmap-theme-clean-001/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
