---
task_id: "TASK-topic-url-migration-001"
branch: "feat/topic-url-migration"
version: "1.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "prisma/schema.prisma"
    - "prisma/init-turso.sql"
    - "scripts/migrate-roadmap-item-slugs.ts"
    - "app/page.tsx"
    - "app/topic/**"
    - "app/sitemap.ts"
    - "lib/roadmap/**"
    - "lib/utils.ts"
    - "hooks/use-roadmap.ts"
    - "components/roadmap/**"
    - "logic/roadmap/**"
    - "app/api/v1/roadmaps/**"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/**"
    - "roadmap-rag-assistant/tests/**"
    - "roadmap-rag-assistant/evals/**"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
  read_only_references:
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "GLOSSARY.md"
    - ".handoff/specs/TASK-topic-chapters-001.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "CLAUDE.md"
    - "AGENTS.md"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test && yarn test:schema-sql --check && yarn check:knowledge-index"
  python: "cd roadmap-rag-assistant && python -m pytest -q && python -m evals validate"
  boundary_check: "git status --porcelain"
---

# TASK: Topic/Lesson dùng URL path thay cho query string

## 1. Context & Architectural Intent

- **Goal**: Thay `/` + `?topic=<slug>&item=<id>` (query string, chỉ sống trong 1 client component `app/page.tsx`) bằng URL path `/topic/[topicSlug]/[itemSlug]`, có thể share/deep-link, giữ `?section=` làm query (view state, không phải identity). Giữ redirect từ URL cũ sang URL mới.
- **Why**: Owner muốn clone nhiều topic mới (Next.js, NestJS, Golang...) và test khả năng Abot phân tách context giữa nhiều stack — pilot đầu tiên là Next.js (`PLAN-nextjs-topic-pilot.md`, chờ duyệt riêng). URL path ổn định là điều kiện để link citation của Abot, sitemap, và chia sẻ bài học hoạt động đúng khi số lượng topic tăng. Việc này được Owner chốt làm trước (ưu tiên 1/2 trong phòng), trước ACI audit và trước khi pilot Next.js seed data.
- **Hiện trạng xác nhận bằng code** (không suy diễn):
  - Không có route `/topic/...` nào tồn tại. Toàn bộ dashboard roadmap render tại `app/page.tsx` (`"use client"`), dùng `nuqs` (`useQueryState`) đọc `?topic=`, `?item=`, `?section=` (`app/page.tsx:47-56`).
  - `RoadmapItem` (`prisma/schema.prisma:32-49`) **không có field `slug`** — chỉ `id` (uuid7) và `@@unique([roadmapId, title])`. Phải thêm `slug` mới để path `[itemSlug]` tồn tại được.
  - Link citation Abot hiện là `/?topic={topic_slug}&item={doc.id}` — dùng UUID thô, không phải slug (`roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py:48-51`).
  - Format `/?topic=` được validate/allowlist ở 3 nơi Python: `rag_service/domains/roadmap/links.py` (regex `TOPIC_URL`), `rag_service/core/generation/citation.py` + `cite_channel.py` (output guard chặn link lạ), `rag_service/domains/roadmap/prompts.py` (ví dụ link trong system prompt cho LLM).
- **Dependencies**: `lib/roadmap/resolveRoadmap.ts#findTopic`, `lib/utils.ts#slugify`, `app/page.tsx` (`RoadmapWorkspace`), `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py#knowledge_href`, `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py#KnowledgeDocument`.

## 2. Quyết định đã chốt làm default (Owner có thể sửa lại trước khi merge)

| # | Quyết định | Default áp dụng |
|---|---|---|
| D1 | Có thêm field `slug` cho `RoadmapItem`? | **Có.** `slug String`, sinh một lần bằng `slugify(title)` lúc tạo item (cùng hàm `lib/utils.ts#slugify` đã dùng cho `Roadmap.slug`). `@@unique([roadmapId, slug])`. Giữ nguyên `@@unique([roadmapId, title])`. |
| D2 | Slug có đổi theo khi sửa title không? | **Không.** Slug cố định từ lúc tạo, để link Abot đã sinh ra không bao giờ gãy. Owner cần đổi slug thủ công thì để task sau (chưa làm UI đổi slug). |
| D3 | Trùng slug khi 2 title khác nhau slugify giống nhau? | Script backfill và route tạo item tự thêm hậu tố `-2`, `-3`... khi trùng trong cùng `roadmapId`. |
| D4 | URL cũ `/?topic=&item=` còn hoạt động không? | **Có, giữ vĩnh viễn** (redirect 307 sang URL mới), không xoá — phòng link cũ đã chia sẻ/cache. |
| D5 | `?section=` theo path hay giữ query? | Giữ query (`?section=`), vì là trạng thái UI (mục nào đang mở), không phải định danh thực thể. |

Đây không phải quyết định mô hình miền (domain) mới nằm trong Glossary/ADR — chỉ là contract URL + 1 cột kỹ thuật, nên không cần buổi `/grill-with-docs`. Nếu Antigravity thấy cần ADR khi làm, dừng lại và báo, không tự viết vào `docs/adr/`.

## 3. Invariants & Rules

- Không đổi hành vi 👍/👎 của Cris AI (`app/api/chat/feedback/route.ts`, `lib/ai/langfuse.ts`) — ngoài phạm vi task này, không chạm.
- Cris AI / `/portfolio` / `hooks/use-floating-chat.ts` / `components/floating-bot/**`: ngoài phạm vi (xem `AGENTS.md` mục Phạm vi hiện tại) — không sửa.
- Không đổi field `section` hiện có hay đụng vào `TASK-topic-chapters-001` (đang DRAFT, chờ ADR riêng) — task này chỉ thêm `slug`, không đổi `section`.
- `useEffect` không fetch data (dùng Server Component/server action); Server Component là default, chỉ thêm `"use client"` khi cần.
- Rename symbol dùng GitNexus rename (`gitnexus_rename`), không find-and-replace.

## 4. Step-by-Step Implementation Checklist

**Schema & backfill**
- [x] Thêm `slug String` vào `RoadmapItem` (`prisma/schema.prisma`), `@@unique([roadmapId, slug])`, cập nhật `prisma/init-turso.sql` DDL tương ứng (theo mẫu `scripts/push-turso-schema.ts` đang dùng).
- [x] Viết `scripts/migrate-roadmap-item-slugs.ts` (idempotent, giống phong cách `scripts/flatten-to-sections.ts`): sinh `slug = slugify(title)` cho mọi item chưa có slug, xử lý trùng theo D3.
- [x] Cập nhật `app/api/v1/roadmaps/items/route.ts` (POST) để sinh `slug` lúc tạo item mới; `app/api/v1/roadmaps/items/[id]/route.ts` (PATCH) không cho sửa `slug` qua API (D2).
- [x] Thêm `slug` vào `GetRoadmapResponseDto`/`ChecklistItem` (`lib/roadmap/types.ts`) để API `/api/v1/roadmaps/[slug]` trả về slug của từng item.

**Frontend route**
- [x] Tạo `app/topic/[topicSlug]/page.tsx` và `app/topic/[topicSlug]/[itemSlug]/page.tsx` (Server Component): resolve `topicSlug` → `Roadmap` (dùng `findTopic`), resolve `itemSlug` → item id (thêm `findItemBySlug` vào `lib/roadmap/resolveRoadmap.ts`); 404 (`notFound()`) nếu không có. Không fetch trong `useEffect`.
- [x] Refactor `RoadmapWorkspace` (`app/page.tsx`) để nhận `topic`/`item` ban đầu qua props (từ route mới) thay vì chỉ qua `useQueryState`; giữ `?section=` qua `nuqs` như hiện tại.
- [x] Trong `app/page.tsx` (route `/`): nếu có `?topic=` trong `searchParams` (server-side), `redirect()` 307 sang `/topic/<slug>` hoặc `/topic/<slug>/<itemSlug>` (resolve id→slug qua D1), giữ `?section=` nếu có. Không có `?topic=` → render Home Dashboard như cũ.
- [x] Soát mọi nơi trong `components/roadmap/**` và `hooks/use-roadmap.ts` đang tự dựng link `?topic=&item=` (copy-link, share, mở lesson) → đổi sang path mới.
- [x] Thêm `loading.tsx`/`error.tsx` cho 2 route mới (`app/topic/[topicSlug]/`, `app/topic/[topicSlug]/[itemSlug]/`), bọc phần fetch trong Suspense.
- [x] `app/sitemap.ts`: thêm entry cho topic/item không `isLocked` (theo đúng cách đang lọc quyền hiện có, không lộ item có `status` riêng tư của Owner nếu status không nên public — kiểm tra lại với cách Home/DetailPanel đang phân biệt visible-to-owner vs public trước khi thêm).

**RAG service (Python)**
- [x] `ingestion.py#KnowledgeDocument`: thêm field `item_slug: Optional[str]`, lấy từ `item.get("slug")` của response topic (sau khi Next.js trả slug ở bước schema).
- [x] `engine.py#knowledge_href`: đổi thành `f"/topic/{doc.topic_slug}/{doc.item_slug}"` cho item, `f"/topic/{doc.topic_slug}"` cho topic.
- [x] `links.py` (`TOPIC_URL` và mọi regex liên quan): đổi sang match `/topic/<slug>(/<item-slug>)?`.
- [x] `prompts.py`: đổi toàn bộ ví dụ link mẫu trong system prompt sang format mới.
- [x] `core/generation/citation.py` + `cite_channel.py` (output guard allowlist link): đổi regex nhận diện link nội bộ hợp lệ.
- [x] Cập nhật test/eval đang hardcode format cũ: `tests/test_steps.py`, `tests/test_sources_metadata.py`, `tests/test_generation_pipeline.py`, `tests/test_output_guard.py`, `evals/smoke_live.py` (`LINK` regex), `evals/target.py` nếu có regex citation tương tự.

**Đồng bộ & verify**
- [x] `yarn check:knowledge-index` xanh; cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json` nếu route/flow đổi tên.
- [x] Chạy đủ `verification_gate` phía dưới, dán kết quả từng lệnh kèm `file:line` nếu fail.
- [x] Không re-test case `Pass` trong `tests/manual/` nếu không liên quan; nếu route/lesson-reader đổi hành vi, thêm/ghi kết quả theo `tests/manual/README.md`.

## 5. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED
- [x] `Test` (`yarn test` + `test:schema-sql --check` + `check:knowledge-index`): PASSED
- [x] `Python` (`pytest` + `evals validate`): PASSED
- [x] `Boundary Check`: PASSED

## 6. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-topic-url-migration-001/result.json`
- **Modified Files**:
  - `prisma/schema.prisma`
  - `prisma/init-turso.sql`
  - `scripts/migrate-roadmap-item-slugs.ts`
  - `app/api/v1/roadmaps/items/route.ts`
  - `app/api/v1/roadmaps/items/[id]/route.ts`
  - `app/api/v1/roadmaps/[slug]/route.ts`
  - `lib/roadmap/types.ts`
  - `lib/roadmap/resolveRoadmap.ts`
  - `app/page.tsx`
  - `components/roadmap/RoadmapWorkspace.tsx`
  - `app/topic/[topicSlug]/page.tsx`
  - `app/topic/[topicSlug]/loading.tsx`
  - `app/topic/[topicSlug]/error.tsx`
  - `app/topic/[topicSlug]/[itemSlug]/page.tsx`
  - `app/topic/[topicSlug]/[itemSlug]/loading.tsx`
  - `app/topic/[topicSlug]/[itemSlug]/error.tsx`
  - `hooks/use-roadmap.ts`
  - `logic/roadmap/roadmapAssistantService.ts`
  - `app/sitemap.ts`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/links.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py`
  - `roadmap-rag-assistant/tests/conftest.py`
  - `roadmap-rag-assistant/tests/fixtures/schema.sql`
  - `roadmap-rag-assistant/tests/test_generation_pipeline.py`
  - `roadmap-rag-assistant/tests/test_output_guard.py`
  - `roadmap-rag-assistant/tests/test_sources_metadata.py`
  - `roadmap-rag-assistant/tests/test_steps.py`
  - `roadmap-rag-assistant/evals/smoke_live.py`
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`
