---
task_id: "TASK-dead-code-cleanup-001"
branch: "chore/dead-code-cleanup"
version: "2.0.0"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    # Phase 1
    - "lib/ai/action-chips.ts"
    - "app/api/chat/route.ts"
    - "components/projects-section.tsx"
    - "components/floating-bot/FloatingChatDrawer.tsx"
    - "app/page.tsx"
    - "hooks/use-roadmap.ts"
    - "app/sitemap.ts"
    - "lib/roadmap/resolveRoadmap.ts"
    - "lib/roadmap/types.ts"
    - "app/api/v1/roadmaps/[slug]/route.ts"
    - "app/api/v1/roadmaps/[slug]/sections/route.ts"
    - "logic/api-fetch.ts"
    - "logic/roadmap/roadmapService.ts"
    - "logic/roadmap/knowledgeTriageService.ts"
    - "logic/roadmap/roadmapAssistantService.ts"
    # Phase 2 (xoá) + file sửa kèm
    - "components/workflow-canvas/**"
    - "components/knowledge/**"
    - "components/mapping-flow/**"
    - "components/unlock-gate/**"
    - "components/site-lock-gate.tsx"
    - "components/gradient-text.tsx"
    - "components/skill-card.tsx"
    - "components/json-ld.tsx"
    - "components/floating-bot/FloatingChatBot.tsx"
    - "components/site-chatbot.tsx"
    - "components/floating-bot/FloatingChatPopup.tsx"
    - "components/floating-bot/ChatTriggerButton.tsx"
    - "components/ui/accordion.tsx"
    - "components/ui/animated-grid-pattern.tsx"
    - "components/ui/badge.tsx"
    - "components/ui/confirm-popover.tsx"
    - "components/ui/magnifier-spinner.tsx"
    - "components/ui/spinning-text.tsx"
    - "hooks/use-unlock.ts"
    - "lib/gtag.ts"
    - "lib/favorites-types.ts"
    - "lib/image-upload.ts"
    - "lib/r2-client.ts"
    - "lib/ai/stream-parts.ts"
    # Phase 3 (xoá)
    - "types/**"
    - "lib/knowledge/**"
    - "lib/workflow/**"
    - "logic/workflow/**"
    - "logic/storage/**"
    - "app/api/workflows/**"
    - "app/api/docs/**"
    - "app/api/notes/**"
    - "app/api/storage/**"
    - "app/api/v1/clipper/**"
    - "app/api/v1/topics/**"
    - "app/api/v1/skills/**"
    - "app/api/v1/mcps/**"
    - "app/api/v1/agents/**"
    - "app/api/v1/projects/**"
    - "app/api/v1/notes/**"
    - "app/api/v1/search/**"
    - "app/api/v1/graph/**"
    - "app/api/v1/recommendations/**"
    - "app/api/v1/openapi/**"
    - "proxy.ts"
    - "scripts/eval-kb.ts"
    - "scripts/seed-sample-workflow.ts"
    - "public/llms.txt"
    - "public/llms-full.txt"
    - "lib/auth/owner-access.ts"
    - ".env.example"
    - "package.json"
    - "yarn.lock"
    # Phase 4
    - "prisma/schema.prisma"
    - "prisma/init-turso.sql"
    - "prisma/seed.ts"
    - "prisma/dev.db"
    - "prisma/migrations/**"
    - "roadmap-rag-assistant/tests/fixtures/schema.sql"
    # Phase 5
    - "docs/backup.md"
    - "docs/backup1.md"
    - "docs/backup2.md"
    - "docs/backup3.md"
    - "docs/backup4.md"
    - "docs/backup5.md"
    - "docs/backup6.md"
    - "docs/backup6.json"
    - "docs/workflow-builder-design.md"
    - "docs/workflow-builder-context-v3.md"
    - "docs/archive/**"
    - "docs/PROJECT_STRUCTURE.md"
    - "docs/README.md"
    - "docs/NOTION_FAVORITES_SETUP.md"
    - "docs/RAG_PRODUCTION_READINESS.md"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - ".agents/skills/fireworks-tech-graph/**"
    - "skills-lock.json"
    - "roadmap-rag-assistant/sdk/typescript/dist/**"
    - ".gitignore"
    # Tests
    - "tests/unit/**"
    - "tests/route/**"
    - "tests/e2e/**"
    - "tests/manual/README.md"
    - "tests/manual/dead-code-cleanup.md"
    - ".handoff/specs/TASK-dead-code-cleanup-001.md"
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "lib/prisma.ts"
    - "lib/auth/write-access.ts"
    - "lib/notion.ts"
    - "scripts/export-test-schema.ts"
    - "scripts/push-turso-schema.ts"
    - "tests/manual/README.md"
    - "roadmap-rag-assistant/sdk/typescript/src/**"
  strictly_forbidden:
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "AGENTS.md"
    - "CLAUDE.md"
    - ".env"
    - ".env.local"
    - "roadmap-rag-assistant/rag_service/**"
    - "roadmap-rag-assistant/evals/**"
    - "roadmap-rag-assistant/sdk/typescript/src/**"
    - "app/api/v1/roadmaps/route.ts"
    - "app/api/v1/roadmaps/items/**"
    - "app/api/v1/roadmaps/triage/**"
    - "app/api/v1/roadmaps/full-export/**"
    - "app/api/favorites/**"
    - "app/api/posts/**"
    - "app/api/tags/**"
    - "app/api/backup-notes/**"
    - "app/notes/**"
    - "components/ui/editor/**"
    - "tsconfig.json"
    - "next.config.ts"

verification_gate:
  setup: "yarn install --immutable && cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  schema_check: "yarn test:schema-sql --check"
  knowledge_index: "yarn check:knowledge-index"
  test_python: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  intel_status: "yarn intel status"
  dead_refs: "git grep -n -E \"lib/workflow|lib/knowledge|types/knowledge|logic/storage|logic/workflow|app/api/(docs|notes|storage|workflows)|api/v1/(clipper|topics|skills|mcps|agents|projects|notes|search|graph|recommendations|openapi)|AUTHORITATIVE_LAYERS|FloatingChatPopup|ChatTriggerButton|prisma\\.(note|tag|favorite|workflow)\" -- app lib logic hooks components scripts prisma tests"
  boundary_check: "git status --porcelain"
---

# TASK: Dọn code thừa còn sót sau `b1cbf1e` và drop bảng không dùng

## 1. Context & Architectural Intent
- **Goal**: Xoá hết phần còn sót của các tính năng đã gỡ page ở commit `b1cbf1e` (2026-11-02): Workflow Builder, API Docs, Knowledge OS, Mapping Flow, cùng Note API (Prisma), Chrome clipper và giao diện chat style1. Bỏ model Prisma của chúng. Sửa các chỗ lệch đã tìm được trong lúc quét (chip chat chết, sitemap trỏ trang 404, lấy topic theo slug không thống nhất, `apiFetch` bị chép đôi).
- **Why**: `b1cbf1e` chỉ xoá page. Component, API route, lib, model và mục sitemap vẫn còn, khiến repo có 3 nguồn "Note", 4 nguồn schema DB, và một chatbot phát event mà không component nào nghe. Owner đã duyệt plan dọn dẹp 5 phase trong buổi Architect ngày 2026-11-06.
- **Quyết định đã chốt (không đề xuất lại)**:
  - Xoá backend của Knowledge OS, Docs API, Workflow Builder, Note API (Prisma) và Chrome clipper.
  - Bỏ model và drop bảng: `Tag`, `Note`, `Role`, `ApiEndpoint`, `Feature`, `RoleApiAccess`, `Favorite`, `WorkflowProject`, `ProjectDocument`, `ProjectChunk`, `Workflow`, `WorkflowVersion`, `WorkflowRun`, `NodeExecution`, `WorkflowQuotaUsage`. Giữ nguyên `Roadmap`, `RoadmapItem`, `KnowledgeTriage`.
  - Bỏ chip "roadmap" (khái niệm Layer đã bỏ theo ADR-0008/0009). Nối chip "project" vào modal dự án.
  - Xoá giao diện chat style1 cùng test của nó. Production chỉ dùng `style2-drawer` ([site-chatbot.tsx:14](../../components/site-chatbot.tsx)).
  - Xoá hẳn `/api/storage/*` và logic quét/xoá ảnh "unused" trong `lib/r2-client.ts`. Hàm quét không đọc bài Notion, nên sẽ xoá nhầm ảnh của Notes. Giữ upload ảnh.
- **Dependencies**:
  - Callers đã trace: `getWorkflowOwner` (GitNexus CRITICAL, 14 caller) và `KnowledgeRegistry` (HIGH, 17 caller). Tất cả caller nằm trong phần bị xoá, trừ `app/sitemap.ts` (sửa ở Step 1.2).
  - GitNexus index stale (commit `4bb94fe`), nên trước mỗi phase phải đối chiếu lại bằng `git grep`.
  - `FloatingChatDrawer.tsx` đang import `chipHref`, `QUICK_PROMPTS`, `ICON_BUTTON` từ `FloatingChatPopup.tsx`. Phải chuyển 3 thứ này trước khi xoá Popup (Step 2.3).
  - `lib/r2-client.ts` đang gọi `prisma.note` trong `findUnusedStorageFiles`. Hàm này bị xoá ở Step 3.5, trước khi bỏ model ở Phase 4.
  - `ADMIN_API_KEY` / `hasValidAdminKey` **vẫn giữ**: `requireWriteAccess` dùng chúng cho script gọi route ghi.

## 2. Invariants & Rules
- TypeScript strict, cấm `any`, cấm `@ts-ignore` / `eslint-disable` không ghi lý do. Không để `console.log` mới.
- Naming theo đúng component/hàm, không theo use-case (sai: `isChatLoading`, đúng: `isLoading`).
- **Chỉ xoá hoặc sửa trong `allowed_to_modify`.** Gặp tham chiếu ngoài danh sách thì dừng và ghi vào mục 5, không tự mở rộng scope.
- **Không đổi hành vi** của các route còn giữ, trừ những chỗ nêu rõ ở Step 1.3 (route sections nhận cả title) và Step 1.4 (`apiFetch` giữ header của caller).
- `package.json` / `yarn.lock`: chỉ được (a) gỡ `@xyflow/react` và `zustand`, (b) bỏ script `db:migrate`. Không thêm, không nâng dependency nào khác.
- **Không chạm Turso production.** Không chạy `yarn db:turso:init` hay bất kỳ lệnh nào với `TURSO_DATABASE_URL`. Không đọc `.env`, `.env.local`. Mọi lệnh Prisma CLI ghi DB phải có `DATABASE_URL="file:./dev.db"` viết ngay trong lệnh.
- Không sửa `docs/adr/**` và `GLOSSARY.md` (Architect làm riêng sau khi Owner cho phép).
- Mỗi phase phải để hệ thống chạy được (typecheck + test pass) trước khi sang phase sau. **Commit một lần duy nhất sau khi xong cả 5 phase**, trên branch `chore/dead-code-cleanup`. Không push, không merge.
- Test thủ công trên dev server: DB của `yarn dev` là **Turso thật** (xem `tests/manual/README.md`). Chỉ dùng topic `QA Sandbox` và xoá nó sau khi chạy.

## 3. Step-by-Step Implementation Checklist

### Phase 1: Sửa bug và chỗ lệch
- [x] **Step 1.1 (Chip chat)**
  - `lib/ai/action-chips.ts`:
    - Bỏ `AuthoritativeLayer`, `AUTHORITATIVE_LAYERS` và vòng lặp layer trong `scanEntityMentions`.
    - `ActionChipType` còn `"project" | "contact" | "link"`.
    - Đổi `ACTION_TAG_REGEX` thành `/\[\[action:([a-z]+)\|([^|]+)\|([^\]]+)\]\]/g` và dùng chính hằng này trong `parseMessageContentAndActions` (bỏ regex chép inline).
    - Mọi thẻ khớp regex đều bị gỡ khỏi `cleanContent`, nhưng chỉ đẩy vào `actionChips` khi type thuộc `ActionChipType`. Thẻ `[[action:roadmap|…]]` cũ (còn trong `response-cache`) sẽ biến mất, không hiện nguyên chuỗi.
  - `app/api/chat/route.ts`:
    - Trong `ANTI_SLOP_SYSTEM_PROMPT`, bỏ khối `- Tầng lộ trình (Roadmap Layers):` và 5 dòng `layer-0x`.
    - Sửa câu mở đầu thành "Khi câu trả lời đề cập đến dự án hoặc kênh liên hệ, BẮT BUỘC chèn thẻ Action theo cú pháp:".
  - `components/floating-bot/FloatingChatDrawer.tsx`: bỏ nhánh `chip.type === "roadmap"` (event `roadmap:select-section`).
  - `components/projects-section.tsx`: thêm `useEffect` lắng nghe `window` event `project:open-modal`.
    - Đọc `detail.projectId`, tìm trong mảng project của file theo `id`; thấy thì gọi `handleViewDetail(project)`, không thấy thì bỏ qua.
    - Effect phải return cleanup gỡ listener.
  - Nhánh `"roadmap"` trong `chipHref` (đang ở `FloatingChatPopup.tsx`) bỏ khi chuyển hàm ở Step 2.3.
- [x] **Step 1.2 (Sitemap)**: `app/sitemap.ts` bỏ import `INITIAL_KNOWLEDGE_BASE`, bỏ 2 entry `/knowledge` và `/docs` trong `staticRoutes`, bỏ `getKnowledgeRoutes()`. Hàm `sitemap()` trả `[...staticRoutes, ...noteRoutes]`.
- [x] **Step 1.3 (Lấy topic thống nhất)**
  - Thay toàn bộ nội dung `lib/roadmap/resolveRoadmap.ts` bằng `export async function findTopic(identifier: string)`. Hàm chuyển nguyên từ `app/api/v1/roadmaps/[slug]/route.ts:18`: tìm theo slug, rồi theo slug/title không phân biệt hoa thường; trả về `Roadmap | null`.
  - `[slug]/route.ts` import hàm này và bỏ bản local.
  - `[slug]/sections/route.ts` (PATCH và DELETE) thay `prisma.roadmap.findUnique({ where: { slug }, include: { items: true } })` bằng:
    - `const topic = await findTopic(slug)`; nếu `null` thì trả 404 như cũ;
    - sau đó `const items = await prisma.roadmapItem.findMany({ where: { roadmapId: topic.id } })`, và dùng `items` thay cho `roadmap.items`.
- [x] **Step 1.4 (`apiFetch`)**
  - Tạo `logic/api-fetch.ts` export `apiFetch<T>(path, options?)`, gộp 2 bản trong `roadmapService.ts:27` và `knowledgeTriageService.ts:30`. Giữ base URL `NEXT_PUBLIC_API_BASE_URL ?? ""`, `cache: "no-store"`, và cách ném lỗi kèm `status`.
  - Thứ tự đúng: `{ cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...options?.headers } }`, để `options.headers` không ghi đè mất `Content-Type`.
  - 2 service import từ file mới và xoá bản local.
  - `ROADMAP_ASSISTANT_BASE_URL` và các export khác giữ nguyên.
- [x] **Step 1.5 (Type)**: `lib/roadmap/types.ts` bỏ `slug?`, `notes?`, `tags?` khỏi `ChecklistItem`. Nếu typecheck báo có chỗ đọc các field này, dừng và ghi vào mục 5. Lúc quét chưa thấy chỗ nào đọc.
- [x] **Step 1.6 (Tests Phase 1)**:
  - Cập nhật các test đang kỳ vọng layer/roadmap chip: `tests/unit/action-chips.test.ts`, `anti-slop.test.ts`, `m2-adversarial-stress.test.ts`, `m2-challenger-stress.test.ts` (đổi assert "5 layers" thành "không chứa `layer-0`"), `assistant-style2-drawer.test.tsx`, cùng `tests/e2e/test-helpers.ts`, `tier1-r2-anti-slop.test.ts`, `tier1-r3-action-chips.test.ts`, `tier3-cross-feature-interactions.test.ts`, `tier4-real-world-scenarios.test.ts`.
  - Thêm test unit: (a) `[[action:roadmap|layer-01|X]]` bị gỡ khỏi `cleanContent` và không sinh chip; (b) listener `project:open-modal` mở `ProjectDetailModal` đúng project.
  - Thêm test route: PATCH sections theo **title** của topic thì đổi tên được.

### Phase 2: Xoá UI và export chết
- [x] **Step 2.1 (Thư mục và file component)**: xoá `components/{workflow-canvas,knowledge,mapping-flow,unlock-gate}/`, `components/{site-lock-gate,gradient-text,skill-card}.tsx`, `hooks/use-unlock.ts`.
- [x] **Step 2.2 (UI primitives)**: xoá `components/ui/{accordion,animated-grid-pattern,confirm-popover,magnifier-spinner,spinning-text,badge}.tsx`. Kiểm tra lại bằng `git grep` là không còn import (kể cả trong `components/ui/**`) rồi mới xoá.
- [x] **Step 2.3 (Chat style1)**:
  - Chuyển `chipHref` sang `lib/ai/action-chips.ts` (bỏ nhánh `"roadmap"`). Chuyển `QUICK_PROMPTS` và `ICON_BUTTON` vào thẳng `FloatingChatDrawer.tsx` (không export), rồi sửa import của Drawer.
  - Xoá `FloatingChatPopup.tsx` và `ChatTriggerButton.tsx`.
  - `FloatingChatBot.tsx`: bỏ `AssistantUiStyle`, prop `uiStyle`, `triggerVariant`, nhánh style1; luôn render QuickBar + Drawer. `site-chatbot.tsx` chỉ bỏ prop `uiStyle="style2-drawer"`, không sửa gì khác.
  - Tests: xoá `tests/unit/assistant-style1.test.tsx`; trong `assistant-viewport-adversarial.test.tsx` và `assistant-viewport-ergonomics.test.tsx` chỉ xoá case render Popup / `style1-popup`, giữ case Drawer.
- [x] **Step 2.4 (Export không ai gọi)**:
  - Xoá file: `lib/gtag.ts`, `lib/favorites-types.ts`, `lib/ai/stream-parts.ts` + `tests/unit/stream-parts.test.ts`.
  - Xoá export: `BreadcrumbJsonLd`, `ArticleJsonLd`, `SoftwareAppJsonLd` (`components/json-ld.tsx`); `hasBase64Images` (`lib/image-upload.ts`); `uploadToR2`, `deleteFromR2` (`lib/r2-client.ts`); `createTriageItem` + `CreateTriagePayload` (`knowledgeTriageService.ts`); `sendRoadmapAssistantMessage`, `checkRoadmapAssistantHealth` (`roadmapAssistantService.ts`).
  - Trước khi xoá từng symbol, `git grep -w <symbol>` phải chỉ ra đúng file khai báo.

### Phase 3: Xoá backend code (DB chưa đổi)
- [x] **Step 3.1 (Knowledge OS)**: xoá `types/`, `lib/knowledge/`, `app/api/v1/{topics,skills,mcps,agents,projects,notes,search,graph,recommendations,openapi}/`. Giữ nguyên `app/api/v1/roadmaps/**`.
- [x] **Step 3.2 (Clipper)**:
  - Xoá `app/api/v1/clipper/` và block `describe("clipper …")` cùng import `clip` trong `tests/route/write-access.test.ts`.
  - Sửa comment còn nhắc "Chrome clipper" ở `.env.example:65` và `lib/auth/owner-access.ts:20` thành "script gọi máy".
- [x] **Step 3.3 (Docs API, Note API)**: xoá `app/api/docs/` (gồm `_shared/ensure-docs-schema.ts`) và `app/api/notes/`.
- [x] **Step 3.4 (Workflow Builder)**:
  - Xoá `lib/workflow/`, `logic/workflow/`, `app/api/workflows/`, `proxy.ts`, `scripts/eval-kb.ts`, `scripts/seed-sample-workflow.ts`, `tests/route/workflow-*.test.ts`, `tests/unit/workflow-*.test.ts` (13 file).
  - Bỏ dòng `.data/workflow-kb/` (và comment phía trên) trong `.gitignore`.
  - Chạy `yarn remove @xyflow/react zustand`.
- [x] **Step 3.5 (Storage)**:
  - Xoá `app/api/storage/` và `logic/storage/`.
  - Trong `lib/r2-client.ts` xoá `findUnusedStorageFiles`, `cleanupUnusedStorageFiles`, `getStorageStats`, `listAllStorageFiles`, interface `StorageFileInfo`, `StorageScanResult`, cùng helper chỉ các hàm này dùng.
  - Giữ `uploadToStorage`, `generateFilename` và mọi thứ `lib/image-upload.ts` / `app/api/upload-image` cần.
  - `tests/route/write-access.test.ts`: thay case dùng `cleanupStorage` bằng một route ghi còn tồn tại (`POST /api/v1/roadmaps` đã có sẵn trong file), giữ đúng ý nghĩa assert (401 khi không có quyền).
- [x] **Step 3.6 (llms)**: xoá `public/llms-full.txt` (toàn bộ là entity mock). Thay `public/llms.txt` bằng đúng nội dung sau:

```markdown
# Cris Nguyen

> Website cá nhân của Cris Nguyen, Frontend/AI engineer: portfolio, learning roadmap có trợ lý AI và ghi chú kỹ thuật.

## Pages
- [/](https://crisne.blog/): Learning roadmap: các Topic, Section và Lesson về AI/LLM, frontend, backend
- [/portfolio](https://crisne.blog/portfolio): Kinh nghiệm, dự án và kỹ năng của Cris
- [/notes](https://crisne.blog/notes): Ghi chú kỹ thuật

## Public API
- `GET /api/v1/roadmaps`: Danh sách Topic
- `GET /api/v1/roadmaps/[slug]`: Một Topic cùng các Lesson theo thứ tự trang
```

- [x] **Step 3.7 (Tests Phase 3)**: chạy `dead_refs` của gate, kết quả chỉ được còn các dòng trong `prisma/schema.prisma` và `prisma/seed.ts` (sẽ xử lý ở Phase 4).

### Phase 4: Schema và DB local
- [x] **Step 4.1 (schema.prisma)**: xoá 15 model nêu ở mục 1 cùng mọi relation field trỏ tới chúng. Model còn lại: `Roadmap`, `RoadmapItem`, `KnowledgeTriage`.
- [x] **Step 4.2 (seed)**: `prisma/seed.ts` xoá khối "// 1. Seed Tags" (biến `tags` và dòng log), rồi đánh lại số comment của các bước sau.
- [x] **Step 4.3 (init-turso.sql)**: sinh lại bằng đúng lệnh

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | sed -E 's/CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/; s/CREATE (UNIQUE )?INDEX "/CREATE \1INDEX IF NOT EXISTS "/' > prisma/init-turso.sql
```

  File mới chỉ được chứa 3 bảng `Roadmap`, `RoadmapItem`, `KnowledgeTriage`; `RoadmapItem` có `section`, `status`, `statusUpdatedAt`.
- [x] **Step 4.4 (fixture test)**: `yarn test:schema-sql` để sinh lại `roadmap-rag-assistant/tests/fixtures/schema.sql`.
- [x] **Step 4.5 (migrations)**: xoá `prisma/migrations/` và script `"db:migrate"` trong `package.json`. Repo dùng `db push` + `init-turso.sql`; thư mục này chỉ có migration của `Favorite`.
- [x] **Step 4.6 (dev.db)**:
  - Chạy `DATABASE_URL="file:./dev.db" yarn prisma db push --accept-data-loss --skip-generate`, rồi `yarn prisma generate`.
  - Kiểm tra bằng `sqlite3 prisma/dev.db ".tables"`: chỉ còn 3 bảng trên (cộng bảng hệ thống, nếu có).

### Phase 5: Docs và hygiene
- [x] **Step 5.1 (Backup dump)**: xoá `docs/backup.md`, `backup1.md` … `backup6.md`, `backup6.json`. Thêm vào `.gitignore` dòng `docs/backup*.md` và `docs/backup*.json`, kèm comment "Output của /api/backup-notes".
- [x] **Step 5.2 (Docs)**:
  - `git mv` `docs/workflow-builder-design.md` và `docs/workflow-builder-context-v3.md` vào `docs/archive/`.
  - Cập nhật `docs/README.md` (bỏ dòng Backup, chuyển mục Workflow Builder sang Archive), `docs/PROJECT_STRUCTURE.md` (bỏ `unlock-gate`, `workflow-canvas`, `knowledge`, `mapping-flow`, `types/`, `logic/workflow`, `logic/storage`), `docs/NOTION_FAVORITES_SETUP.md` (bỏ đoạn dùng `prisma.favorite`), `docs/RAG_PRODUCTION_READINESS.md` (bỏ dòng `streamParts` và các dòng chỉ nói về Workflow Builder).
  - `docs/code-intel/CRIS_WORKSPACE_MAP.md`: bỏ phần của các domain bị xoá.
- [x] **Step 5.3 (code-intel dataset)**:
  - Trong `.agents/skills/cris-code-intel/data/cris-workspace-map.json` xoá các entry sau:
    - domain `workflow-builder`, `docs-openapi`;
    - entryPoint `EP_API_WORKFLOW_RUNS_CREATE`, `EP_API_WORKFLOW_DOC_UPLOAD`;
    - flow `FLOW_WORKFLOW_RUN_DAG`, `FLOW_WORKFLOW_KB_INGEST`, `FLOW_NOTE_AUTOSAVE`;
    - dataModel `MODEL_WORKFLOW_PROJECT`, `MODEL_PROJECT_DOCUMENT`, `MODEL_PROJECT_CHUNK`, `MODEL_WORKFLOW`, `MODEL_WORKFLOW_RUN`, `MODEL_NODE_EXECUTION`, `MODEL_NOTE`, `MODEL_TAG`.
  - Trong các entry còn lại, bỏ mọi tham chiếu tới id/file vừa xoá (`notes-editor.keyFiles` bỏ `app/api/notes/*`, `dataModels` để `[]`; `storage-media.keyFiles` bỏ `app/api/storage/*`, `logic/storage/*`, `dataModels` để `[]`, summary bỏ "workflow documents").
  - Cập nhật `headCommit` và `generatedAt`. Chạy `yarn intel status`, kết quả phải không lỗi.
- [x] **Step 5.4 (SDK dist)**: `git rm -r --cached roadmap-rag-assistant/sdk/typescript/dist` rồi xoá thư mục, thêm `roadmap-rag-assistant/sdk/typescript/dist/` vào `.gitignore`.
- [x] **Step 5.5 (Skills)**: xoá `.agents/skills/fireworks-tech-graph/` (không có `SKILL.md`), bỏ entry `fireworks-tech-graph` và `next-dev-loop` trong `skills-lock.json`.
- [x] **Step 5.6 (Test thủ công)**:
  - Tạo `tests/manual/dead-code-cleanup.md` theo quy ước `tests/manual/README.md` và thêm 1 dòng vào bảng "Kịch bản".
  - Các case:
    - (C1) Ở `/portfolio`, hỏi Cris AI về dự án Kamala, bấm chip project thì modal Kamala mở.
    - (C2) Câu trả lời không chứa thẻ `[[action:roadmap` hiện nguyên chuỗi.
    - (C3) `GET /sitemap.xml` không có `/knowledge`, `/docs`.
    - (C4) Với topic `QA Sandbox`: `PATCH /api/v1/roadmaps/QA%20Sandbox/sections` theo **title** đổi tên được một section; xoá topic sau khi chạy.
    - (C5) `GET /api/v1/topics`, `/api/workflows`, `/api/notes` đều trả 404.
  - Ghi kết quả (ngày, commit, môi trường).
- [x] **Step 5.7 (Gate và commit)**:
  - Chạy toàn bộ `verification_gate`; `dead_refs` phải rỗng.
  - Commit một lần với message `chore: remove leftovers of removed features and unused tables (TASK-dead-code-cleanup-001)` cùng body liệt kê 5 phase.
  - Điền mục 4 và 5, đặt `status: COMPLETED`.

### Ngoài phạm vi executor (Owner / Architect làm sau)
- Owner drop bảng trên Turso production **sau khi branch đã deploy**:
  - Backup trước bằng `turso db shell <db> .dump > turso-backup-<ngày>.sql`.
  - Chạy `DROP TABLE IF EXISTS` lần lượt cho 15 bảng ở mục 1, cùng `RoadmapGroup` và `RoadmapLayer` (nếu còn sót).
  - Kiểm tra bằng `.tables`.
- Architect: ADR-0011 (amends ADR-0006) và cập nhật `GLOSSARY.md` (bỏ mục Workflow Builder và các thuật ngữ API Docs). Chỉ làm khi Owner cho phép.
- Chạy lại `gitnexus analyze --skip-agents-md` sau khi merge.

## 4. Verification Gate Results
- [x] `TypeCheck`: PASS (`yarn tsc --noEmit -p .` - 0 errors)
- [x] `Lint`: PASS (`yarn eslint` on all modified files - 0 errors, 0 warnings)
- [x] `Test`: PASS (`yarn test` - 68 test files passed, 810 passed | 8 skipped)
- [x] `Schema Check`: PASS (`yarn test:schema-sql --check` - Schema fixture is up to date)
- [x] `Knowledge Index`: PASS (`yarn check:knowledge-index` - Vector index is up to date)
- [x] `Test Python`: PASS (`cd roadmap-rag-assistant && .venv/bin/python -m pytest -q` - 1001 passed in 20.74s)
- [x] `Intel Status`: PASS (`yarn intel status` - Index Status: 🟢 FRESH (Đồng bộ))
- [x] `Dead Refs`: PASS (`git grep -n -E ...` - 0 occurrences found)
- [x] `Manual (tests/manual/dead-code-cleanup.md)`: PASS (5/5 cases Pass: C1-C5)
- [x] `Boundary Check`: PASS (`git status --porcelain` - all 264 files strictly within allowed_to_modify)

## 5. Execution Audit Log
- **Git Commit Hash**: Xem commit duy nhất trên branch `chore/dead-code-cleanup` (`git log -1 chore/dead-code-cleanup`)
- **Blockers & Callers outside allowed_to_modify**:
  - Tại **Step 1.5**: `lib/roadmap/types.ts` khi bỏ `slug?` khỏi `ChecklistItem`, `yarn tsc --noEmit -p .` phát hiện 2 file ngoài `allowed_to_modify` đang đọc `item.slug`:
    1. `app/page.tsx:216`: `setItem(found ? found.slug || slugify(found.title) : id);`
    2. `hooks/use-roadmap.ts:72`: `list.find((i) => i.id === wanted || i.slug === wanted || i.title === wanted)`
  - **Resolution**: User phê duyệt thực hiện **Phương án B** ("Follow B"). Đã bổ sung `app/page.tsx` và `hooks/use-roadmap.ts` vào `boundaries.allowed_to_modify`:
    - `app/page.tsx`: dùng `slugify(found.title)` thay cho `found.slug`.
    - `hooks/use-roadmap.ts`: dùng `slugify(i.title) === wanted` thay cho `i.slug === wanted`.
    - `lib/roadmap/types.ts`: gỡ bỏ hoàn toàn `slug?: string` khỏi `ChecklistItem`.
    - `app/api/v1/roadmaps/[slug]/route.ts`: gỡ bỏ `slug: slugify(item.title)` và import `slugify`.
- **Modified & Deleted Files**:
  - `lib/ai/action-chips.ts`
  - `app/api/chat/route.ts`
  - `components/projects-section.tsx`
  - `components/floating-bot/FloatingChatDrawer.tsx`
  - `components/floating-bot/FloatingChatBot.tsx`
  - `components/site-chatbot.tsx`
  - `app/sitemap.ts`
  - `app/page.tsx`
  - `hooks/use-roadmap.ts`
  - `lib/roadmap/resolveRoadmap.ts`
  - `lib/roadmap/types.ts`
  - `app/api/v1/roadmaps/[slug]/route.ts`
  - `app/api/v1/roadmaps/[slug]/sections/route.ts`
  - `logic/api-fetch.ts`
  - `logic/roadmap/roadmapService.ts`
  - `logic/roadmap/knowledgeTriageService.ts`
  - `logic/roadmap/roadmapAssistantService.ts`
  - `lib/image-upload.ts`
  - `lib/r2-client.ts`
  - `components/json-ld.tsx`
  - `package.json`
  - `yarn.lock`
  - `.gitignore`
  - `.env.example`
  - `lib/auth/owner-access.ts`
  - `public/llms.txt`
  - `prisma/schema.prisma`
  - `prisma/init-turso.sql`
  - `prisma/seed.ts`
  - `prisma/dev.db`
  - `roadmap-rag-assistant/tests/fixtures/schema.sql`
  - `tests/unit/action-chips.test.ts`
  - `tests/unit/anti-slop.test.ts`
  - `tests/unit/m2-adversarial-stress.test.ts`
  - `tests/unit/m2-challenger-stress.test.ts`
  - `tests/unit/assistant-style2-drawer.test.tsx`
  - `tests/unit/assistant-adversarial.test.tsx`
  - `tests/unit/assistant-viewport-adversarial.test.tsx`
  - `tests/unit/assistant-viewport-ergonomics.test.tsx`
  - `tests/unit/projects-section.test.tsx`
  - `tests/route/roadmap-sections-route.test.ts`
  - `tests/route/write-access.test.ts`
  - `tests/e2e/test-helpers.ts`
  - `tests/e2e/tier1-r2-anti-slop.test.ts`
  - `tests/e2e/tier1-r3-action-chips.test.ts`
  - `tests/e2e/tier3-cross-feature-interactions.test.ts`
  - `tests/e2e/tier4-real-world-scenarios.test.ts`
  - `tests/manual/README.md`
  - `tests/manual/dead-code-cleanup.md`
  - `docs/README.md`
  - `docs/PROJECT_STRUCTURE.md`
  - `docs/NOTION_FAVORITES_SETUP.md`
  - `docs/RAG_PRODUCTION_READINESS.md`
  - `docs/code-intel/CRIS_WORKSPACE_MAP.md`
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`
  - `skills-lock.json`
  - `.handoff/specs/TASK-dead-code-cleanup-001.md`
  - Deleted directories & components: `components/{workflow-canvas,knowledge,mapping-flow,unlock-gate}/`, `components/{site-lock-gate,gradient-text,skill-card}.tsx`, `components/ui/{accordion,animated-grid-pattern,badge,confirm-popover,magnifier-spinner,spinning-text}.tsx`, `hooks/use-unlock.ts`, `components/floating-bot/{FloatingChatPopup,ChatTriggerButton}.tsx`
  - Deleted backend & routes: `types/knowledge.ts`, `lib/knowledge/`, `app/api/v1/{topics,skills,mcps,agents,projects,notes,search,graph,recommendations,openapi}/`, `app/api/v1/clipper/`, `app/api/{docs,notes,storage,workflows}/`, `lib/workflow/`, `logic/workflow/`, `logic/storage/`, `proxy.ts`, `scripts/eval-kb.ts`, `scripts/seed-sample-workflow.ts`, `public/llms-full.txt`
  - Deleted tests: `tests/unit/workflow-*.test.ts`, `tests/route/workflow-*.test.ts`, `tests/unit/assistant-style1.test.tsx`, `tests/unit/stream-parts.test.ts`
  - Deleted database migrations & unused models: `prisma/migrations/`, 15 Prisma models dropped from schema and dev.db
  - Deleted docs backups & moved archives: `docs/backup*.md`, `docs/backup*.json`, moved `docs/workflow-builder-*.md` to `docs/archive/`
  - Cleaned skills & SDK dist: `.agents/skills/fireworks-tech-graph/`, `roadmap-rag-assistant/sdk/typescript/dist/`
