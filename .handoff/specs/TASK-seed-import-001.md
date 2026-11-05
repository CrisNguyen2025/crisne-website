---
task_id: "TASK-seed-import-001"
branch: "feat/seed-import"
version: "2.0.0"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 2

boundaries:
  allowed_to_modify:
    - "scripts/import-seed-lessons.ts"
    - "scripts/lib/seed-import-plan.ts"
    - "tests/unit/seed-import-plan.test.ts"
    - "package.json"
    - ".gitignore"
    - "tests/manual/seed-import.md"
    - "tests/manual/README.md"
    - ".handoff/specs/TASK-seed-import-001.md"
  read_only_references:
    - "lib/roadmap/data.ts"
    - "prisma/seed.ts"
    - "prisma/schema.prisma"
    - "scripts/lib/flatten-sections.ts"
    - "scripts/add-lesson-status.ts"
    - "scripts/flatten-to-sections.ts"
    - "lib/roadmap/status.ts"
    - "lib/roadmap/rag-reindex.ts"
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "GLOSSARY.md"
  strictly_forbidden:
    - "prisma/**"
    - "lib/**"
    - "app/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "yarn.lock"
    - "roadmap-rag-assistant/**"

verification_gate:
  setup: "yarn install --frozen-lockfile"
  type_check: "npx tsc --noEmit -p tsconfig.json"
  lint: "npx eslint scripts/import-seed-lessons.ts scripts/lib/seed-import-plan.ts tests/unit/seed-import-plan.test.ts"
  test: "yarn test"
  dry_run_local: "yarn db:import-seed --local"
  boundary_check: "git status --porcelain"
---

# TASK: Nhập các bài seed AI vào kho tri thức, trạng thái `target`

## 1. Context & Architectural Intent
- **Goal**: Đưa toàn bộ bài trong `INITIAL_ROADMAP_DATA` (`lib/roadmap/data.ts`, khoảng 110 bài, 5 tầng) vào topic `ai-architecture` trên Turso. Mỗi bài đặt `status = "target"` (Owner muốn học). Script chạy dry-run mặc định. Owner tự chạy `--apply`.
- **Why**: Kho trên Turso hiện chỉ có 4 topic và 1 bài, nên Abot chưa có tri thức để trả lời hay gợi ý "nên học gì tiếp". Owner đã quyết định ngày 2026-11-05: nhập seed với trạng thái `target`.
- **Dependencies**: `prisma/seed.ts` (`seedLayers`) đã có sẵn quy tắc đổi cây Layer → Group → Item thành bài theo section (`sectionName` trong `scripts/lib/flatten-sections.ts`, ADR-0009). **Dùng lại `sectionName`, không viết lại quy tắc.** Lấy cách kết nối, dry-run / `--apply` / `--local` và backup theo `scripts/add-lesson-status.ts`.

## 2. Invariants & Rules
- **Agent không bao giờ chạy `--apply` trên Turso.** Chỉ dry-run trên Turso, hoặc chạy trên `--local` (`prisma/dev.db`). Owner tự chạy `--apply`.
- Topic đích là `ai-architecture` (có thể đổi bằng `--topic <slug>`). Topic không tồn tại thì báo lỗi và dừng, **không tự tạo topic**.
- **Không ghi đè và không xoá gì.** Bài trùng tiêu đề với một bài đã có trong topic (so khớp như `findDuplicate` của API: bỏ khoảng trắng thừa, không phân biệt hoa thường) thì bỏ qua và in ra là "đã có". Chạy lại lần hai phải ra "Nothing to do".
- `id` của bài mới: không dùng id của seed (`kb-core-01`…). Sinh UUID v7 như `@default(uuid(7))` của schema. Nếu không có sẵn hàm sinh UUID v7 mà không phải thêm dependency thì dùng `crypto.randomUUID()` và ghi rõ lựa chọn trong mục 5.
- `status = "target"`, `statusUpdatedAt = null` (ADR-0010: thời điểm chỉ ghi khi trạng thái **đổi**). `order` nối tiếp sau `order` lớn nhất đang có trong topic, giữ đúng thứ tự của seed. `section`, `title`, `description`, `content` lấy như `seedLayers`.
- Trước khi ghi: backup `RoadmapItem` của topic đích ra `seed-import-backup-<timestamp>.json` và thêm mẫu tên này vào `.gitignore` (theo kiểu `lesson-status-backup-*.json`). Toàn bộ lệnh ghi nằm trong **một transaction**: lỗi giữa chừng thì không ghi bài nào.
- Sau khi `--apply` thành công: gửi một yêu cầu reindex cho Abot (`POST {RAG_SERVICE_URL}/internal/reindex` với `x-internal-key`, giống `requestRagReindex`). Không có biến môi trường thì in nhắc là index sẽ tự làm mới sau 30 giây. Lỗi reindex không làm script fail.
- Dry-run in ra: target (turso / dev.db), topic, số bài sẽ thêm theo từng section, số bài bỏ qua vì đã có, và 5 bài đầu tiên.
- Phần lập kế hoạch là hàm thuần trong `scripts/lib/seed-import-plan.ts` (vào: bài đang có + seed; ra: danh sách bài sẽ thêm và bị bỏ qua). Script chỉ lo đọc / ghi DB. TypeScript strict, không `any`, không `@ts-ignore`. Không thêm dependency. Trong `package.json` chỉ được thêm đúng một dòng script `"db:import-seed"`, theo cách `db:lesson-status` đang khai báo.
- Không commit `prisma/dev.db`, `.env*`, file backup. Không push, không merge vào `main`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`. Copy `.env.local` từ `/Users/anh_nt/Desktop/crisne-website/.env.local` (không commit). Chạy gate trên code chưa sửa và ghi lại những gì đã fail từ trước.
- [x] **Step 1 (Plan thuần)**: `scripts/lib/seed-import-plan.ts`, kèm unit test `tests/unit/seed-import-plan.test.ts` với các trường hợp: topic trống → thêm tất cả, đúng section và thứ tự, `status` `target`; có bài trùng tiêu đề (khác hoa thường / khoảng trắng) → bỏ qua; `order` nối tiếp sau bài đang có; chạy lại trên kết quả → không còn gì để thêm.
- [x] **Step 2 (Script)**: `scripts/import-seed-lessons.ts` cùng dòng `db:import-seed` trong `package.json`. Có dry-run, `--apply`, `--local`, `--topic`, backup, transaction và reindex như mục 2.
- [x] **Step 3 (Thử local)**: tạo topic `ai-architecture` trong `prisma/dev.db` nếu chưa có (chỉ ở local), chạy `yarn db:import-seed --local` (dry-run), rồi `yarn db:import-seed --local --apply`, rồi chạy lại để thấy "Nothing to do". Ghi output tóm tắt vào mục 4. Không commit `dev.db`.
- [x] **Step 4 (Dry-run trên Turso)**: `yarn db:import-seed` (không `--apply`). Ghi output vào mục 4 để Owner đối chiếu trước khi tự chạy `--apply`.
- [x] **Step 5 (Manual)**: `tests/manual/seed-import.md` theo quy ước `tests/manual/README.md`, gồm các bước Owner chạy `--apply`, mở `?topic=ai-architecture` thấy các bài kèm badge "Mục tiêu", hỏi Abot "nên học gì tiếp" (sau khi TASK-lesson-status-002 merge), và chạy lại thấy "Nothing to do". Cập nhật bảng trong README.

## 4. Verification Gate Results
- [x] `TypeCheck`: [PASS] `npx tsc --noEmit -p tsconfig.json` không có lỗi.
- [x] `Lint` (file mới): [PASS] `npx eslint scripts/import-seed-lessons.ts scripts/lib/seed-import-plan.ts tests/unit/seed-import-plan.test.ts` không có warning/error.
- [x] `Test` (vitest): [PASS] `yarn test` 82 test files passed, 990 passed, 8 skipped (17/17 test mới, bao gồm test kiểm tra `createdAt` và `updatedAt` là số nguyên epoch ms).
- [x] `Dry-run local` / `Apply local` / chạy lại: [PASS]
  - Dry-run:
    ```
    target: prisma/dev.db  (dry-run)
    topic: ai-architecture (AI & LLM Architecture Roadmap)
    Sections to add (109 lessons total)
    Skipped (already exist): 0
    ```
  - Apply:
    ```
    target: prisma/dev.db  (APPLY)
    backup: .../seed-import-backup-1793892932729.json
    Applied: 109 lessons added to ai-architecture.
    Abot reindex triggered successfully.
    ```
  - Chạy lại lần 2:
    ```
    target: prisma/dev.db  (dry-run)
    topic: ai-architecture (AI & LLM Architecture Roadmap)
    Sections to add (0 lessons total):
    Skipped (already exist): 109
    Nothing to do.
    ```
- [x] `Dry-run Turso`: [PASS]
  ```
  target: turso  (dry-run)
  topic: ai-architecture (AI & LLM Architecture Roadmap)

  Sections to add (109 lessons total):
    - 01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core: +8
    - 01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Trung cấp: +7
    - 01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Nâng cao: +7
    - 02. Tầng LLM Application Layer · Core: +8
    - 02. Tầng LLM Application Layer · Trung cấp: +8
    - 02. Tầng LLM Application Layer · Nâng cao: +6
    - 03. Tầng RAG + Agent Layer · Core: +7
    - 03. Tầng RAG + Agent Layer · Trung cấp: +8
    - 03. Tầng RAG + Agent Layer · Nâng cao: +9
    - 04. Tầng Ops & Đánh giá (LLMOps) · Core: +6
    - 04. Tầng Ops & Đánh giá (LLMOps) · Trung cấp: +8
    - 04. Tầng Ops & Đánh giá (LLMOps) · Nâng cao: +7
    - 05. Tầng Sản phẩm Production (Triển khai & Vận hành) · Core: +6
    - 05. Tầng Sản phẩm Production (Triển khai & Vận hành) · Trung cấp: +7
    - 05. Tầng Sản phẩm Production (Triển khai & Vận hành) · Nâng cao: +7

  Skipped (already exist): 0

  First 5 lessons to add:
    - [01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core] Knowledge Base (KB) (order: 1, status: target)
    - [01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core] Unstructured vs. Structured Data (order: 2, status: target)
    - [01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core] Data Ingestion Pipeline (order: 3, status: target)
    - [01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core] ETL / ELT Pipeline (order: 4, status: target)
    - [01. Tầng Dữ liệu & Tri thức (Knowledge Base) · Core] Data Cleaning & Normalization (order: 5, status: target)

  Dry-run only. Re-run with --apply after reviewing.
  ```
- [x] `Boundary Check`: [PASS] `git status --porcelain` chỉ chứa các file được phép trong `allowed_to_modify`.

## 5. Execution Audit Log
- **Git Commit Hash**: `570fbfc`
- **Cách sinh id**: Dùng UUID v7 từ package `uuid` (`v7 as uuidv7`), khớp chính xác đặc tả `@default(uuid(7))` của schema.
- **Định dạng ngày (Attempt 2 Fix)**: `createdAt` và `updatedAt` lưu dạng số nguyên epoch milliseconds (`Date.now()`), kiểm tra bằng `Number.isInteger` trước khi ghi, và có unit test xác nhận trong `tests/unit/seed-import-plan.test.ts`.
- **Modified Files**:
  - `scripts/import-seed-lessons.ts`
  - `scripts/lib/seed-import-plan.ts`
  - `tests/unit/seed-import-plan.test.ts`
  - `tests/manual/seed-import.md`
  - `tests/manual/README.md`
  - `package.json`
  - `.gitignore`
  - `.handoff/specs/TASK-seed-import-001.md`

## 6. Review notes (Claude, 2026-11-05, commit `ebc990a`) — CHANGES REQUESTED
Đạt: boundary đúng; dùng lại `sectionName` + `normalizeTitle` (giống `lib/roadmap/titles.ts`); topic thiếu thì dừng; dry-run mặc định; backup; `client.batch(..., "write")` là một transaction; reindex không làm fail; unit test 16/16 pass; tsc sạch; dry-run Turso: 109 bài, 15 section, 0 bỏ qua.

Cần sửa (1 việc):
1. **Định dạng ngày.** Script ghi `createdAt` / `updatedAt` là chuỗi ISO (`new Date().toISOString()`). Mọi dòng do Prisma tạo trên SQLite/libsql lưu **số mili giây** (`typeof(createdAt) = 'integer'`, ví dụ `1790415636745`). Prisma vẫn đọc được cả hai dạng (Claude đã thử), nhưng trộn hai dạng trong cùng một cột làm `ORDER BY` / so sánh ngày trong SQL sai: SQLite xếp mọi số trước mọi chuỗi. Giai đoạn 1–2 sẽ so ngày để tìm bài cũ. **Sửa:** ghi `Date.now()` (số mili giây) cho `createdAt` và `updatedAt`. Thêm một unit test hoặc một kiểm tra trong script khoá lại việc giá trị ngày là số nguyên.

Sau khi sửa: chạy lại gate (tsc, eslint file mới, vitest), dry-run Turso lại, commit `fix: store seed lesson dates as epoch ms (TASK-seed-import-001)`, điền commit vào mục 5, đặt `status: COMPLETED`, `current_attempt: 2`.
