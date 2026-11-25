# PLAN: Skill `cris-doctor`, khám sức khoẻ code FE + BE

- **Trạng thái:** `IMPLEMENTED (Phase 1–3 + job CI, chưa commit)`. Owner đồng ý thêm job CI ngày 2026-11-25 (Mục 6).
- **Ngày lập:** 2026-11-25 · Owner duyệt plan và cho làm hết 3 phase cùng ngày.
- **Thẩm định:** `cris-how-to-sync` cho kết luận 🟡 CẢI THIỆN. Không vi phạm ADR hay từ cấm trong Glossary. Điều kiện kèm theo: không làm lại việc của skill có sẵn, check authz theo ADR-0019, mặc định bỏ Cris AI, skill chỉ đọc.

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Một skill `cris-doctor`, chọn phần quét bằng `--target fe\|be\|all`. Gắn vào luồng làm việc ở Phase 3. |
| 2 | Chỉ quét repo `crisne-website`: Next.js (`app/`, `lib/`, `logic/`, `prisma/`, `components/`, `hooks/`) và 2 service FastAPI (`roadmap-rag-assistant/`, `news-ingest-worker/`). |
| 3 | Được thêm devDependency `knip` (TS) và `ruff` + `pip-audit` (Python). |
| 4 | Skill chỉ đọc, không sửa code. Finding chỉ vào `BACKLOG.md` khi Owner duyệt. |
| 5 | Mặc định bỏ qua Cris AI (`app/portfolio/**`, `app/api/chat/**`, `components/floating-bot/**`, `hooks/use-floating-chat.ts`); cờ `--include-cris-ai` để bật lại. |
| 6 | Commit sau khi xong cả 3 phase. |

## 2. Ranh giới với skill khác

| Skill | Vai trò | Doctor làm gì |
|---|---|---|
| `verify-ci` | Pass/fail trên diff trước khi commit | Không chạy lại; Phase 3 thêm một dòng `yarn doctor --since <base> --check` |
| `risk-deps-tracker`, `security-audit` | Rủi ro supply-chain, audit bảo mật sâu | Mode `full` giao cho 2 skill này, không tự parse `npm audit` |
| `next-bundle-optimizer`, `vercel-react-best-practices` | Bundle và rule React | Mode `full` giao cho 2 skill này |
| `cris-code-intel` | Flow nghiệp vụ, drift của map | Chạy `yarn intel status` như một check |

## 3. Phase

### Phase 1: Khung + check máy móc (xong)

- `.agents/skills/cris-doctor/SKILL.md` và `scripts/` (CLI `doctor.ts` + các module trong `scripts/lib/`). Script `doctor` trong `package.json`.
- Thêm devDependency `knip` + `knip.json`. Thêm `ruff`, `pip-audit` vào extra `[dev]` của `roadmap-rag-assistant`. Doctor dùng binary trong `.venv` của service này để quét cả `news-ingest-worker` (worker chưa có `[dev]`, `pip-audit -r` đọc thẳng `requirements.txt`).
- Check thiếu tool thì đánh `skipped`, không fail.
- Output: `.handoff/doctor/DOCTOR-<date>.md`, `.handoff/doctor/latest.json`; `--update-baseline` ghi `.handoff/doctor/baseline.json`; `--check` exit 1 khi có finding `bug`/`risk` mới so với baseline.
- Thêm dòng vào mục Skills của `AGENTS.md`, chạy `yarn agents:sync`.
- Vitest cho các hàm thuần (parser output tool, check theo nội dung file, baseline, lọc `--since`).

### Phase 2: Check cần phán đoán (`--mode full`)

- SKILL.md hướng dẫn agent review: authz từng route theo ADR-0019, SSRF ở `lib/news/feed-discovery.ts` và `lib/news/rss-fetcher.ts`, contract/error shape, convention format giá trị optional, kịch bản `tests/manual` lỗi thời.
- Giao phần chuyên sâu cho các skill ở Mục 2.

### Phase 3: Gắn vào luồng làm việc

- `verify-ci`: thêm dòng doctor `--since --check` khi có baseline.
- `agent-handoff`: TASK spec thêm mục "doctor delta".
- `think` / `cris-how-to-sync`: chạy `yarn doctor --scope <vùng>` trước khi lập plan.
- Tạo baseline đầu tiên. Job CI `doctor` chạy `yarn doctor --check` (Owner đồng ý 2026-11-25).

## 4. Danh sách check của Phase 1

| ID | Target | Mode | Mức | Cách làm |
|---|---|---|---|---|
| `BUILD-TSC` | fe/be | quick | bug | `yarn tsc --noEmit -p .` |
| `BUILD-ESLINT` | fe/be | quick | error→risk, warning→nit | `yarn eslint --format json` |
| `DEAD-KNIP` | fe/be | quick | nit | `yarn knip --reporter json` |
| `PY-RUFF` | be | quick | F*→risk, còn lại nit | `ruff check --output-format json` |
| `PY-PYTEST` | be | full | bug | pytest của 2 service |
| `DEPS-PIP-AUDIT` | be | full | risk | `pip-audit --path <site-packages của .venv> -f json` (gói đã cài; `-r` cần tạo venv tạm, lỗi `ensurepip` trên máy này) |
| `TEST-VITEST` | fe/be | full | bug | `yarn test` |
| `DATA-SCHEMA-SQL` | be | quick | bug | `yarn test:schema-sql --check` |
| `INTEL-STATUS` | be | quick | risk | `yarn intel status` |
| `BE-ROUTE-AUTH` | be | quick | bug | Route `app/api/**/route.ts` không gọi guard (`requireWriteAccess`, `hasWriteAccess`, `hasValidAdminKey`, `CRON_SECRET`). Middleware cho qua mọi request có header `x-internal-key`/`x-admin-key` mà không kiểm giá trị (ADR-0019, mục còn treo) |
| `BE-ROUTE-VALIDATION` | be | quick | nit | Handler đọc `.json()`/`.formData()` mà file không có `.parse(`/`.safeParse(` |
| `BE-ROUTE-TEST` | be | quick | nit | Route không có test nào trong `tests/` import tới |
| `BE-FETCH-TIMEOUT` | be | quick | risk | `fetch(` phía server không có `signal` trong lời gọi |
| `BE-RAW-SQL` | be | quick | risk | `$queryRawUnsafe` / `$executeRawUnsafe` |
| `BE-CRON-ROUTE` | be | quick | bug | Cron trong `vercel.json` trỏ tới route không tồn tại |
| `BE-ENV-DOC` | be | quick | risk | Tên env dùng trong code không có trong `docs/DEPLOY_ENV.md` (chỉ so tên, không đọc `.env`) |
| `DATA-FK-INDEX` | be | quick | risk | Field FK trong `@relation(fields:)` không có `@@index`/`@@unique`/`@unique`/`@id` phủ |
| `PY-REQ-DRIFT` | be | quick | nit | `[project].dependencies` lệch `requirements.txt` |
| `FE-SERVER-IMPORT` | fe | quick | bug | File `'use client'` import module server (`@/lib/prisma`, `@prisma/client`, `@/auth`, `@/lib/auth/*`, `next/headers`, `fs`, `node:*`, `server-only`) |
| `FE-EFFECT-FETCH` | fe | quick | risk | `fetch(` trong file client có `useEffect` (convention: code mới không fetch trong effect) |
| `CONV-USECASE-NAME` | fe | quick | nit | Tên kiểu `is<Feature>Loading` |
| `CONV-ESCAPE-HATCH` | fe/be | quick | nit | `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` không ghi lý do |
| `SEC-SECRET` | fe/be | quick | bug | Pattern key/token cứng trong code (không in giá trị, không đọc `.env*`) |

### Đợt bổ sung 1 (2026-11-25)

Owner chốt: cấm cỡ chữ tuỳ ý trong code mới; bắt dùng `<Button>`. Rule viết ở `docs/design-system.md`. Không thêm dependency.

| ID | Target | Mức | Cách làm |
|---|---|---|---|
| `BE-RAG-REINDEX` | be | risk | Route ghi `roadmap`/`roadmapItem` (`create`/`update`/`upsert`/`delete`…) mà không gọi `notifyRoadmapChanged`/`requestRagReindex` |
| `BE-ERROR-LEAK` | be | risk | Trong `NextResponse.json(`/`Response.json(`/`new Response(`: `instanceof Error ? x.message`, `(x as Error).message`, `String(err)`, `.stack` |
| `BE-QUERY-IN-LOOP` | be | risk | Prisma call trong thân `for`/`while`/`.map(async`/`.forEach(async` (N+1); bỏ `scripts/`, `prisma/` |
| `PY-ROUTE-AUTH` | be | bug | Có middleware HTTP kiểm key: `PUBLIC_PATHS` chỉ được có `/health`. Không có: mọi endpoint (trừ `/health`) phải gọi `is_valid_internal_key` hoặc `Depends(` |
| `DS-RAW-COLOR` | fe | nit | Palette thô Tailwind, hex/`rgb()`/`hsl()`/`oklch()`; trừ thuộc tính SVG và `themeColor` |
| `DS-DARK-VARIANT` | fe | nit | `dark:` trừ `dark:prose-invert` |
| `DS-ARBITRARY-VALUE` | fe | nit | `text-`/spacing/`z-` với giá trị số tuỳ ý (`[var(--…)]` là token, không tính) |
| `DS-RAW-BUTTON` | fe | nit | `<button>` thô |
| `DS-STATIC-INLINE-STYLE` | fe | nit | `style={{…}}` toàn giá trị literal |
| `DS-ICON-LIB` | fe | nit | Import icon ngoài `lucide-react` |

Check `DS-*` không quét `components/ui/*.tsx` (primitive shadcn) và file `ImageResponse`.

### Đợt bổ sung 2 (2026-11-25)

| ID | Target | Mức | Cách làm |
|---|---|---|---|
| `CIRCULAR-IMPORT` | fe/be | risk | Đồ thị import lúc chạy của mọi file TS (bỏ `import type`, `export type`, `import()` động), resolve bằng TypeScript compiler API theo `tsconfig.json`; mỗi nhóm file import vòng (SCC, Tarjan) là một finding |
| `PY-MYPY` | be | risk | `mypy==2.4.1` (extra `[dev]` của rag) chạy trên `rag_service` và `news_worker` với `--no-site-packages --ignore-missing-imports --python-version 3.13` |

- Circular import không thêm dependency: dùng `typescript` đã có thay vì `madge`/`dependency-cruiser`, nên alias `@/` resolve đúng như tsc. Lúc thêm check, repo có 0 vòng (291 file, 610 cạnh).
- `PY-MYPY` dùng `--no-site-packages`: thư viện ngoài thành `Any`, kết quả chỉ phụ thuộc code và version mypy. Đã đo: venv trống (như CI) và `.venv` đầy đủ cùng ra 157 lỗi cho `rag_service`. Đổi lại, mypy không kiểm cách gọi API của thư viện ngoài.
- Mypy chạy mặc định, không bật `--check-untyped-defs`/`--strict`. Lúc thêm check có 158 lỗi, 112 là `attr-defined`, chủ yếu do mixin `*Commands` gọi `self._stream_text` của class chủ.
- Message của mypy thay `line 12` thành `line N` để fingerprint không đổi khi dòng xê dịch.
- Job CI `doctor` cài ruff và mypy từ extra `[dev]`, không cài dependency của service.

## 5. Verify

`yarn tsc --noEmit -p .` · `yarn eslint <file đổi>` · `yarn test` · `yarn agents:sync --check` · `yarn intel status` · chạy thử `yarn doctor`.

## 6. Ghi chú triển khai (2026-11-25)

- Message của `BE-ROUTE-AUTH` viết trung tính (phòng thủ nhiều lớp), không mô tả lỗ hổng `x-internal-key` của middleware, vì lỗ hổng đó đang được sửa ở thay đổi khác.
- Bỏ check `PY-ASYNC-BLOCKING` tự viết: ruff nhóm `ASYNC` đã bắt việc này. `PY-RUFF` chạy `--isolated --select F,E9,B,ASYNC,S` để kết quả không phụ thuộc config ruff của từng máy.
- `logic/` được xếp vào vùng `ui`: đây là lớp gọi API phía browser, chỉ client component import tới.
- `BE-ROUTE-VALIDATION` hạ xuống `nit`: nhiều route validate tay; mode `full` để agent đánh giá.
- `BE-FETCH-TIMEOUT` bỏ qua `fetch` với URL tương đối (code browser nằm trong `lib/` không có `"use client"`).
- Gắn vào luồng làm việc: dòng `cris-doctor` trong mục Skills của `AGENTS.md`; một dòng trong bảng lệnh của `verify-ci`; key `doctor_delta` trong `.handoff/specs/TEMPLATE-TASK.md` và hướng dẫn ở `agent-handoff/references/architect.md`; mục 4 của Bước 3 trong `cris-how-to-sync`.
- Report và `latest.json` nằm trong `.handoff/doctor/.gitignore`; `baseline.json` thì commit.
- **Job CI `doctor`** (`.github/workflows/ci.yml`): chạy `yarn doctor --check` ở mode quick trên toàn repo, cho cả PR lẫn push `main`, và upload report làm artifact. `ruff` vào CI qua check `PY-RUFF` của job này: job tạo `roadmap-rag-assistant/.venv` rồi chỉ cài ruff và mypy (mypy từ đợt 2), version đọc từ extra `[dev]`. Không có bước ruff riêng trong job `rag-service`, vì code hiện còn 37 finding ruff và sẽ fail ngay. `pip-audit` không chạy trong CI: cần mạng và kết quả phụ thuộc gói đang cài.
- `ruff` được pin `==0.17.6` trong `[dev]`: nâng ruff thì phải chạy lại `yarn doctor --update-baseline`.
- **Lưu ý khi commit:** baseline tạo trên working tree hiện tại. Commit baseline cùng lúc với toàn bộ thay đổi của task này; nếu sau đó code đổi thêm thì chạy lại `yarn doctor --mode full --update-baseline` trước khi commit, nếu không job `doctor` có thể fail ở lần chạy đầu.
