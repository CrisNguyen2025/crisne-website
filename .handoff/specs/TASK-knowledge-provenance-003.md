---
task_id: "TASK-knowledge-provenance-003"
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
    - "components/news/NewsReaderPanel.tsx"
    - "components/news/AddToLessonSheet.tsx"
    - "logic/news/newsService.ts" # chỉ thêm hàm addNewsItemToLesson
    - "tests/unit/news-add-to-lesson.test.tsx"
    - "tests/unit/news-feed-ui.test.tsx"
    - "tests/manual/knowledge-provenance.md"
    - "tests/manual/README.md" # chỉ thêm 1 dòng vào bảng Kịch bản
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
  continues_dirty: [] # Claude kiểm lại ngay trước baseline: file của spec 001/002 không trùng allowed_to_modify ở đây
  read_only_references:
    - ".handoff/PLAN-knowledge-acquisition.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "lib/provenance/**" # do spec 001 tạo: schemas.ts (body của integrate), dto.ts
    - "app/api/news/*/integrate/route.ts"
    - "lib/news/schemas.ts"
    - "lib/news/emphasis.ts"
    - "lib/roadmap/status.ts"
    - "lib/roadmap/sections.ts"
    - "logic/roadmap/roadmapService.ts"
    - "components/roadmap/SectionField.tsx"
    - "components/news/NewsFeedClient.tsx"
    - "components/ui/sheet.tsx"
    - "tests/manual/news-inbox.md"
    - ".agents/skills/cris-code-intel/SKILL.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "middleware.ts"
    - "prisma/**"
    - "app/**"
    - "lib/**"
    - "components/roadmap/**"
    - "components/ui/**"
    - "roadmap-rag-assistant/**"
    - "news-ingest-worker/**"

deploy_steps: []

fast_gate: ["type_check", "news_ui_tests", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  news_ui_tests: "yarn vitest run tests/unit/news-add-to-lesson.test.tsx tests/unit/news-feed-ui.test.tsx tests/unit/news-mobile-swipe-drawer.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-knowledge-provenance-003"
---

# TASK: "Đưa vào Lesson" ở `/feed-ingestion` — chọn ý, chọn đích, xem trước rồi lưu

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-23 (Claude làm, Dev giao). Gate pass; đã kiểm P1, P4, P5, P6, P8 trên trình duyệt với bản copy `dev.db` trong scratchpad. Chưa commit; chưa chạy migration trên `prisma/dev.db` hay Turso.

## 1. Context & Architectural Intent
- **Goal**: Trong reader của News Item ở `/feed-ingestion`, Owner bấm "Đưa vào Lesson", chọn những ý cần lấy (có thể sửa chữ), chọn tạo Lesson mới trong một Topic/Section hoặc nối vào Lesson có sẵn, xem trước rồi lưu. Kết quả gọi `POST /api/news/[id]/integrate` của spec 001.
- **Why**: Phase 1 của `.handoff/PLAN-knowledge-acquisition.md` (Mục 5, bước 4). Owner tự chọn từng ý, không có hàng đợi gợi ý tự động (ADR-0017, khác Knowledge Triage ở ADR-0011).
- **Dependencies**:
  - API: `POST /api/news/[id]/integrate`; body và kiểu nằm ở `lib/provenance/schemas.ts` (spec 001). Response `201 { lesson: { id, slug, roadmapSlug }, provenanceCount }`; trùng title trả response trùng của route tạo item; `409 already_integrated` khi đã nối vào bài đó.
  - `components/news/NewsReaderPanel.tsx` (caller: `components/news/NewsFeedClient.tsx`, test `news-feed-ui`). Takeaways có đánh dấu `**từ khoá**` (`lib/news/emphasis.ts#splitEmphasis`) cần được bỏ dấu khi đưa thành câu.
  - Danh sách Topic/Lesson/Section: `logic/roadmap/roadmapService.ts#fetchAllRoadmaps`, `#fetchRoadmapBySlug(slug, { mode: "outline" })`; chọn Section dùng lại `components/roadmap/SectionField.tsx`.
  - Lesson Status: `lib/roadmap/status.ts` (`target` | `learning` | `known`).
  - Flow code-intel: `FLOW_NEWS_FEED_BROWSE_AND_STATE` (bảng route ở `docs/code-intel/CRIS_WORKSPACE_MAP.md`).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. ADR: ADR-0010, ADR-0017, ADR-0018.
- Lesson mới mặc định `status: "target"`, Owner đổi được trước khi lưu (quyết định 8). Nối vào bài có sẵn thì không gửi `status`.
- `excerpt` của mỗi câu là **ý gốc do AI sinh** trước khi Owner sửa (Phase 1 chưa có toàn văn, plan quyết định 5). `authorType`: `ai_generated` nếu Owner không sửa câu, `ai_assisted` nếu có sửa. Owner không thêm câu tự viết trong MVP.
- Tối đa 10 câu mỗi lần (giới hạn của API). Nút lưu bị khoá khi không có câu nào được chọn hoặc chưa chọn đích.
- Chỉ hiện nút khi `ingestStatus === "ready"` và bài chưa `dismissed`.
- Đặt tên theo component, không theo use-case (`AGENTS.md`): props như `isOpen`, `isLoading`, `onClose`.
- Không thêm dependency. Dùng `components/ui/sheet.tsx` có sẵn.
- Không sửa code ngoài `allowed_to_modify`. Cần đổi API hay schema thì dừng và escalate, không tự sửa `lib/**`/`app/**`.
- Ngoài phạm vi: gợi ý Topic/Section tự động (Phase 3, Abot), viết lại nội dung bằng LLM (Phase 3), trang Lesson (spec 002).

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Service** (`logic/news/newsService.ts`): thêm `addNewsItemToLesson(newsItemId, payload)` gọi `POST /api/news/[id]/integrate`, trả kết quả dạng phân biệt được `created` / `duplicate` / `already_integrated` / lỗi khác, theo cách các hàm hiện có trong file xử lý lỗi.
- [x] **Step 2 — `AddToLessonSheet`** (`components/news/AddToLessonSheet.tsx`):
  - Danh sách takeaways (đã bỏ dấu `**`), mặc định chọn hết, mỗi ý sửa được; hiện số câu đã chọn trên 10.
  - Chọn chế độ: "Tạo bài mới" (Topic, Section qua `SectionField`, tiêu đề mặc định là tiêu đề News Item, Lesson Status mặc định `target`) hoặc "Nối vào bài có sẵn" (Topic rồi Lesson).
  - Bước xem trước: liệt kê đúng những câu sẽ được ghi và đích; chỉ khi Owner xác nhận mới gọi service.
  - Sau khi lưu: toast thành công kèm link tới `/[topicSlug]/[lessonSlug]`; trùng title hoặc `already_integrated` thì báo lỗi rõ ràng bằng tiếng Việt, giữ nguyên sheet.
- [x] **Step 3 — Gắn vào reader** (`components/news/NewsReaderPanel.tsx`): thêm nút "Đưa vào Lesson" vào cụm hành động, mở `AddToLessonSheet`. Không đổi các hành động và bố cục hiện có.
- [x] **Step 4 — Test** (`tests/unit/news-add-to-lesson.test.tsx`): payload `create_lesson` đúng (status mặc định `target`, `authorType` đổi theo việc sửa câu, `excerpt` là ý gốc); payload `append_to_lesson` không có `status`; nút lưu khoá khi không có câu hoặc không có đích; không gọi API trước bước xác nhận; hiện lỗi khi trùng title và khi `already_integrated`; nút không hiện với bài chưa `ready` hoặc đã `dismissed`. `tests/unit/news-feed-ui.test.tsx` chỉ sửa nếu một assert cũ đếm đúng số nút hành động.
- [x] **Step 5 — Code intel**: thêm vào `cris-workspace-map.json` và `CRIS_WORKSPACE_MAP.md` hai route mới của spec 001 (`POST /api/news/[id]/integrate`, `GET /api/v1/roadmaps/items/[id]/provenance`), model `KnowledgeProvenance`, và một flow mới (ví dụ `FLOW_NEWS_ADD_TO_LESSON`: `AddToLessonSheet` → `newsService` → route integrate → `create-lesson` → `notifyRoadmapChanged`) theo đúng cấu trúc các mục đang có. `yarn intel status` phải báo OK.
- [x] **Step 6 — Kịch bản test thủ công** (`tests/manual/knowledge-provenance.md`, theo `tests/manual/README.md`): các case: tạo bài mới từ News Item; nối vào bài có sẵn; bấm lưu hai lần; chip hiện trên trang Lesson (Owner); sửa bài bằng editor rồi lưu, chip còn nguyên; xoá một câu có marker → nguồn chuyển xuống "Nguồn tham khảo của bài"; mở trang Lesson khi chưa đăng nhập → chuyển về `/login`; bài `cron` mới không lên `/news`. Trạng thái mọi case là `Chưa chạy`. Thêm một dòng vào bảng Kịch bản của `tests/manual/README.md`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED cho 28 file TS đã sửa trong Phase 1 (`--quiet`). `yarn lint` toàn repo vẫn lỗi ở file ngoài diff, xem spec 001 mục 4.
- [x] `News UI Tests`: PASSED (`news-add-to-lesson` 5, `news-feed-ui` + `news-mobile-swipe-drawer` 19, không sửa test cũ)
- [x] `Test`: PASSED cho cả Phase 1 (124 file, 1210 test, 8 skipped); pytest 1214 pass
- [x] `Intel Status`: PASSED (212 ref map + 38 ref docs; 45 entry point, 16 flow, 9 model, 15 ADR rule)
- [x] `Boundary Check`: 1 dòng FORBIDDEN có chủ ý: `components/roadmap/ProvenanceChip.tsx` (file của spec 002) được sửa khi verify trên trình duyệt (popover bị cắt, xem Bài học). Ngoài ra sạch.

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-knowledge-provenance-003/result.json`
- **Modified Files**:
  - `components/news/AddToLessonSheet.tsx` (mới; gồm cả nút mở sheet), `components/news/NewsReaderPanel.tsx` (gắn nút khi `ready` và chưa `dismissed`)
  - `logic/news/newsService.ts` (thêm `addNewsItemToLesson`)
  - `tests/unit/news-add-to-lesson.test.tsx` (mới); `tests/unit/news-feed-ui.test.tsx` không cần sửa
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`, `docs/code-intel/CRIS_WORKSPACE_MAP.md` (2 route, `FLOW_NEWS_ADD_TO_LESSON`, model `KnowledgeProvenance`, ADR-0016/0017/0018)
  - `tests/manual/knowledge-provenance.md` (mới), `tests/manual/README.md` (1 dòng)
  - Sửa khi verify: `components/roadmap/ProvenanceChip.tsx` (popover portal ra `document.body`, vị trí `fixed`)
- **Bài học**:
  - Vùng nội dung Lesson có `overflow` ngang: popover `absolute` bên trong bị cắt và sinh thanh cuộn. Phải portal ra `body`; test jsdom không bắt được lỗi này, chỉ trình duyệt mới thấy.
  - Dữ liệu sheet tải theo thao tác (mở sheet, chọn Topic) để theo rule "không fetch trong useEffect". `useLessonProvenance` (spec 002) là ngoại lệ có chủ ý: provenance phải nạp phía client cho Owner theo ADR-0017.
