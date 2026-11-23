---
task_id: "TASK-knowledge-provenance-001"
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
    - "prisma/schema.prisma"
    - "prisma/init-turso.sql"
    - "roadmap-rag-assistant/tests/fixtures/schema.sql"
    - "scripts/add-knowledge-provenance.ts"
    - "package.json" # chỉ thêm đúng 1 dòng script `db:knowledge-provenance`, không đụng dependencies
    - "lib/news/ingest.ts"
    - "lib/provenance/**"
    - "lib/roadmap/create-lesson.ts"
    - "app/api/v1/roadmaps/items/route.ts"
    - "app/api/v1/roadmaps/items/*/provenance/route.ts" # `*` thay cho [id]: check-boundary so glob của bash, [id] là character class
    - "app/api/news/*/integrate/route.ts"
    - "tests/unit/provenance-markers.test.ts"
    - "tests/route/lesson-provenance-route.test.ts"
    - "tests/route/news-integrate-route.test.ts"
    - "tests/route/news-ingest-route.test.ts"
    - "tests/route/news-sources-cron-route.test.ts"
  continues_dirty: []
  read_only_references:
    - ".handoff/PLAN-knowledge-acquisition.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "docs/adr/0014-topic-scoped-urls-and-heading-anchors.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "docs/adr/0018-owner-only-site-except-public-news.md"
    - "scripts/add-news-public.ts"
    - "scripts/export-test-schema.ts"
    - "lib/auth/write-access.ts"
    - "lib/roadmap/duplicates.ts"
    - "lib/roadmap/sections.ts"
    - "lib/roadmap/status.ts"
    - "lib/roadmap/rag-reindex.ts"
    - "lib/roadmap/content-utils.ts"
    - "lib/news/schemas.ts"
    - "lib/news/public-queries.ts"
    - "app/api/v1/roadmaps/items/*/content/route.ts"
    - "tests/route/write-routes-guard.test.ts"
    - "tests/route/news-public-queries.test.ts"
    - "tests/setup/**"
  strictly_forbidden:
    - "yarn.lock"
    - "tsconfig.json"
    - "middleware.ts"
    - "prisma/dev.db"
    - "lib/roadmap/queries.ts"
    - "app/api/v1/roadmaps/full-export/**"
    - 'app/\[topicSlug\]/**' # ngoặc vuông phải escape cho glob của bash
    - "lib/r2-client.ts"
    - "news-ingest-worker/**"
    - "roadmap-rag-assistant/rag_service/**"
    - "components/**"

deploy_steps:
  - "Sau khi merge: Owner chạy `yarn db:knowledge-provenance` (dry-run trên Turso), xem output, rồi `yarn db:knowledge-provenance --apply`. Bước này tạo bảng `KnowledgeProvenance` và thêm cột `NewsItem.extractedAt` (ADR-0005: Turso không chạy prisma migrate)."
  - "Không có biến môi trường mới. Không cần reindex Abot (provenance không vào index, ADR-0017)."

fast_gate: ["type_check", "provenance_tests", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  schema_sql: "yarn test:schema-sql --check"
  provenance_tests: "yarn vitest run tests/unit/provenance-markers.test.ts tests/route/lesson-provenance-route.test.ts tests/route/news-integrate-route.test.ts tests/route/news-ingest-route.test.ts tests/route/news-sources-cron-route.test.ts tests/route/news-public-queries.test.ts tests/route/roadmap-duplicates.test.ts tests/route/lesson-slug-and-move.test.ts tests/route/write-routes-guard.test.ts"
  test: "yarn test"
  python_tests: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-knowledge-provenance-001"
---

# TASK: Provenance backend — bảng `KnowledgeProvenance`, API đọc provenance và API đưa News Item vào Lesson

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-23 (Claude làm, Dev giao). Mọi gate pass trừ `yarn lint` toàn repo, vốn lỗi ở file ngoài spec (xem mục 4). Chưa commit; chưa chạy migration Turso (`deploy_steps`).

## 1. Context & Architectural Intent
- **Goal**: Có dữ liệu và API để Owner đưa các ý của một News Item vào Lesson, mỗi câu kèm một marker provenance; và có API Owner-only để đọc lại provenance của một Lesson.
- **Why**: Phase 1 của plan Knowledge Acquisition. Mọi quyết định đã chốt ở Mục 7 của plan và trong ADR-0017/0018. Spec này chỉ làm backend; UI nằm ở spec 002 (trang Lesson, editor) và 003 (`/feed-ingestion`).
- **Dependencies**:
  - Plan: `.handoff/PLAN-knowledge-acquisition.md` Mục 3 (Bất biến 0–5), Mục 4.1–4.2 (schema), Mục 5 Phase 1, Mục 7 (quyết định 3, 4, 5, 8, 11).
  - `app/api/v1/roadmaps/items/route.ts#POST`: logic tạo Lesson (chặn trùng title, `allocateGlobalLessonSlug`, `sectionSpelling`, `order`, `status`). **Abot cũng gọi route này** (`roadmap-rag-assistant/rag_service/adapters/http_adapter.py`), nên response phải giữ nguyên.
  - `lib/news/ingest.ts#enqueueNewsUrl` (caller: `app/api/ingest/route.ts`, `lib/news/rss-fetcher.ts`), `lib/news/ingest.ts#completeIngestJob` (caller: `app/api/news/jobs/[id]/complete/route.ts`). Impact lấy bằng grep vì index GitNexus chưa có code News (2026-11-23).
  - Pattern migration: `scripts/add-news-public.ts` (dry-run mặc định, `--local`, `--apply`).
  - Flow: `FLOW_NEWS_FEED_BROWSE_AND_STATE`, `FLOW_NEWS_RSS_CRON_SYNC`, `FLOW_ABOT_CUD_PREVIEW_CONFIRM` (vì route tạo item dùng chung).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. ADR liên quan: ADR-0005 (SQLite/Turso), ADR-0010 (Lesson Status), ADR-0014 (slug toàn cục), ADR-0017 (Provenance Owner-only), ADR-0018 (site Owner-only trừ Public News).
- **Bất biến 0:** `claimRefKey` là UUID ngẫu nhiên (`crypto.randomUUID()`), duy nhất toàn cục. Marker chỉ có đúng dạng `<span data-provenance-ref="<uuid>"></span>`: rỗng text, không thêm thuộc tính nào khác, không suy ra được `newsItemId` hay URL.
- **Bất biến 1:** Không sửa `getLessonPageData()` (`lib/roadmap/queries.ts`) và `full-export`; hai chỗ này không bao giờ đọc `KnowledgeProvenance`. Route mới tự gọi `requireWriteAccess`, không trông vào middleware.
- **Bất biến 5 (đối chiếu lúc đọc):** Không thêm logic nào vào PATCH content. Không xoá provenance khi marker mất.
- `POST /api/v1/roadmaps/items` sau refactor phải giữ nguyên request, response, status code và lần gọi `notifyRoadmapChanged()`.
- `package.json`: chỉ thêm 1 dòng `"db:knowledge-provenance": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/add-knowledge-provenance.ts"`. Không thêm hay nâng dependency.
- Text Owner nhập phải được escape HTML trước khi ghép vào `content`.
- Ngoài phạm vi: UI (spec 002, 003), R2/snapshot (Phase 2), `KnowledgeRelation` (Phase 3), Abot đọc provenance (Phase 3), sửa lỗi `full-export` không kiểm quyền (task `fix/*` riêng trong BACKLOG), worker Python.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Schema** (`prisma/schema.prisma`): thêm model `KnowledgeProvenance` đúng Mục 4.2 của plan (không có `snapshotR2Key`, để Phase 2): `id` uuid(7), `lessonId` (FK `RoadmapItem`, `onDelete: Cascade`), `claimRefKey String @unique`, `newsItemId String?` (FK `NewsItem`, `onDelete: SetNull`), `sourceId String?` (không FK), `relationType String @default("derived_from")`, `sourceName`, `sourceUrl`, `sourceTitle`, `excerpt`, `authorType`, `collectedAt DateTime`, `extractedAt DateTime?`, `createdAt @default(now())`, `@@index([lessonId])`, `@@index([newsItemId])`. Thêm back-relation `provenances KnowledgeProvenance[]` vào `RoadmapItem` và `NewsItem`. Thêm `NewsItem.extractedAt DateTime?`.
- [x] **Step 2 — Đồng bộ schema**: thêm `CREATE TABLE IF NOT EXISTS "KnowledgeProvenance"` + index vào `prisma/init-turso.sql`, cùng cột `extractedAt` trong `CREATE TABLE "NewsItem"`. Sinh lại `roadmap-rag-assistant/tests/fixtures/schema.sql` bằng `yarn test:schema-sql` (không sửa tay); `yarn test:schema-sql --check` phải pass.
- [x] **Step 3 — Migration Turso**: tạo `scripts/add-knowledge-provenance.ts` theo pattern `scripts/add-news-public.ts`: dry-run mặc định, `--local` cho `prisma/dev.db`, `--apply`. Tạo bảng và index nếu chưa có; `ALTER TABLE "NewsItem" ADD COLUMN "extractedAt" DATETIME` nếu chưa có cột. Thêm dòng script vào `package.json`. **Không chạy `--apply`.**
- [x] **Step 4 — `/news` mặc định** (quyết định 3, `lib/news/ingest.ts#enqueueNewsUrl`): `isPublic: input.origin !== "cron"`, `publicAt` = `new Date()` khi public, `null` khi không. Sửa comment tương ứng. Cập nhật kỳ vọng trong `tests/route/news-ingest-route.test.ts` và `tests/route/news-sources-cron-route.test.ts` (chỉ những assert về `isPublic`/`publicAt` của bài cron), và thêm test: bài `cron` mới có `isPublic: false`; bài `share`/`manual` vẫn `true`.
- [x] **Step 5 — `extractedAt`** (`lib/news/ingest.ts#completeIngestJob`): khi outcome là `ready` hoặc `partial`, đặt `extractedAt: new Date()`. Server tự đóng dấu, worker không đổi gì.
- [x] **Step 6 — Helper marker** (`lib/provenance/markers.ts`): `createClaimRefKey()`, `buildProvenanceMarker(key)`, `extractProvenanceKeys(html)` (trả mảng key không trùng, theo thứ tự xuất hiện; chỉ nhận `data-provenance-ref` có giá trị UUID hợp lệ), `buildStatementsHtml(statements)` (mỗi statement → `<p>{text đã escape}{marker}</p>`). Test ở `tests/unit/provenance-markers.test.ts`: marker đúng một dạng duy nhất, `plainTextExcerpt` trên HTML có marker không sinh text thừa, escape `<script>`/`&`/`"`, key lạ hoặc không phải UUID bị bỏ qua.
- [x] **Step 7 — Tách logic tạo Lesson** (`lib/roadmap/create-lesson.ts`): chuyển phần thân của `POST /api/v1/roadmaps/items` (tìm roadmap, chặn trùng, cấp slug, `sectionSpelling`, `order`, `create`) thành hàm nhận Prisma client hoặc transaction client, trả kết quả dạng discriminated union (`ok` / `not_found` / `duplicate` / `invalid_status`). Route cũ gọi hàm này và giữ nguyên hành vi. `tests/route/roadmap-duplicates.test.ts` và `tests/route/lesson-slug-and-move.test.ts` phải pass mà không sửa.
- [x] **Step 8 — `GET /api/v1/roadmaps/items/[id]/provenance`** (`app/api/v1/roadmaps/items/[id]/provenance/route.ts`): `requireWriteAccess` trước mọi truy vấn; 404 khi không có Lesson; đọc `content`, `extractProvenanceKeys`, trả `{ provenances, orphans }` với `Cache-Control: no-store`. `provenances` = bản ghi có `claimRefKey` nằm trong content (thuộc Lesson nào cũng được), giữ thứ tự xuất hiện; `orphans` = bản ghi có `lessonId` là bài này mà không còn marker. DTO (đặt ở `lib/provenance/dto.ts`, spec 002 dùng lại): `claimRefKey`, `sourceName`, `sourceUrl`, `sourceTitle`, `excerpt`, `authorType`, `relationType`, `collectedAt`, `extractedAt` (ISO string hoặc `null`). Không trả `newsItemId`, `sourceId`, `lessonId`.
- [x] **Step 9 — `POST /api/news/[id]/integrate`** (`app/api/news/[id]/integrate/route.ts`, schema Zod ở `lib/provenance/schemas.ts`):
  - Body: `{ mode: "create_lesson", roadmapSlug, section?, title, description?, status? (mặc định "target"), statements }` hoặc `{ mode: "append_to_lesson", lessonId, statements }`. `statements`: 1–10 phần tử `{ text (1–1000 ký tự), excerpt (1–1000 ký tự), authorType: "human" | "ai_generated" | "ai_assisted" }`.
  - `requireWriteAccess`; 404 khi không có News Item; 409 khi `ingestStatus !== "ready"` hoặc `reviewStatus === "dismissed"`.
  - `create_lesson`: gọi hàm ở Step 7 với `content = buildStatementsHtml(...)`. Trùng title trong Topic thì trả đúng response trùng của route tạo item (chặn bấm hai lần).
  - `append_to_lesson`: 404 khi không có Lesson; 409 `already_integrated` khi đã có provenance với cặp (`newsItemId`, `lessonId`); nối HTML mới vào cuối `content` hiện có, giữ nguyên `status`.
  - Ghi Lesson (tạo hoặc cập nhật `content`) và mọi `KnowledgeProvenance` trong **một** `prisma.$transaction`. Metadata: `sourceName` = tên News Source nếu có, không thì `domain`; `sourceUrl` = `canonicalUrl`; `sourceTitle` = `title`; `collectedAt` = `NewsItem.createdAt`; `extractedAt` = `NewsItem.extractedAt`.
  - Thành công: gọi `notifyRoadmapChanged()` một lần, trả `201` với `{ lesson: { id, slug, roadmapSlug }, provenanceCount }`.
- [x] **Step 10 — Test route**:
  - `tests/route/lesson-provenance-route.test.ts`: 401 khi không đăng nhập; 401 khi chỉ có header `x-admin-key` sai giá trị; 404; `provenances` và `orphans` đúng sau khi xoá một marker khỏi `content`; marker copy sang Lesson khác vẫn nằm trong `provenances` của Lesson đó; response không có `newsItemId`/`sourceId`/`lessonId`.
  - `tests/route/news-integrate-route.test.ts`: tạo Lesson mới với `status: "target"` mặc định và HTML có đúng N marker; nối thêm vào Lesson có sẵn giữ `status`; bấm hai lần không tạo thêm bài hay provenance; 409 với item chưa `ready` hoặc `dismissed`; lỗi giữa chừng thì không còn Lesson hay provenance mồ côi (transaction); `notifyRoadmapChanged` được gọi một lần.
  - Dùng `tests/setup/isolated-test-db` như các test News khác. `tests/route/write-routes-guard.test.ts` tự phát hiện route POST mới và phải pass mà không sửa.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [ ] `Lint`: FAILED (không do spec này). `yarn lint` lỗi ở hai nhóm file ngoài diff: (1) build `.next` của worktree cũ `.claude/worktrees/news-security-perf/`; (2) 87 lỗi có sẵn khi bỏ qua `.claude/**` (`app/notes/NotesClient.tsx`, `lib/notion.ts`, `tests/e2e/**`, …). Tái hiện: `npx eslint . --ignore-pattern '.claude/**' --quiet`, nhánh `feat/knowledge-provenance` từ `ce7564a`, 2026-11-23. Mọi file của spec này lint sạch.
- [x] `Schema SQL`: PASSED
- [x] `Provenance Tests`: PASSED (9 file, 92 test)
- [x] `Test`: PASSED (121 file, 1197 test, 8 skipped)
- [x] `Python Tests`: PASSED (1214)
- [x] `Intel Status`: PASSED
- [x] `Boundary Check`: PASSED cho code. Hai dòng `OUT_OF_SCOPE` là spec 002/003 do Architect sửa sau baseline (đổi pattern `[id]` thành `*`).

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-knowledge-provenance-001/result.json`
- **Modified Files**:
  - `prisma/schema.prisma`, `prisma/init-turso.sql`, `roadmap-rag-assistant/tests/fixtures/schema.sql` (sinh lại), `package.json` (1 dòng script)
  - `scripts/add-knowledge-provenance.ts` (mới; dry-run `--local` đã chạy, chưa `--apply`)
  - `lib/news/ingest.ts`, `lib/roadmap/create-lesson.ts` (mới), `app/api/v1/roadmaps/items/route.ts`
  - `lib/provenance/{markers,dto,schemas}.ts` (mới), `app/api/v1/roadmaps/items/[id]/provenance/route.ts` (mới), `app/api/news/[id]/integrate/route.ts` (mới)
  - `tests/unit/provenance-markers.test.ts`, `tests/route/lesson-provenance-route.test.ts`, `tests/route/news-integrate-route.test.ts` (mới), `tests/route/news-ingest-route.test.ts`
  - `tests/route/news-sources-cron-route.test.ts`: không cần sửa (không assert `isPublic`).
- **Bài học**:
  - `check-boundary.sh` so pattern bằng glob của bash: `[id]` là character class. Dùng `*` hoặc escape `\[...\]` (YAML nháy đơn).
  - `createClaimRefKey` dùng `globalThis.crypto.randomUUID()` để file marker import được cả ở client (editor node).
