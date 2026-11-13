# Handoff Report: Database Schemas, API Routes & Documentation Audit

**Agent:** `teamwork_explorer_schema_docs`  
**Milestone:** M4 Audit  
**Date:** 2026-11-10  
**Scope:** Workspace-wide audit of Database Schemas & Migrations, API Route Handlers, and Documentation/Specs alignment.  
**Integrity Mode:** Strictly read-only. No source files modified.

---

## 1. Observation

### Track 1: Database Schemas & Migrations

1. **Schema DDL Consistency**:
   - `prisma/schema.prisma` defines 2 models: `Roadmap` (lines 18–30) and `RoadmapItem` (lines 32–50).
   - `prisma/init-turso.sql` defines `CREATE TABLE IF NOT EXISTS "Roadmap"` (lines 2–12), `CREATE TABLE IF NOT EXISTS "RoadmapItem"` (lines 15–28), and 3 indexes: `Roadmap_slug_key` (line 31), `RoadmapItem_roadmapId_idx` (line 34), and `RoadmapItem_roadmapId_title_key` (line 37).
   - `roadmap-rag-assistant/tests/fixtures/schema.sql` mirrors `init-turso.sql` (lines 2–38).
   - Command `yarn test:schema-sql --check` returned exit code 0 with message: `"Schema fixture is up to date."`
   - Command `sqlite3 prisma/dev.db ".tables"` returned exactly: `Roadmap  RoadmapItem`.

2. **Column & View References**:
   - All columns on `Roadmap` (`id`, `slug`, `title`, `description`, `icon`, `order`, `isLocked`, `createdAt`, `updatedAt`) are actively mapped to TypeScript (`lib/roadmap/types.ts:4–21`) and Python (`rag_service/adapters/sqlite_adapter.py:91–112`).
   - All columns on `RoadmapItem` (`id`, `roadmapId`, `section`, `title`, `description`, `content`, `order`, `status`, `statusUpdatedAt`, `createdAt`, `updatedAt`) are mapped to TypeScript (`lib/roadmap/types.ts:23–43`) and Python (`rag_service/adapters/sqlite_adapter.py:79–83`, `rag_service/domains/roadmap/lesson_status.py`).

3. **Supabase**:
   - `grep_search` for `supabase` across the entire workspace returned 0 results. No Supabase configuration, schema, or tables exist.

4. **Legacy / Leftover Artifacts in Schema & Data Scripts**:
   - **`Roadmap.icon` Default**: `prisma/schema.prisma:23` sets `@default("Layers")`, and `prisma/init-turso.sql:7` sets `DEFAULT 'Layers'`. While "Layers" is a valid Lucide icon name, the concept of "Layer" was formally superseded by "Topic" and "Section" in ADR-0009.
   - **`scripts/import-seed-lessons.ts:76`**:
     ```typescript
     70: const existingRes = hasRoadmapId
     71:   ? await client.execute({
     72:       sql: 'SELECT id, title, "order" FROM "RoadmapItem" WHERE roadmapId = ?',
     73:       args: [roadmapId],
     74:     })
     75:   : await client.execute({
     76:       sql: 'SELECT i.id, i.title, i."order" FROM "RoadmapItem" i JOIN "RoadmapGroup" g ON i.groupId = g.id JOIN "RoadmapLayer" l ON g.layerId = l.id WHERE l.roadmapId = ?',
     77:       args: [roadmapId],
     78:     });
     ```
     Lines 75–78 query `RoadmapGroup` and `RoadmapLayer` if `roadmapId` is absent. Since the migration to ADR-0009 has already dropped those tables, this fallback branch is unreachable dead code.
   - **`roadmap-rag-assistant/tests/data/group_cases.json`**:
     File contains 15 lines of test cases for selecting groups:
     ```json
     "_comment": "Shared by tests/test_group_required.py (Python) and tests/unit/roadmap-groups.test.ts (TypeScript): the group a lesson goes to (ADR-0008). Keep pick_group and pickGroup equal to these rows."
     ```
     Neither `tests/test_group_required.py` nor `tests/unit/roadmap-groups.test.ts` exist in the repo. The file is completely unreferenced by any test or source file.
   - **`SqliteAdapter.update_item` Status Gap**:
     `rag_service/adapters/sqlite_adapter.py:233–260` accepts `**kwargs` but only extracts `title`, `description`, and `section`. Unlike `HttpApiAdapter` and Next.js route `app/api/v1/roadmaps/items/[id]/route.ts`, `SqliteAdapter` does not update `status` or `statusUpdatedAt`.

---

### Track 2: API Routes Audit

Across the Next.js app, exactly 21 `route.ts` files exist under `app/api/`. In the Python service, 7 endpoints are declared in `rag_service/api/routes.py`.

#### Next.js Route Inventory Table (`app/api/**/route.ts`)

| # | Route Path | HTTP Methods | Callers / Consumers | Status | Evidence (`file:line`) |
|---|---|---|---|---|---|
| 1 | `app/api/auth/[...nextauth]/route.ts` | GET, POST | NextAuth client (`signIn`, `signOut`, session) | **Active** | `app/api/auth/[...nextauth]/route.ts:3` |
| 2 | `app/api/backup-notes/route.ts` | POST | Notes Backup UI | **Active** | `app/notes/NotesClient.tsx:325` |
| 3 | `app/api/chat/feedback/route.ts` | POST | Cris AI Feedback widget | **Active** | `hooks/use-floating-chat.ts:167` |
| 4 | `app/api/chat/route.ts` | POST | Cris AI portfolio chatbot | **Active** | `hooks/use-floating-chat.ts:251` |
| 5 | `app/api/favorites/route.ts` | GET, POST, DELETE | Notion tag favorites in Notes | **Active** | `app/notes/NotesClient.tsx:88, 142, 175` |
| 6 | `app/api/posts/route.ts` | GET, POST | Notion posts management | **Active** | `app/notes/NotesClient.tsx:75, 412` |
| 7 | `app/api/posts/[id]/route.ts` | GET, PATCH, DELETE | Notion post editing & archive | **Active** | `app/notes/NotesClient.tsx:432, 458` |
| 8 | **`app/api/posts/slug/[slug]/route.ts`** | **GET** | **NONE (0 callers)** | **ORPHANED** | `app/notes/[slug]/page.tsx:17` directly imports `getPostBySlug` via Server Component. Route has 0 clients and 0 tests. |
| 9 | `app/api/roadmap-assistant/[...path]/route.ts` | GET, POST | Abot frontend client | **Active** | `logic/roadmap/roadmapAssistantService.ts:14` |
| 10 | `app/api/roadmap-assistant/me/route.ts` | GET | `useCanWrite` hook | **Active** | `hooks/use-can-write.ts:14` |
| 11 | `app/api/tags/route.ts` | GET, POST | Notion tag list & creation | **Active** | `app/notes/NotesClient.tsx:76, 521` |
| 12 | `app/api/tags/[id]/route.ts` | GET, PATCH, DELETE | Notion tag edit & deletion | **Active** | `app/notes/NotesClient.tsx:542, 568` |
| 13 | `app/api/upload-image/route.ts` | POST | Lexical Toolbar & Paste plugins | **Active** | `components/ui/editor/plugins/ToolbarPlugin/index.tsx:112`, `PasteImagePlugin/index.tsx:45` |
| 14 | `app/api/v1/roadmaps/route.ts` | GET, POST | Roadmap list & create topic | **Active** | `hooks/use-roadmap.ts:127, 241` |
| 15 | `app/api/v1/roadmaps/[slug]/route.ts` | GET, PATCH, DELETE | Topic view, update, delete | **Active** | `hooks/use-roadmap.ts:74, 281, 310` |
| 16 | `app/api/v1/roadmaps/[slug]/sections/route.ts` | PATCH, DELETE | Section rename & dissolve | **Active** | `hooks/use-roadmap.ts:335, 360` |
| 17 | `app/api/v1/roadmaps/full-export/route.ts` | GET | Abot knowledge ingestion | **Active** | `rag_service/adapters/http_adapter.py:45` |
| 18 | `app/api/v1/roadmaps/items/route.ts` | POST | Add lesson to topic | **Active** | `hooks/use-roadmap.ts:153`, `http_adapter.py:87` |
| 19 | `app/api/v1/roadmaps/items/reorder/route.ts` | POST | Drag-and-drop lesson reordering | **Active** | `hooks/use-roadmap.ts:215` |
| 20 | `app/api/v1/roadmaps/items/[id]/route.ts` | PATCH, DELETE | Update/delete lesson | **Active** | `hooks/use-roadmap.ts:182, 201`, `http_adapter.py:105` |
| 21 | `app/api/v1/roadmaps/items/[id]/content/route.ts` | PATCH | Update lesson Lexical content | **Active** | `hooks/use-roadmap.ts:192` |

#### Python FastAPI Endpoints (`roadmap-rag-assistant/rag_service/api/routes.py`)

| # | Endpoint | Method | Caller | Status | Evidence |
|---|---|---|---|---|---|
| 1 | `/chat/stream` | POST | Next.js reverse proxy | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:12` |
| 2 | `/chat` | POST | Next.js reverse proxy | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:12` |
| 3 | `/chat/plan` | POST | Next.js reverse proxy | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:12` |
| 4 | `/health` | GET | Next.js proxy & uptime checks | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:13` |
| 5 | `/internal/reindex` | POST | Next.js reindex trigger | **Active** | `lib/roadmap/rag-reindex.ts:32`, `scripts/import-seed-lessons.ts:34` |
| 6 | `/chat/confirm` | POST | Next.js reverse proxy | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:12` |
| 7 | `/chat/cancel` | POST | Next.js reverse proxy | **Active** | `app/api/roadmap-assistant/[...path]/route.ts:12` |

---

### Track 3: Documentation & Specs Audit

1. **`GLOSSARY.md`**:
   - **Lines 107–144 (`## Workflow Builder`)**:
     Defines 9 domain terms: `Project`, `Document`, `Chunk`, `Workflow`, `Draft`, `Version`, `Node`, `Run`, `Node Execution`.  
     *Fact:* The entire Workflow Builder codebase (`components/workflow-canvas/**`, `lib/workflow/**`, `logic/workflow/**`, `app/api/workflows/**`) was completely deleted and archived under `docs/archive/workflow-builder-*.md` in `TASK-dead-code-cleanup-001`. There is zero runtime workflow code in the repository.
   - **Lines 159–170 (`## Notes & API Docs`)**:
     Defines `API Endpoint`, `Feature`, and `Role` as:
     `"Một API được ghi trong trang API Docs, thuộc một Feature."`
     `"Nhóm API Endpoint theo chức năng sản phẩm."`
     `"Vai trò người dùng của hệ thống được mô tả trong API Docs..."`  
     *Fact:* No "API Docs" page or route exists in the workspace.
   - **Line 17 vs Backend Python code**:
     `GLOSSARY.md:17` states `_Avoid_: layer, group, category, module, domain, level`.  
     However:
     - `roadmap-rag-assistant/rag_service/api/schemas.py:27` states `description="Page context from the web client: roadmapSlug, layerId, itemId"`.
     - `roadmap-rag-assistant/rag_service/api/server.py:59` states `description="Mini RAG service for CUD operations on Topic/Layer/Group/Item via natural language"`.

2. **`docs/PROJECT_STRUCTURE.md`**:
   - Completely obsolete documentation of an early single-page portfolio layout:
     - Line 5: Mentions `Next.js 16.2.1 + React 19.2.4 portfolio website`.
     - Lines 9–71: Missing `roadmap-rag-assistant/`, `prisma/`, `app/api/`, `app/notes/`, `app/portfolio/`, `auth.ts`, `lib/roadmap/`, `lib/ai/`.
     - Lists deleted files as active: `components/unlock-gate/`, `components/site-lock-gate.tsx`, `components/skill-card.tsx`, `components/json-ld.tsx`, `lib/gtag.ts`, `app/styles/spacing.css` (all removed in `TASK-dead-code-cleanup-001`).
     - Lines 188–191: Gives `npm run dev` / `npm run build` commands when the project uses `yarn` (Yarn Berry 4.17.0).

3. **`docs/README.md`**:
   - Lines 41–46 (`## Working`): Lists only `RAG_PRODUCTION_READINESS.md`.
   - Fails to index active planning documents currently in `docs/`: `docs/abot-next-actions-plan.md`, `docs/topic-section-plan.md`, `docs/handoff-topic-section.md`.
   - `docs/handoff-topic-section.md` remains in `docs/` root with title `"Trạng thái: đang dở, chưa xong"` despite ADR-0009 having been merged and accepted.

4. **Root `README.md`**:
   - Unmodified generic boilerplate from `create-next-app`:
     - Line 17: Lists `http://localhost:3000` (actual project port is 3334).
     - Line 21: Mentions `Geist` font (project uses Inter, JetBrains Mono, Fraunces).
     - Contains no description of the repository's domains, architecture, or services.

5. **`docs/RAG_PRODUCTION_READINESS.md`**:
   - Outdated backlog from 2026-10-15:
     - Line 28: Mentions `topic, layer, group và item`.
     - Lines 16, 47: Mentions `triage` and `KnowledgeTriage`, which were abolished by ADR-0011.

---

## 2. Logic Chain

1. **Database Schema Logic**:
   - `test:schema-sql --check` validates that `prisma/schema.prisma` matches `roadmap-rag-assistant/tests/fixtures/schema.sql` (Observation 1.1).
   - Direct SQLite introspection on `prisma/dev.db` confirms only tables `Roadmap` and `RoadmapItem` exist (Observation 1.1).
   - Cross-referencing all columns across TypeScript definitions and Python queries confirms all 9 columns of `Roadmap` and all 11 columns of `RoadmapItem` are actively used in UI, indexing, and API handlers (Observation 1.2).
   - In `scripts/import-seed-lessons.ts:70–78`, the check `hasRoadmapId` evaluates to `true` on every database migrated to ADR-0009. The `else` branch (lines 75–78) querying `RoadmapGroup` and `RoadmapLayer` will never execute because those tables have already been dropped. Thus, lines 75–78 represent residual dead code (Observation 1.4).
   - In `roadmap-rag-assistant/tests/data/group_cases.json`, the test cases were created for ADR-0008 ("Drop level, group by name"). When ADR-0009 ("Topic holds lessons by section") replaced groups with sections, the tests referencing this file were deleted, leaving this fixture completely orphaned (Observation 1.4).

2. **API Routes Logic**:
   - We mapped all 21 `route.ts` files under `app/api/` and inspected their consumers across the entire codebase (Observation 2.1).
   - For `app/api/posts/slug/[slug]/route.ts`:
     - `grep_search` across `app/`, `components/`, `lib/`, `hooks/`, `logic/`, and `tests/` yielded zero occurrences of `/api/posts/slug` outside its own file definition (Observation 2.1, Row 8).
     - Examination of `app/notes/[slug]/page.tsx:16–19` revealed that the page is a React Server Component that directly calls the server library function `getPostBySlug(slug)` from `@/lib/notion`. It does not dispatch any HTTP request to `/api/posts/slug/[slug]`.
     - Therefore, `app/api/posts/slug/[slug]/route.ts` is an orphaned endpoint with zero consumers and zero test coverage.
   - For all other 20 Next.js routes and 7 Python FastAPI endpoints, active consumers (UI hooks, background triggers, or proxy forwarders) were directly identified and verified (Observation 2.1, 2.2).

3. **Documentation Drift Logic**:
   - `GLOSSARY.md` was designed as the authoritative single source of domain language (`_Also_` / `_Avoid_`) per ADR-0007.
   - However, `TASK-dead-code-cleanup-001` completed the retirement and deletion of all Workflow Canvas and Workflow Builder code. The preservation of lines 107–144 in `GLOSSARY.md` creates semantic confusion for agents and developers who might assume workflow builder functionality still exists (Observation 3.1).
   - Similarly, lines 159–170 define concepts specifically for a "trang API Docs" which does not exist in the project (Observation 3.1).
   - `docs/PROJECT_STRUCTURE.md` was created prior to the migration to the hybrid Next.js + Python architecture and has not been maintained, listing deleted components and wrong commands (Observation 3.2).
   - Root `README.md` is default uncustomized create-next-app boilerplate, misrepresenting ports, fonts, and project scope (Observation 3.4).

---

## 3. Caveats

1. **Turso Production Database**:
   - Local database (`prisma/dev.db`) was inspected directly using `sqlite3`. Remote Turso database was not connected to or queried during this read-only audit to avoid external network dependencies. However, `prisma/init-turso.sql` and `scripts/push-turso-schema.ts` match `prisma/schema.prisma` exactly.
2. **Third-Party External Webhooks**:
   - No external webhooks call `app/api/posts/slug/[slug]/route.ts`. The Notion integration is outbound-only (client/server calls Notion API via `@notionhq/client`). There are no inbound webhooks configured for posts.
3. **Historical ADRs**:
   - ADRs 0003 and 0008 are formally marked `superseded by ADR-0011` and `superseded by ADR-0009` respectively. Their references to `KnowledgeTriage`, `layer`, and `group` are historical architectural records and are correctly preserved.

---

## 4. Conclusion

1. **Database Schema & Migrations**:
   - Database schema is lean and strictly normalized around `Roadmap` and `RoadmapItem`. There are no unused tables or columns in `prisma/schema.prisma`.
   - **Remediation recommendations**:
     - Remove dead fallback query in `scripts/import-seed-lessons.ts:75–78`.
     - Delete orphaned fixture `roadmap-rag-assistant/tests/data/group_cases.json`.
     - Align `SqliteAdapter.update_item` in `rag_service/adapters/sqlite_adapter.py` to support `status` and `statusUpdatedAt`.

2. **API Routes**:
   - 20 of 21 Next.js routes and all 7 Python FastAPI routes are active, well-guarded, and properly wired.
   - **Remediation recommendations**:
     - Remove or deprecate orphaned route `app/api/posts/slug/[slug]/route.ts`.

3. **Documentation**:
   - Noticeable documentation drift exists in `GLOSSARY.md`, `docs/PROJECT_STRUCTURE.md`, `docs/README.md`, and root `README.md`.
   - **Remediation recommendations**:
     - Deprecate or remove `## Workflow Builder` and `API Docs` sections from `GLOSSARY.md`.
     - Update `rag_service/api/schemas.py:27` and `rag_service/api/server.py:59` to replace `layerId` and `Layer/Group` with `section`.
     - Rewrite `docs/PROJECT_STRUCTURE.md` to reflect the hybrid architecture, or replace it with a reference to `docs/code-intel/CRIS_WORKSPACE_MAP.md`.
     - Move `docs/handoff-topic-section.md` and `docs/topic-section-plan.md` to `docs/archive/`.
     - Update root `README.md` with accurate project description, architecture diagram, and port instructions (`3334`).

---

## 5. Verification Method

To independently verify all findings in this report, execute the following commands and file inspections:

1. **Verify Schema Fixture & SQLite State**:
   ```bash
   yarn test:schema-sql --check
   sqlite3 prisma/dev.db ".schema"
   ```
   *Expected:* Output confirms schema fixture is up to date and only `Roadmap` and `RoadmapItem` tables exist.

2. **Verify Orphaned Route `posts/slug`**:
   ```bash
   git grep "posts/slug"
   git grep "getPostBySlug"
   ```
   *Expected:* Shows zero callers of `/api/posts/slug` from client components; `app/notes/[slug]/page.tsx` calls `getPostBySlug` server-side directly.

3. **Verify Test Suites (Integrity Check)**:
   ```bash
   yarn test
   cd roadmap-rag-assistant && .venv/bin/python -m pytest -q
   ```
   *Expected:* Vitest suite passes 77/77 files (887 tests passed), and Pytest suite passes 1001/1001 tests.

4. **Verify Documentation Drift in `GLOSSARY.md`**:
   ```bash
   grep -n -C 5 "Workflow Builder" GLOSSARY.md
   find components app lib logic -name "*workflow*"
   ```
   *Expected:* `GLOSSARY.md:107` defines Workflow Builder, but `find` returns zero workflow source files in the project.
