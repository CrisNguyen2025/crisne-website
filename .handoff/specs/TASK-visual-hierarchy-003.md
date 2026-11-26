---
task_id: "TASK-visual-hierarchy-003"
branch: "feat/visual-hierarchy-003"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "DRAFT" # Chờ Owner chốt mục 0, tách nhánh từ `main` và chạy baseline.sh trước khi đổi sang READY
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "components/news/NewsFeedClient.tsx"
    - "components/news/NewsCard.tsx"
    - "components/news/NewsReaderPanel.tsx"
    - "components/news/NewsDecisionBar.tsx"
    - "components/news/AddToLessonSheet.tsx"
    - "tests/unit/news-feed-ui.test.tsx"
    - "tests/unit/news-add-to-lesson.test.tsx"
    - "tests/manual/news-inbox.md"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/design-system.md"
    - "docs/adr/0011-drop-knowledge-triage.md"
    - "docs/adr/0016-news-ingest-worker-separate-service.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "docs/adr/0019-owner-only-site-no-public-news.md"
    - "app/styles/roadmap-theme.css"
    - "components/ui/button.tsx"
    - "components/news/MobileNewsDrawer.tsx"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "components/news/SourcesManagerSheet.tsx" # Đang tách phạm vi, tránh đụng nhánh feat/rovo-owner-memory
    - "components/news/NewsSourceFields.tsx"
    - "app/styles/globals.css"
    - "components/floating-bot/**"
    - "roadmap-rag-assistant/**"
    - "prisma/**"
    - "app/api/**"

deploy_steps: []

fast_gate: ["type_check", "news_test", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint components/news/NewsFeedClient.tsx components/news/NewsCard.tsx components/news/NewsReaderPanel.tsx components/news/NewsDecisionBar.tsx components/news/AddToLessonSheet.tsx tests/unit/news-feed-ui.test.tsx tests/unit/news-add-to-lesson.test.tsx"
  news_test: "yarn test tests/unit/news-feed-ui.test.tsx tests/unit/news-add-to-lesson.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-visual-hierarchy-003"
---

# TASK: Cải thiện Visual Hierarchy cho News Inbox, Reader & AddToLessonSheet

> **Trạng thái hiện tại**: DRAFT — đã chốt toàn bộ mục `0.` theo `Option (A)` (2026-11-26), tách hoàn toàn khỏi `SourcesManagerSheet.tsx` để không xung đột `feat/rovo-owner-memory`; chờ tách nhánh/worktree `feat/visual-hierarchy-003` từ `main` và chạy `baseline.sh` để chuyển `READY`.

## 0. Quyết định đã chốt của Owner (2026-11-26)

| # | Câu hỏi | Quyết định đã chốt |
|---|---|---|
| Q1 | Vị trí nút `"Đưa vào Lesson"` trong `NewsReaderPanel` | **Option (A):** Giữ nút ở cụm action trên đầu bài (để dễ thấy ngay trên mobile drawer mà không chen chật `NewsDecisionBar`), nâng cấp từ ghost text xám thành nút có viền/nền nhấn nhẹ (`border-[var(--editorial-accent)]/40 bg-[var(--editorial-accent-soft)] text-[var(--editorial-accent)]`), tách nút `Xoá` sang bên phải cụm action. |
| Q2 | Thứ tự `TL;DR` và Thumbnail (`thumbnailUrl`) trong `NewsReaderPanel` | **Option (A):** Đặt `TL;DR` (tín hiệu ra quyết định nhanh nhất) ngay trên thumbnail, hoặc thu gọn chiều cao thumbnail (`max-h-44`) để `TL;DR` luôn nằm trong viewport đầu tiên. |

## 1. Context & Architectural Intent
- **Goal**: Làm rõ bộ lọc đang bật trong danh sách News, tăng tương phản trạng thái bài đang chọn/đã lưu trên `NewsCard`, ưu tiên hiển thị `TL;DR` + hành động `"Đưa vào Lesson"` trong `NewsReaderPanel`, và phân nhóm bước rõ hơn trong `AddToLessonSheet`.
- **Why**:
  - `NewsFeedClient.tsx` (L306–L386, L471–L485): nút quay về `/` và nút `Nguồn RSS` chỉ là icon trần không nhãn, trong khi nút `Worker OK` nằm nổi bật ngay cạnh `<h1>News</h1>`; khi đóng panel lọc, trạng thái bộ lọc đang kích hoạt chỉ hiện bằng **một chấm `6px`**, dễ gây hiểu nhầm danh sách thiếu bài.
  - `NewsCard.tsx` (L103–L106): trạng thái `isSelected` dùng `bg-card` (`#ffffff`) trên nền `#faf9f5` và vạch trái `2px` rất mảnh; `isDone` làm mờ `opacity-75` cả những bài trong tab `Đã lưu`.
  - `NewsReaderPanel.tsx` (L169–L284) & `AddToLessonSheet.tsx` (L218, L271–L377): nút `"Đưa vào Lesson"` quá chìm (`text-muted-foreground`), nằm kẹp giữa `Mở nguồn gốc` và `Xoá`; `thumbnailUrl` (`max-h-60`) đẩy `TL;DR` và `Ý chính` xuống thấp; trong `AddToLessonSheet`, nút `"Gợi ý từ Abot"` đứng ngang hàng với `radiogroup` và form đích dài chưa chia nhóm rõ ràng.
- **Dependencies**:
  - `components/news/NewsFeedClient.tsx`, `NewsCard.tsx`, `NewsReaderPanel.tsx`, `NewsDecisionBar.tsx`, `AddToLessonSheet.tsx`.
  - Flows: `FLOW_NEWS_FEED_BROWSE_AND_STATE`, `FLOW_NEWS_ADD_TO_LESSON`, `FLOW_ABOT_LINKING_AND_PROVENANCE`.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`, `docs/design-system.md` (khi sửa file `components/news/*`, dọn `DS-RAW-BUTTON` / `DS-ARBITRARY-VALUE` tại các phần tử chạm tới bằng `<Button>` và thang Tailwind `text-xs` / `text-sm` / `text-base` / `text-2xl`).
- **ADR-0011 & ADR-0019**: Không dùng chữ `triage`; giữ nguyên 4 tab `Chờ xử lý` / `Đã lưu` / `Đã bỏ qua` / `Tất cả`, giữ `J`/`K`/`S`/`N` keyboard shortcuts, auto-read 3s (`latestItemRef`/`onToggleReadRef`), polling khi có job.
- Giữ nguyên accessible names và roles mà `tests/unit/news-feed-ui.test.tsx` và `tests/unit/news-add-to-lesson.test.tsx` đang kiểm tra (`"Về Crisne"`, `"Nguồn RSS"`, `"Thêm link"`, `"Lọc"`, `"Đưa vào Lesson"`, `"Lưu"`, `"Bỏ qua"`, `"Đưa lại Chờ xử lý"`, `"Gợi ý từ Abot"`, `"Xem trước"`, `"Lưu vào Lesson"`).
- **Chú ý `NewsCard.tsx`**: giữ nguyên cấu trúc 1 `<button>` bao phủ toàn row (`after:absolute after:inset-0`) để không phá test `expect(screen.getAllByRole("button")).toHaveLength(1)`.
- Ngoài phạm vi: `SourcesManagerSheet.tsx`, `NewsSourceFields.tsx`, `QuickPasteDialog.tsx`, `MobileNewsDrawer.tsx`, `lib/news/*`, `app/api/news/**`.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1: Cân lại Header & Chỉ báo Filter đang bật (`NewsFeedClient.tsx`)**
  - Trong `NewsFeedHeader`: bổ sung nhãn ngắn bên cạnh `ArrowLeft` (giữ `aria-label="Về Crisne"`), thêm chữ `"Nguồn RSS"` ở màn `lg:` trở lên cho nút RSS, làm dịu trọng số thị giác của nút kiểm tra worker (đẩy sang nhóm bên phải trước nút RSS hoặc giảm độ nổi cạnh `<h1>News</h1>`).
  - Trong `NewsFilterToolbar`: khi `activeFilterCount > 0 && !isFilterOpen` (hoặc có `q` / filter), hiển thị một hàng tóm tắt gọn các bộ lọc đang bật dạng chip nhỏ có nút xoá nhanh từng filter (và `"Xoá lọc"`), để Owner luôn biết danh sách đang được lọc theo tiêu chí nào.
- [ ] **Step 2: Tăng độ tách biệt trạng thái trên `NewsCard.tsx`**
  - Tăng độ rõ cho `isSelected`: dùng viền trái `border-l-[0.1875rem] border-l-[var(--editorial-accent)]` (hoặc `shadow-[inset_3px_0_0_var(--editorial-accent)]`) kết hợp nền `bg-accent/60` (hoặc `bg-card` + viền rõ).
  - Tách riêng độ mờ cho bài `dismissed` (`opacity-65`) thay vì làm mờ cả bài `isSaved` (`isDone`), giữ nguyên độ nét chữ cho tab `Đã lưu`.
  - Chỉnh cỡ chữ tiêu đề từ `text-[17px]` về thang chuẩn (`text-base font-semibold`) hoặc giữ nhịp cân đối với `NewsReaderPanel`.
  - Phân biệt rõ weight giữa status badge (`Đã lưu`, `Lỗi`, `Đang tóm tắt`) và tag loại nội dung (`contentTypeLabel`).
- [ ] **Step 3: Tối ưu thứ tự đọc & hành động trong `NewsReaderPanel.tsx` (+ `NewsDecisionBar.tsx`)**
  - Theo `Q1`: tách nút `"Đưa vào Lesson"` (trigger trong `AddToLessonSheet.tsx`) thành nút có viền/tông nhấn `--editorial-accent`, đẩy nút `Xoá` (và xác nhận xoá 2 bước) sang mép phải nhóm action (`ml-auto`) để tránh bấm nhầm cạnh action chính.
  - Theo `Q2`: ưu tiên `TL;DR` xuất hiện ngay phía trên viewport đầu (đưa `TL;DR` lên trước `thumbnailUrl` hoặc thu `max-h-44` cho thumbnail).
  - Chuẩn hóa typography trong `NewsReaderPanel.tsx`: đổi `text-[28px]` -> `text-2xl sm:text-3xl`, `text-[15px]` -> `text-base` cho `TL;DR`.
- [ ] **Step 4: Phân nhóm bước rõ ràng trong `AddToLessonSheet.tsx`**
  - Trong `step === "pick"`, chia rõ 2 khối có heading step (`1. Chọn & chỉnh ý chính`, `2. Chọn Topic & Lesson đích`), đặt nút `"Gợi ý từ Abot"` ngay cạnh header khối 2 (tách khỏi `radiogroup` `"Tạo bài mới"` / `"Nối vào bài có sẵn"`).
  - Dọn `text-[0.6875rem]` trong file về `text-xs`.
- [ ] **Step 5: Tests & Verification Gate**
  - Bổ sung unit test trong `tests/unit/news-feed-ui.test.tsx`: khi áp dụng filter (`origin`/`tag`/`readState`) rồi đóng panel lọc, chip chỉ báo bộ lọc đang bật vẫn hiển thị trên màn hình và cho phép xoá nhanh.
  - Chạy toàn bộ `verification_gate`, cập nhật mục 4 & 5, ghi `.handoff/runs/TASK-visual-hierarchy-003/result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `News Test`: PENDING
- [ ] `Test`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Doctor Delta`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-visual-hierarchy-003/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
