---
task_id: "TASK-news-ingest-fixes-001"
branch: "feat/news-ingest-phase-1"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude" # agy hết quota (429) ngày 2026-11-22, Dev chọn Claude sửa tại chỗ
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "lib/news/ingest.ts"
    - "lib/news/url-guard.ts"
    - "lib/news/queries.ts"
    - "lib/news/rss-fetcher.ts"
    - "lib/news/schemas.ts"
    - "app/api/news/jobs/[id]/complete/route.ts"
    - "components/news/NewsReaderSheet.tsx"
    - "news-ingest-worker/news_worker/schemas.py"
    - "news-ingest-worker/news_worker/processor.py"
    - "news-ingest-worker/news_worker/client.py"
    - "news-ingest-worker/news_worker/extractors/pipeline.py"
    - "news-ingest-worker/tests/**"
    - "tests/route/news-ingest-route.test.ts"
    - "tests/route/news-feed-query.test.ts"
    - "tests/unit/news-url-guard.test.ts"
    - "tests/unit/news-rss-parser.test.ts"
    - "tests/unit/news-schemas.test.ts"
    - "tests/unit/news-feed-ui.test.tsx"
  continues_dirty:
    - "lib/news/ingest.ts"
    - "lib/news/url-guard.ts"
    - "lib/news/queries.ts"
    - "lib/news/rss-fetcher.ts"
    - "lib/news/schemas.ts"
    - "app/api/news/jobs/[id]/complete/route.ts"
    - "components/news/NewsReaderSheet.tsx"
    - "news-ingest-worker/news_worker/schemas.py"
    - "news-ingest-worker/news_worker/processor.py"
    - "news-ingest-worker/news_worker/client.py"
    - "news-ingest-worker/news_worker/extractors/pipeline.py"
    - "news-ingest-worker/tests/__init__.py"
    - "news-ingest-worker/tests/test_pipeline.py"
    - "news-ingest-worker/tests/test_server.py"
    - "news-ingest-worker/tests/test_summarizer.py"
    - "tests/route/news-ingest-route.test.ts"
    - "tests/unit/news-url-guard.test.ts"
    - "tests/unit/news-rss-parser.test.ts"
    - "tests/unit/news-schemas.test.ts"
    - "tests/unit/news-feed-ui.test.tsx"
  read_only_references:
    - "prisma/schema.prisma"
    - "lib/news/dedupe.ts"
    - "lib/news/sources.ts"
    - "components/news/NewsFeedClient.tsx"
    - "news-ingest-worker/news_worker/server.py"
    - "tests/route/news-sources-cron-route.test.ts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "middleware.ts"

deploy_steps: []

fast_gate: ["type_check", "news_tests", "worker_tests", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  news_tests: "yarn vitest run tests/route/news-ingest-route.test.ts tests/route/news-feed-query.test.ts tests/route/news-item-patch-route.test.ts tests/route/news-sources-cron-route.test.ts tests/unit/news-url-guard.test.ts tests/unit/news-rss-parser.test.ts tests/unit/news-schemas.test.ts tests/unit/news-feed-ui.test.tsx tests/unit/news-dedupe.test.ts"
  test: "yarn test"
  worker_tests: "cd news-ingest-worker && .venv/bin/python -m pytest -q"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-news-ingest-fixes-001"
---

# TASK: Sửa 8 lỗi review của News Ingest phase 1

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-22. Đã sửa đủ 10 bước, cộng phần bổ sung: mỗi worker Vitest dùng một DB test riêng cho các test route news (Dev đồng ý trong chat). `yarn test` chạy 10 lần không còn test news nào fail.

## 1. Context & Architectural Intent
- **Goal**: Sửa 8 lỗi correctness từ code review của tính năng News Ingest (chưa commit, cùng nhánh `feat/news-ingest-phase-1`). Mọi file của tính năng đang untracked: đây là phase tiếp nối, file trong `continues_dirty` là code phase trước.
- **Why**: Hàng đợi job có thể ghi đè/chạy trùng, worker gửi payload bị Next.js từ chối, link rút gọn bị chặn, lọc feed sót bài, feed RSS lớn làm tràn bộ nhớ, bài không tự đánh dấu đã đọc.
- **Dependencies**: `lib/news/ingest.ts#completeIngestJob`, `#reclaimExpiredJobLeases`, `#reingestNewsItem`, `#claimNextIngestJob`; `lib/news/url-guard.ts#resolveAndValidateUrl`; `lib/news/queries.ts#queryNewsFeed`; `lib/news/rss-fetcher.ts#fetchFeedXmlSafely`; `components/news/NewsReaderSheet.tsx` (effect auto-read); `news-ingest-worker/news_worker/{schemas,processor,client}.py`. Route test dùng DB thật (xem `tests/route/news-ingest-route.test.ts`).

## 2. Invariants & Rules
- Không đổi schema Prisma. Không thêm dependency.
- Giữ shape response hiện có của các route; chỉ thêm status 409 cho `/api/news/jobs/[id]/complete`.
- Trường mới trong payload (`attempt`) là optional để worker cũ vẫn chạy được.
- Mọi lỗi tiếng Việt theo giọng thông báo đang có trong file.
- Ngoài phạm vi: `middleware.ts` (finding x-cron-secret), `NewsFeedClient.tsx` useEffect (finding conventions) — không sửa.

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1 — completeIngestJob chỉ nhận job đang chạy** (`lib/news/ingest.ts`, `lib/news/schemas.ts`, `app/api/news/jobs/[id]/complete/route.ts`)
  - Thêm `attempt: z.number().int().min(1).optional()` vào cả 3 nhánh của `JobCompleteRequestSchema`.
  - Thêm `export class IngestJobConflictError extends Error { readonly status = 409 }` trong `ingest.ts`.
  - Trong `completeIngestJob`: nếu `job.status !== "running"` hoặc (`payload.attempt` có và `!== job.attempts`) thì throw `IngestJobConflictError`. Ghi DB bằng interactive `prisma.$transaction(async (tx) => …)`: bước đầu là `tx.ingestJob.updateMany({ where: { id, status: "running", attempts: job.attempts }, data: … })`; nếu `count === 0` throw `IngestJobConflictError` (rollback), rồi mới `tx.newsItem.update`. Áp dụng cho cả 4 nhánh (ready / partial / retry / failed).
  - Route trả `{ error }` status 409 khi bắt `IngestJobConflictError`.
- [x] **Step 2 — reclaim lease không đụng item khi job đã đổi trạng thái** (`lib/news/ingest.ts#reclaimExpiredJobLeases`): đổi sang interactive transaction; chỉ `newsItem.update` khi `updateMany(...).count === 1`.
- [x] **Step 3 — reingest huỷ job cũ** (`lib/news/ingest.ts#reingestNewsItem`): trong cùng transaction, trước khi tạo job mới: `tx.ingestJob.updateMany({ where: { newsItemId, status: { in: ["pending", "running"] } }, data: { status: "failed", stage: "superseded", lockedUntil: null, lastError: "Superseded by reingest" } })`. Nhờ Step 1, worker đang chạy job cũ báo về sẽ nhận 409.
- [x] **Step 4 — worker gửi `attempt` và bỏ qua 409** (`news_worker/schemas.py`, `processor.py`, `client.py`)
  - Thêm `attempt: int | None = None` vào 3 payload; `processor.py` set `attempt=job.attempts`.
  - Trong `process_single_job`: nếu `complete_job` raise `httpx.HTTPStatusError` với status 409 thì trả `"stale"` và **không** gửi payload `failed` (áp dụng cả khi 409 xảy ra trong nhánh except).
- [x] **Step 5 — payload Python khớp giới hạn Zod** (`news_worker/schemas.py`, có thể `extractors/pipeline.py`)
  - `NewsSummaryOutput.takeaways`: validator loại item có độ dài sau strip < 5, cắt 240, tối đa 6 (list vẫn `min_length=1`).
  - `author`: cắt 120 (ready + partial). `title` partial: cắt 240. `extractionError` và `error`: cắt 500 trong validator `mode="before"` (không raise khi dài). `thumbnailUrl`: không phải http/https thì thành `None`.
  - Thêm pytest cho các trường hợp: takeaway "RAG", author 200 ký tự, extractionError 800 ký tự, 409 không gửi failed.
- [x] **Step 6 — link rút gọn không bị chặn trước khi resolve** (`lib/news/url-guard.ts#resolveAndValidateUrl`): khi host gốc là short-link (`isShortLinkHostname`) thì bỏ qua check whitelist lần đầu (vẫn `assertPublicHostname`); check whitelist + public cho URL đích giữ nguyên. Nếu không resolve được (fetch lỗi trả về chính short link) thì URL đích vẫn là t.co → bị từ chối (fail-closed). Thêm test vào `tests/unit/news-url-guard.test.ts`: `https://t.co/x` redirect tới `https://github.com/a/b` → hợp lệ; redirect tới domain ngoài whitelist → 403.
- [x] **Step 7 — lọc feed không sót bài cũ** (`lib/news/queries.ts#queryNewsFeed`)
  - Tag: lọc trong SQL bằng `tags: { contains: JSON.stringify(tag) }` (tags là JSON array chữ thường), bỏ lọc tag in-memory.
  - `q`: quét theo lô bằng cursor (`orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, lô 500, tổng tối đa 5000 dòng) cho tới khi đủ `limit` kết quả khớp.
  - `curated_first`: lấy nhóm `origin != "cron"` trước rồi nhóm `cron`, mỗi nhóm theo createdAt desc (kết hợp với `q` bằng cùng cách quét lô), ghép tới `limit`. Khi `params.origin` đã set thì chỉ còn một nhóm.
  - Thêm `tests/route/news-feed-query.test.ts` (DB thật, theo mẫu `news-ingest-route.test.ts`): 520 item, item cũ nhất có tag hiếm / tiêu đề khớp `q` vẫn được trả về; curated_first đặt item manual/share cũ lên trước cron mới.
- [x] **Step 8 — giới hạn kích thước feed khi đọc stream** (`lib/news/rss-fetcher.ts#fetchFeedXmlSafely`): nếu header `content-length` > `MAX_FEED_XML_BYTES` thì cancel body và throw; còn lại đọc `response.body` bằng reader, đếm byte, vượt giới hạn thì `reader.cancel()` và throw `Error("Feed vượt quá giới hạn 2MB.")` — không cắt ngang XML. Decode bằng `TextDecoder`. Thêm test trong `tests/unit/news-rss-parser.test.ts` (fetchFn giả trả stream > 2MB → throw).
- [x] **Step 9 — auto-read không bị polling reset** (`components/news/NewsReaderSheet.tsx`): effect auto-read phụ thuộc `[item.id, item.reviewStatus, item.readState]`; giữ `item` và `onToggleRead` mới nhất qua `useRef` để gọi trong timeout. Thêm test trong `tests/unit/news-feed-ui.test.tsx` (fake timers: rerender với object item mới cùng id mỗi 2s, sau 3s vẫn gọi `onToggleRead` đúng một lần).
- [x] **Step 10 — test hàng đợi** (`tests/route/news-ingest-route.test.ts`): complete job đã `done` → 409 và item không đổi; complete với `attempt` lệch → 409; reingest khi job cũ đang running → job cũ `failed/superseded`, complete job cũ → 409; lease hết hạn mà job đã `done` → item giữ `ready`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED cho file đã sửa (`yarn lint` toàn repo còn lỗi có từ trước ở `.worktrees/`, `.claude/worktrees/`, `components/ui/`, `tests/load/`…, không file news nào)
- [x] `News Tests`: PASSED, kể cả khi chạy song song
- [x] `Test`: PASSED cho news. Chạy 10 lần liên tiếp, 9 lần pass hết; 1 lần fail `tests/unit/chat-citations.test.tsx` (test UI chat của Abot, task này không đụng tới, flaky từ trước)
- [x] `Worker Tests`: PASSED (16 test)
- [x] `Intel Status`: PASSED
- [x] `Boundary Check`: PASSED (1 `OUT_OF_SCOPE` sai: `app/api/news/jobs/[id]/complete/route.ts` có trong allowed_to_modify, script đọc `[id]` thành character class của glob)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-news-ingest-fixes-001/result.json`
- **Modified Files**:
  - `lib/news/ingest.ts`, `lib/news/schemas.ts`, `app/api/news/jobs/[id]/complete/route.ts` (bước 1–3)
  - `news-ingest-worker/news_worker/schemas.py`, `processor.py`, `tests/test_payloads.py` (mới) (bước 4–5)
  - `lib/news/url-guard.ts`, `lib/news/queries.ts`, `lib/news/rss-fetcher.ts`, `components/news/NewsReaderSheet.tsx` (bước 6–9)
  - `tests/route/news-ingest-route.test.ts`, `tests/route/news-feed-query.test.ts` (mới), `tests/unit/news-url-guard.test.ts`, `tests/unit/news-rss-parser.test.ts`, `tests/unit/news-feed-ui.test.tsx`
  - Bổ sung (ngoài `allowed_to_modify` ban đầu, Dev đồng ý trong chat): `tests/setup/test-db.ts` (chụp `prisma/test.db.template`, dọn bản sao của worker cũ), `tests/setup/isolated-test-db.ts` (mới: trỏ `DATABASE_URL` sang `prisma/test.db.worker-<id>`), dòng import đầu tiên trong 4 file `tests/route/news-*.test.ts`, và chờ render trong test `SourcesManagerSheet`. Các file `prisma/test.db*` đã nằm trong `.gitignore`.
  - Không cần sửa `news_worker/client.py` (`exclude_none` đã gửi `attempt`) và `extractors/pipeline.py` (lỗi dài đã được cắt trong validator).
- **Bài học**:
  - `check-boundary.sh` đọc đường dẫn route động `[id]` thành glob; cần escape hoặc so khớp chính xác trước.
  - Test có xoá cả bảng trong `beforeEach` thì import `tests/setup/isolated-test-db` đầu tiên. Không dùng `projects` của Vitest để chạy tuần tự: với config này mỗi file chạy hai lần và cả suite bị chạy tuần tự.
