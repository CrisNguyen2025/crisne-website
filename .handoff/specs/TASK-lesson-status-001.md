---
task_id: "TASK-lesson-status-001"
branch: "feat/lesson-status"
version: "2.0.0"
priority: "P1"
status: "DONE"
assigned_executor: "unassigned"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "prisma/schema.prisma"
    - "scripts/add-lesson-status.ts"
    - "lib/roadmap/status.ts"
    - "lib/roadmap/types.ts"
    - "app/api/v1/roadmaps/**"
    - "logic/roadmap/roadmapService.ts"
    - "hooks/use-roadmap.ts"
    - "components/roadmap/**"
    - "app/page.tsx"
  read_only_references:
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "GLOSSARY.md"
    - "lib/auth/write-access.ts"
  strictly_forbidden:
    - "prisma/dev.db"
    - "docs/adr/**"
    - "GLOSSARY.md"

verification_gate:
  type_check: "npx tsc --noEmit -p tsconfig.json"
  lint: "yarn lint"
  test: "yarn test"
  boundary_check: "git status --porcelain"
---

# TASK: Lesson Status — Bước 2 (schema, API, UI)

> Đã merge vào `main` ngày 2026-11-05. Step 6 và mục 6 (việc mở) là việc tiếp theo, chưa làm.

## 1. Context & Architectural Intent
- **Goal**: Mỗi Lesson có trạng thái `target` / `learning` / `known` (ADR-0010). Owner thấy và đổi được trên trang roadmap. Visitor không thấy.
- **Why**: Roadmap thành "second brain" của Owner: vừa là kiến thức đã có, vừa là danh sách muốn học, cập nhật theo thời gian. Roadmap Assistant sẽ dựa vào trạng thái để cá nhân hoá (Bước 3, chưa làm).
- **Dependencies**: `docs/adr/0010-lesson-status-known-learning-target.md`, `GLOSSARY.md` (Lesson Status), `lib/roadmap/status.ts`.

## 2. Invariants & Rules
- **Không merge branch này vào `main` trước khi Turso có cột mới.** Prisma client sinh từ schema mới truy vấn `status` và `statusUpdatedAt`; production build trên DB chưa migrate sẽ lỗi ở mọi query bài học.
- Migration chỉ chạy qua `scripts/add-lesson-status.ts`: mặc định dry-run, ghi khi có `--apply`, tự backup `RoadmapItem` ra `lesson-status-backup-*.json` (đã gitignore). Agent bị chặn chạy `--apply` trên Turso (production): Owner tự chạy.
- Lesson Status là dữ liệu cá nhân: chỉ trả cho caller có write access (`hasWriteAccess`). `full-export` không bao giờ trả, vì nó công khai và là nguồn index RAG.
- Bài tạo mới không nêu trạng thái là `known`. `statusUpdatedAt` chỉ đổi khi trạng thái thực sự đổi.
- Không commit `prisma/dev.db` (đang bị sửa từ trước, không rõ nguồn).

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Docs, đã lên `main`)**: GLOSSARY thêm Lesson Status; ADR-0010; `docs/README.md`.
- [x] **Step 1 (Schema/Type)**: `RoadmapItem.status String @default("known")`, `statusUpdatedAt DateTime?`; `lib/roadmap/status.ts`; `ChecklistItem.status?`, `statusUpdatedAt?`.
- [x] **Step 2a (Migration script)**: `scripts/add-lesson-status.ts`, `yarn db:lesson-status`. Dry-run trên Turso ngày 2026-11-05 (hai lần): 2 topic, 0 bài, 2 cột sẽ được thêm. Turso từ đầu đã không có bài nào, nên không có dữ liệu cần chuyển.
- [x] **Step 2b (xong 2026-11-05, agent chạy theo yêu cầu của Owner)**: backup `lesson-status-backup-1793868152963.json` (local, gitignore). Dry-run lại báo "Nothing to do"; đã `prisma generate` theo schema của branch và khởi động lại dev; `GET /api/v1/roadmaps`, `/ai-engineering`, `/ai-architecture` đều 200, `full-export` không có `status`. Lệnh gốc: `yarn db:lesson-status --apply` trên Turso, rồi `yarn db:lesson-status` phải báo "Nothing to do". Sau đó `npx prisma generate` và khởi động lại `yarn dev`.
- [x] **Step 3 (API)**: `GET /api/v1/roadmaps/[slug]` chỉ thêm `status`/`statusUpdatedAt` khi `hasWriteAccess`; `full-export` bỏ hai trường; `POST /items` nhận `status` (validate, mặc định `known`); `PATCH /items/[id]` nhận `status`, đặt `statusUpdatedAt` khi đổi.
- [x] **Step 4a (Service/Hook)**: `roadmapService.updateItemStatus`; `useRoadmap().changeItemStatus` (cập nhật ngay, tải lại khi lỗi).
- [x] **Step 4b (UI list)**: `components/roadmap/LessonStatus.tsx` (`LessonStatusBadge`, `LessonStatusPicker`); `ChecklistItemRow` hiện badge cho `target` và `learning` (`known` là mặc định nên không gắn nhãn).
- [x] **Step 4c (UI detail)**: `DetailPanel` thêm prop `onChangeStatus?: (id: string, status: LessonStatus) => void`, truyền qua `DetailContent`, render `LessonStatusPicker` ngay dưới `<header>` khi `canWrite && item.status`. `app/page.tsx` truyền `onChangeStatus={changeItemStatus}` (lấy từ `useRoadmap`, cạnh `editItem`). Xong ở commit `188422f`. Cùng commit đó, `full-export` chuyển sang `select` liệt kê từng trường của bài (an toàn hơn so với destructure để bỏ trường, và hết cảnh báo lint).
- [x] **Step 5 (Verify, xong ngày 2026-11-05)**: typecheck, lint, test. Trên app: Owner thấy badge và đổi được trạng thái, F5 vẫn giữ. Visitor: `GET /api/v1/roadmaps/<slug>` không có `status`. Lưu ý `.env.local` có `DEV_OWNER_BYPASS=true`, local luôn là Owner; muốn thử Visitor thì tắt tạm cờ này. `GET /api/v1/roadmaps/full-export` không có `status`.
- [ ] **Step 6 (Bước 3, task sau, chưa làm)**: Roadmap Assistant đọc trạng thái (chỉ khi Actor là Owner) để trả lời "tôi đang biết gì về X", "nên học gì tiếp", "bài nào cần ôn lại", và đổi trạng thái qua chat có Preview.

## 4. Verification Gate Results (2026-11-05, commit `188422f`)
- [x] `TypeCheck`: PASS khi đã generate client theo schema của branch. Lỗi còn lại chỉ nằm ở `.next/types/validator.ts`: file cũ trỏ tới các route đã xoá, có từ trước, không liên quan.
- [x] `Lint`: không có lỗi mới. Lỗi `react-hooks/set-state-in-effect` ở `hooks/use-roadmap.ts:127` có sẵn trên `main`, cảnh báo `_req` trong `full-export` cũng vậy. Toàn repo đang có 168 lỗi lint có từ trước.
- [x] `Test`: PASS, `yarn test` 981 pass, 8 skip.
- [x] `Boundary Check`: chỉ có `prisma/dev.db` bị sửa, không commit.
- [x] **UI (Playwright, API giả lập)**: thay phản hồi `GET /api/v1/roadmaps/ai-engineering` bằng 3 bài known / learning / target. Kết quả: danh sách hiện badge cho learning và target, không hiện cho known. Panel chi tiết hiện picker 3 nút, nút đang chọn có `aria-pressed`. Bấm "Mục tiêu" gửi `PATCH /items/l2` với body `{"status":"target"}`. Bấm "Đã nắm" thì badge ở danh sách biến mất.
- [x] **End-to-end trên Turso (Playwright headless, topic test `zz-status-test`, đã xoá sau khi thử)**:
  - API: bài tạo không nêu trạng thái là `known`, `statusUpdatedAt` null. Tạo với `target` được 201. Tạo với `mastered` bị 400. PATCH `learning` được 200 và đặt `statusUpdatedAt`; PATCH `xx` bị 400. PATCH lại đúng trạng thái đang có thì `statusUpdatedAt` giữ nguyên. `full-export` chỉ có các trường id, roadmapId, section, title, description, content, order, createdAt, updatedAt.
  - UI: danh sách hiện badge "Đang học" và "Mục tiêu". Picker đổi từ "Mục tiêu" sang "Đã nắm", F5 vẫn giữ "Đã nắm", DB ghi `known` cùng thời điểm đổi.
  - Visitor: kiểm bằng `tests/route/lesson-status-visibility.test.ts` (mock `hasWriteAccess`). Owner nhận `status` và `statusUpdatedAt`; Visitor không nhận trường nào. Không thử trên server thật, vì ở dev `DEV_OWNER_BYPASS` khiến mọi request đều là Owner.

**Prisma client local:** đã generate theo schema của branch sau Step 2b. Nếu checkout về `main` trước khi merge thì generate lại.

## 5. Execution Audit Log
- **Git Commit Hash**: xem `git log feat/lesson-status`
- **Modified Files**:
  - `prisma/schema.prisma`, `scripts/add-lesson-status.ts`, `package.json` (script `db:lesson-status`), `.gitignore`
  - `lib/roadmap/status.ts`, `lib/roadmap/types.ts`
  - `app/api/v1/roadmaps/[slug]/route.ts`, `app/api/v1/roadmaps/full-export/route.ts`, `app/api/v1/roadmaps/items/route.ts`, `app/api/v1/roadmaps/items/[id]/route.ts`
  - `logic/roadmap/roadmapService.ts`, `hooks/use-roadmap.ts`
  - `components/roadmap/LessonStatus.tsx`, `components/roadmap/ChecklistItemRow.tsx`

## 6. Việc mở ngoài task này (chỉ có trong hội thoại 2026-11-05, ghi lại để không mất)
Không thuộc boundary của task này. Hỏi Owner trước khi làm.
1. **Composer chat trên mobile chưa thử trên Android thật.** Commit `9520924` (trên `main`) tắt autofill strip (`autoComplete="off"`, `data-lpignore`, `data-1p-ignore`, ...) và chống nháy khi bấm Back (`useVisualViewportBox` gộp update bằng rAF). Chỉ mới kiểm bằng Playwright giả lập mobile. Cần Owner thử trên máy thật và báo trình duyệt, phiên bản Android.
2. **Nút 👍/👎 ở chat portfolio (`FloatingChat*`) vẫn hiện.** Chat roadmap đã ẩn bằng `FEEDBACK_ENABLED = false` trong `components/roadmap/RoadmapAssistantChatbot.tsx`, vì chưa có rule Triage cho vote. Owner chưa chốt có ẩn luôn ở portfolio không.
3. **Gợi ý cập nhật nội dung bài (bước 4 của lộ trình second brain) còn hai câu hỏi mở:** bao lâu không cập nhật thì coi là cũ; có được tìm nguồn trên web để gợi ý không. Chưa làm gì, chưa có ADR.
4. **"Visitor không thấy Lesson Status"** là mặc định agent tự chọn khi viết ADR-0010, Owner chưa xác nhận rõ. Nếu Owner muốn công khai thì cần ADR mới (không sửa ADR-0010).

Còn tồn đọng khác, đã ghi ở chỗ riêng: lỗi 2 và lỗi 8 trong `tests/manual/assistant-sections.md`; mục 5–9 trong `docs/abot-next-actions-plan.md`; hai test fail có từ trước (router stress baseline: wrong_branch 107 > 103; `test_evals_answer_target` phụ thuộc `dev.db`).
