---
task_id: "TASK-owner-only-news-001"
branch: "feat/owner-only-news"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude" # Dev giao Claude làm (2026-11-23)
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "app/(public-news)/**" # xoá cả thư mục
    - "lib/news/public-queries.ts" # xoá
    - "components/news/public-news-format.ts" # xoá
    - "lib/auth/public-paths.ts" # xoá
    - "scripts/publish-existing-news.ts" # xoá
    - "package.json" # chỉ xoá dòng script "db:news-publish-existing"
    - "tests/route/news-public-queries.test.ts" # xoá
    - "tests/unit/public-paths.test.ts" # xoá
    - "app/(news)/feed-ingestion/**" # chuyển sang app/(news)/news/**
    - "app/(news)/news/**"
    - "app/(news)/layout.tsx"
    - "app/(news)/share/page.tsx"
    - "lib/news/paths.ts"
    - "next.config.ts" # chỉ thêm redirects()
    - "middleware.ts"
    - "app/manifest.ts"
    - "app/robots.ts"
    - "components/site-chatbot.tsx"
    - "components/news/ShareTargetClient.tsx"
    - "components/roadmap/PublicationHome.tsx"
    - "components/news/NewsReaderPanel.tsx"
    - "components/news/NewsFeedClient.tsx"
    - "components/news/NewsCard.tsx"
    - "lib/news/schemas.ts"
    - "lib/news/queries.ts"
    - "lib/news/ingest.ts" # chỉ bỏ phần gán isPublic/publicAt khi tạo item
    - "app/api/news/[[]id]/route.ts" # [[] là dấu [ theo nghĩa đen trong glob của check-boundary
    - "tests/route/middleware.test.ts"
    - "tests/route/news-item-patch-route.test.ts"
    - "tests/route/news-ingest-route.test.ts"
    - "tests/unit/news-feed-ui.test.tsx"
    - "tests/unit/news-add-to-lesson.test.tsx"
    - "tests/unit/news-share-target.test.tsx"
    - "tests/unit/news-mobile-swipe-drawer.test.tsx"
    - "tests/unit/smooth-behavior.test.tsx"
    - "tests/manual/news-public.md" # xoá
    - "tests/manual/news-inbox.md"
    - "tests/manual/knowledge-provenance.md"
    - "tests/manual/README.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
  continues_dirty: []
  read_only_references:
    - "docs/adr/0019-owner-only-site-no-public-news.md"
    - "docs/adr/0018-owner-only-site-except-public-news.md"
    - "GLOSSARY.md"
    - "lib/roadmap/paths.ts" # RESERVED_TOPIC_SLUGS đã có cả 'news' lẫn 'feed-ingestion', giữ nguyên
    - "lib/news/slug.ts"
    - "tests/manual/README.md"
    - ".agents/skills/cris-code-intel/SKILL.md"
  strictly_forbidden:
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**" # giữ cột isPublic, publicAt, slug; không migration
    - "scripts/add-news-public.ts"
    - "scripts/add-news-slug.ts"
    - "roadmap-rag-assistant/**"
    - "news-ingest-worker/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "app/api/chat/**"
    - "lib/ai/**"

deploy_steps: [] # không đổi schema, không thêm env

fast_gate: ["type_check", "news_tests", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  news_tests: "yarn vitest run tests/route/middleware.test.ts tests/route/news-item-patch-route.test.ts tests/route/news-ingest-route.test.ts tests/unit/news-feed-ui.test.tsx tests/unit/news-share-target.test.tsx tests/unit/news-add-to-lesson.test.tsx tests/unit/news-mobile-swipe-drawer.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-owner-only-news-001"
---

# TASK: Bỏ Public News, chuyển hộp News riêng của Owner từ `/feed-ingestion` về `/news`

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-23 (Claude làm, Dev giao sau khi dừng agy). Gate pass, boundary sạch; kiểm N11, N13 trên trình duyệt với DB copy trong scratchpad. Chưa commit. Phát hiện ngoài phạm vi: Turso production chưa có `NewsItem.extractedAt` (migration Phase 1 `yarn db:knowledge-provenance --apply` chưa chạy) nên trang News của Owner trên production lỗi 500. Đã chạy `--apply` trên Turso 2026-11-23 (Dev yêu cầu), dry-run lại báo "Schema already up to date", `/news` đọc Turso trả 200.

## 1. Context & Architectural Intent
- **Goal**: Cả site chỉ dành cho Owner. Không còn trang nào cho Visitor chưa đăng nhập đọc. Hộp News Item ở `/news`, quản lý News Source ở `/news/sources`. `/feed-ingestion` và `/feed-ingestion/sources` redirect sang đường mới.
- **Why**: ADR-0019 (thay ADR-0018). Hai tiền tố `/news` (public) và `/feed-ingestion` (riêng) gây nhầm: shortcut PWA cũ `/news/sources` đang trả 404 vì bị `/news/[slug]` bắt.
- **Dependencies**:
  - Flow code-intel: `FLOW_NEWS_PUBLIC_READ` (xoá), `FLOW_NEWS_PWA_SHARE_TARGET`, `FLOW_NEWS_INGEST_PIPELINE`, `FLOW_NEWS_FEED_BROWSE_AND_STATE` (đổi đường dẫn). Xem bằng `yarn intel trace <FLOW_ID>`.
  - Hằng đường dẫn: `lib/news/paths.ts#FEED_INGESTION_PATH`, `#FEED_INGESTION_SOURCES_PATH`. Caller: `app/(news)/**`, `components/news/ShareTargetClient.tsx`, `components/roadmap/PublicationHome.tsx`, `components/site-chatbot.tsx`.
  - Ngoại lệ middleware: `lib/auth/public-paths.ts#isPublicPagePath`, dùng ở `middleware.ts` và `components/site-chatbot.tsx`.
  - Bật/tắt Public: `NewsReaderPanel` (nút "Public"/"Đang public", `isPublishable`) → `NewsFeedClient#handleTogglePublic` → `PATCH /api/news/[id]` → `lib/news/queries.ts#updateNewsItem` (`NewsItemNotPublishableError`). Badge ở `NewsCard`. Mặc định `isPublic` khi tạo ở `lib/news/ingest.ts` (`enqueueNewsUrl`).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. ADR: ADR-0019 (chính), ADR-0002, ADR-0017.
- **Không đụng DB**: giữ cột `isPublic`, `publicAt`, `slug` trong `prisma/schema.prisma`, `prisma/init-turso.sql` và fixture schema của Python. Giữ việc cấp `slug` trong `lib/news/ingest.ts`. Chỉ bỏ code đọc/ghi `isPublic`/`publicAt` ở app (DTO, schema PATCH, UI, ingest).
- `UpdateNewsItemSchema` không nhận `isPublic` nữa. Body cũ có `isPublic` thì xử lý theo cách schema đang làm với field lạ (strip hoặc 400), miễn nhất quán và có test.
- **Đổi tên symbol**: `FEED_INGESTION_PATH` → `NEWS_PATH`, `FEED_INGESTION_SOURCES_PATH` → `NEWS_SOURCES_PATH`. Dùng GitNexus rename nếu có; không có thì đổi bằng TypeScript (tsc phải bắt hết caller), không find-and-replace mù cả repo.
- Redirect `/feed-ingestion` → `/news` và `/feed-ingestion/:path*` → `/news/:path*` bằng `redirects()` trong `next.config.ts`, giữ query string, `permanent: true`.
- Middleware sau khi sửa: mọi trang trừ `/login` đều bắt Owner. Các ngoại lệ kỹ thuật (header internal/admin, cron, health, matcher loại manifest/sw.js) giữ nguyên.
- `components/site-chatbot.tsx`: Abot vẫn ẩn trên `/news` và `/share` như đang ẩn trên `/feed-ingestion` (giữ behavior cho Owner). Sửa lại comment cho đúng lý do.
- `app/manifest.ts`: shortcut trỏ `/news`, `/news/sources`. `app/robots.ts`: thay `/feed-ingestion` bằng `/news` trong mọi `disallow`.
- Giữ `'news'` và `'feed-ingestion'` trong `RESERVED_TOPIC_SLUGS` (không sửa file).
- Text UI (tiêu đề "Feed Ingestion" ở layout/page) giữ nguyên.
- Không thêm dependency. Không đổi behavior luồng 👍/👎 của Cris AI.
- Ngoài phạm vi: sitemap/robots/JSON-LD của Lesson và việc tự kiểm quyền của route có `x-internal-key` (treo từ ADR-0018); xoá cột DB; sửa `.handoff/PLAN-*` cũ.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Xoá Public News**: xoá `app/(public-news)/`, `lib/news/public-queries.ts`, `components/news/public-news-format.ts`, `lib/auth/public-paths.ts`, `scripts/publish-existing-news.ts` và dòng `db:news-publish-existing` trong `package.json`, test `tests/route/news-public-queries.test.ts`, `tests/unit/public-paths.test.ts`.
- [x] **Step 2 — Chuyển route**: `git mv "app/(news)/feed-ingestion" "app/(news)/news"`. Đổi tên hằng trong `lib/news/paths.ts` sang `NEWS_PATH = "/news"`, `NEWS_SOURCES_PATH = "/news/sources"` và cập nhật caller. Thêm `redirects()` vào `next.config.ts`.
- [x] **Step 3 — Middleware và chatbot**: bỏ nhánh `isPublicPagePath` ở `middleware.ts`; `components/site-chatbot.tsx` ẩn theo `NEWS_PATH` và `/share`, không import `public-paths`.
- [x] **Step 4 — Gỡ bật/tắt Public**: bỏ nút và `isPublishable` ở `NewsReaderPanel`, `handleTogglePublic` ở `NewsFeedClient`, badge ở `NewsCard`; bỏ `isPublic` khỏi `UpdateNewsItemSchema` và DTO `isPublic`/`publicAt` trong `lib/news/schemas.ts`; bỏ nhánh `isPublic` và `NewsItemNotPublishableError` trong `lib/news/queries.ts` cùng phần bắt lỗi ở `app/api/news/[id]/route.ts`; bỏ gán `isPublic`/`publicAt` trong `lib/news/ingest.ts`.
- [x] **Step 5 — Manifest, robots**: như mục 2.
- [x] **Step 6 — Test**:
  - `tests/route/middleware.test.ts`: chưa đăng nhập vào `/news`, `/news/sources`, `/news/bat-ky` → redirect `/login?callbackUrl=…`; Owner vào `/news` → qua.
  - `tests/route/news-item-patch-route.test.ts`: bỏ case publish; thêm case body chứa `isPublic` theo quy tắc ở mục 2.
  - `tests/route/news-ingest-route.test.ts`: bỏ assert mặc định `isPublic`.
  - Các test UI còn lại: chỉ sửa assert đụng nút Public, badge hoặc đường dẫn `/feed-ingestion`.
  - Nếu có test sẵn cho config redirect thì thêm case; không có thì kiểm ở kịch bản thủ công.
- [x] **Step 7 — Kịch bản thủ công** (theo `tests/manual/README.md`): xoá `tests/manual/news-public.md` và dòng của nó trong bảng; đổi đường dẫn trong `news-inbox.md`, `knowledge-provenance.md` (case "bài `cron` mới không lên `/news`" thay bằng "mở `/news` khi chưa đăng nhập → `/login`"). Thêm case: `/feed-ingestion?view=saved` → `/news?view=saved`; `/feed-ingestion/sources` → `/news/sources`; shortcut PWA mở đúng trang. Trạng thái các case mới hoặc bị đổi: `Chưa chạy`.
- [x] **Step 8 — Code intel**: xoá `FLOW_NEWS_PUBLIC_READ` và entry point public khỏi `cris-workspace-map.json`, đổi `/feed-ingestion` → `/news` ở mọi flow/route còn lại, cập nhật `docs/code-intel/CRIS_WORKSPACE_MAP.md`, ADR-0019 thay ADR-0018 trong phần ADR. `yarn intel status` phải OK.
- [x] **Step 9 — Rà sót**: `grep -rn "feed-ingestion\|FEED_INGESTION\|isPublicPagePath\|public-queries\|PUBLIC_NEWS" app components lib logic middleware.ts tests` chỉ còn redirect trong `next.config.ts`, `RESERVED_TOPIC_SLUGS` và case redirect trong test.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED (cần `yarn prisma generate` trước: client local đang thiếu `slug`, `KnowledgeProvenance`)
- [x] `Lint`: PASSED cho các file TS đã sửa (`eslint --quiet`). `yarn lint` toàn repo vẫn lỗi ở file ngoài diff như trước (xem TASK-knowledge-provenance-001 mục 4).
- [x] `News Tests`: PASSED (8 file, 71 test, gồm cả `smooth-behavior`)
- [x] `Test`: PASSED (122 file, 1205 test, 8 skipped); `test:schema-sql --check`, `agents:sync --check` OK
- [x] `Intel Status`: PASSED (203 ref map + 38 ref docs; 43 entry point, 15 flow)
- [x] `Boundary Check`: PASSED (0 vi phạm; spec đã bỏ dòng comment đứng riêng trong `allowed_to_modify` và escape `[id]`, vì parser dừng danh sách ở comment và hiểu `[id]` là glob)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-owner-only-news-001/result.json`
- **Modified Files**:
  - Xoá: `app/(public-news)/**`, `lib/news/public-queries.ts`, `components/news/public-news-format.ts`, `lib/auth/public-paths.ts`, `scripts/publish-existing-news.ts`, `tests/route/news-public-queries.test.ts`, `tests/unit/public-paths.test.ts`, `tests/manual/news-public.md`
  - Chuyển: `app/(news)/feed-ingestion/**` → `app/(news)/news/**`; `lib/news/paths.ts` (`NEWS_PATH`, `NEWS_SOURCES_PATH`); `next.config.ts` (`redirects()`)
  - Sửa: `middleware.ts`, `components/site-chatbot.tsx`, `app/manifest.ts`, `app/robots.ts`, `package.json` (bỏ `db:news-publish-existing`), `components/news/{NewsReaderPanel,NewsFeedClient,NewsCard}.tsx`, `lib/news/{schemas,queries,ingest}.ts`, `app/api/news/[id]/route.ts`; caller của hằng đường dẫn (`share/page.tsx`, `ShareTargetClient.tsx`, `PublicationHome.tsx`, 2 page News)
  - Test: `middleware`, `news-item-patch-route`, `news-ingest-route`, 5 test UI; manual `news-inbox.md`, `knowledge-provenance.md`, `README.md`; code intel map + docs
- **Bài học**:
  - `.env.local` trỏ `TURSO_DATABASE_URL` vào production, nên `yarn dev` đọc DB thật; muốn kiểm UI an toàn thì chạy với `TURSO_DATABASE_URL=` và `DATABASE_URL=file:<bản copy>` đã `prisma db push`.
  - `list_field` của check-boundary dừng ở dòng comment đứng riêng và coi `[...]` là glob: spec không chèn comment giữa danh sách, đường dẫn có `[id]` viết `[[]id]`.
