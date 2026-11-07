---
task_id: "TASK-topic-chapters-001"
branch: "feat/topic-chapters"
version: "2.0.0"
priority: "P1"
status: "DRAFT" # Chờ Owner chốt các câu hỏi ở mục 0 và viết ADR trước khi chuyển READY
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "prisma/schema.prisma"
    - "prisma/init-turso.sql"
    - "scripts/migrate-sections-to-chapters.ts"
    - "app/api/v1/roadmaps/[slug]/**"
    - "app/api/v1/roadmaps/triage/**"
    - "logic/roadmap/**"
    - "lib/roadmap/**"
    - "hooks/use-roadmap.ts"
    - "components/roadmap/**"
    - "roadmap-rag-assistant/rag_service/adapters/**"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/**"
    - "roadmap-rag-assistant/rag_service/tools/**"
    - "roadmap-rag-assistant/tests/**"
    - "tests/**"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
  read_only_references:
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "GLOSSARY.md"
    - "scripts/flatten-to-sections.ts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "docs/adr/**"   # ADR do Owner/Claude viết trong buổi /grill-with-docs, không phải executor
    - "GLOSSARY.md"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test && yarn test:schema-sql --check && yarn check:knowledge-index"
  python: "cd roadmap-rag-assistant && python -m pytest -q && python -m evals validate"
  boundary_check: "git status --porcelain"
---

# TASK: Chương (Section có thứ tự) cho Topic

Owner muốn chia các Lesson của một Topic thành **chương rõ ràng, có thứ tự**, dùng lâu dài. Hiện UI đang tắt Section bằng cờ `SECTIONS_ENABLED = false` (`components/roadmap/sectionsEnabled.ts`); dữ liệu `RoadmapItem.section` vẫn còn.

## 0. Quyết định cần Owner chốt trước khi làm

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Tên khái niệm | Giữ **Section** trong code và glossary (ADR-0007: code mới theo tên đang có). UI hiển thị là "Chương". Thêm "chương" vào `_Also_` của Section. Không tạo model `Chapter` mới. |
| Q2 | Lesson có bắt buộc thuộc một chương không? | **Không bắt buộc khi tạo.** Lesson chưa xếp nằm ở khay "Chưa xếp chương" cuối topic, để ghi nhanh vẫn được. UI nhắc xếp chương. |
| Q3 | Chương có mô tả không? | Có, tuỳ chọn (một dòng). |
| Q4 | Đánh số chương | Hiển thị tự động "Chương 1, 2…" theo thứ tự; số không lưu trong DB. |
| Q5 | Xoá chương | Mặc định: Lesson chuyển về "Chưa xếp chương", không xoá bài. |
| Q6 | Visitor có thấy chương rỗng không? | Không; chỉ Owner thấy chương rỗng. |

ADR mới (ví dụ ADR-0011 "Section thành bảng riêng có thứ tự") phải được viết trong buổi `/grill-with-docs` trước khi chuyển task sang READY. ADR-0009 đã dự liệu bước này: *"nếu sau này cần mô tả hay thứ tự riêng thì tách bảng khi đó"*. ADR-0009 được đánh dấu `superseded by ADR-0011` (hoặc giữ nguyên nếu ADR mới chỉ mở rộng).

## 1. Context & Architectural Intent

- **Goal**: Section trở thành thực thể riêng có `order` và `description`, để Topic hiển thị như một mục lục chương.
- **Why**: Thứ tự section hiện suy ra từ Lesson đầu tiên; đổi tên phải sửa mọi Lesson; không có chỗ cho mô tả; chương rỗng không tồn tại được. Những điều này không hợp với "chia rõ theo chương".
- **Pre-flight (`yarn intel how-to-sync`)**: 🟢 không vi phạm ADR invariant, không dùng từ cấm. Cần sync: schema + Turso, RAG re-index, code-intel map. Flow bị ảnh hưởng: `FLOW_ABOT_CHAT_QUERY`, `FLOW_ABOT_CUD_PREVIEW_CONFIRM`, `FLOW_TOPIC_SECTION_REORGANIZE`.
- **Lưu ý Glossary**: "bài viết" và "post" nằm trong `_Avoid_` của Lesson. Dùng Lesson / `RoadmapItem`.

## 2. Thiết kế dữ liệu

```prisma
model RoadmapSection {
  id          String        @id @default(uuid(7))
  roadmapId   String
  roadmap     Roadmap       @relation(fields: [roadmapId], references: [id], onDelete: Cascade)
  title       String
  description String?
  order       Int           @default(0)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  items       RoadmapItem[]

  @@unique([roadmapId, title])
  @@index([roadmapId, order])
}

model RoadmapItem {
  // ...
  sectionId String?
  section   RoadmapSection? @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  order     Int @default(0) // thứ tự TRONG chương (hoặc trong khay chưa xếp)
}
```

- `KnowledgeTriage.section` (string) đổi sang `sectionId`, hoặc giữ string và resolve khi duyệt. Chọn cách ít đụng nhất; ghi lại lựa chọn.
- So khớp tên chương vẫn theo `normalizeTitle()` như ADR-0009.
- Trường `RoadmapItem.section` (string) giữ lại trong một bản phát hành để rollback, rồi xoá ở task sau.

## 3. Step-by-Step Implementation Checklist

- [ ] **Step 1 (Schema + migration)**
  - Thêm `RoadmapSection` và `RoadmapItem.sectionId`.
  - Viết `scripts/migrate-sections-to-chapters.ts`: mỗi section string khác nhau trong một Topic thành một `RoadmapSection`, `order` theo thứ tự hiện tại (thứ tự của Lesson đầu tiên), rồi gán `sectionId`. Mặc định chạy thử; chỉ ghi khi có `--apply`. Giống `scripts/flatten-to-sections.ts`, kèm file backup JSON.
  - Cập nhật `prisma/init-turso.sql`, chạy `yarn test:schema-sql --check`.
  - Turso production chỉ chạy sau khi Owner xem dry-run.
- [ ] **Step 2 (API Next.js, `app/api/v1/roadmaps/[slug]/sections`)**
  - Tạo chương, đổi tên, sửa mô tả, sắp xếp lại thứ tự, xoá (Lesson về khay chưa xếp).
  - Chuyển Lesson sang chương khác; sắp xếp Lesson trong chương.
  - Chỉ Owner (ADR-0002).
  - Mọi thao tác CUD gọi `after(requestRagReindex)`.
- [ ] **Step 3 (Service/hook)**: `logic/roadmap/roadmapService.ts`, `hooks/use-roadmap.ts` trả `sections[]` (có thứ tự) và Lesson theo `sectionId`. Bỏ cách suy thứ tự từ Lesson đầu tiên.
- [ ] **Step 4 (UI, `components/roadmap/**`)**
  - Bật lại `SECTIONS_ENABLED`.
  - Danh sách: "Chương N · Tiêu đề", mô tả một dòng, thu gọn và mở rộng, đếm bài.
  - Owner: kéo thả để đổi thứ tự chương, kéo Lesson giữa các chương, tạo chương rỗng, sửa/xoá qua menu ⋮. Khay "Chưa xếp chương" ở cuối.
  - Chế độ bản đồ (`RoadmapMap`): mỗi chương là một trạm theo đúng thứ tự.
  - Tạo bài: chọn chương từ danh sách (không còn ô chữ tự do), mặc định là chương đang mở.
  - Chi tiết bài (`DetailPanel`): hiện "Chương N · Tiêu đề", có điều hướng bài trước/sau theo chương.
  - Mobile trước. Giữ các quy ước UI hiện có (16px body, tương phản AA).
- [ ] **Step 5 (Abot, `roadmap-rag-assistant`)**
  - `adapters/sections.py`, `http_adapter.py`, `sqlite_adapter.py` đọc chương có thứ tự.
  - Tool tạo Lesson nhận tên chương. Thêm tool tạo/đổi tên/sắp xếp chương, đều đi qua Preview → Confirm (`FLOW_ABOT_CUD_PREVIEW_CONFIRM`).
  - Metadata ingestion (`retrieval/ingestion.py`) ghi tên chương và số thứ tự để câu trả lời trích "Chương 2: …".
  - Cập nhật prompts và evals liên quan. `python -m pytest -q`, `python -m evals validate`.
- [ ] **Step 6 (Triage)**: duyệt Knowledge Triage chọn đích là chương (danh sách), không còn chuỗi tự do.
- [ ] **Step 7 (Tests)**
  - Unit test: migration (dry-run không ghi; `--apply` tạo đúng chương và thứ tự).
  - Route test: CRUD chương, quyền Owner, xoá chương giữ Lesson.
  - UI test: thứ tự chương và đánh số.
- [ ] **Step 8 (Code intel)**: cập nhật `cris-workspace-map.json` (model `RoadmapSection`, route chương, flow `FLOW_TOPIC_SECTION_REORGANIZE`), chạy `yarn intel status`.

## 4. Ngoài phạm vi

- Xoá trường `RoadmapItem.section` (string): để task sau, khi đã chạy ổn trên production.
- Chương lồng nhau (chương con).
- Tag nhiều-nhiều cho Lesson.
- Visitor thấy tiến độ theo chương (Lesson Status vẫn chỉ Owner thấy, ADR-0010).

## 5. Verification Gate Results

- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `Test` (+ schema-sql, knowledge-index): PENDING
- [ ] `Python` (pytest + evals): PENDING
- [ ] `Boundary Check`: PENDING

## 6. Execution Audit Log

- **Git Commit Hash**: `Chưa có`
- **Modified Files**: (executor điền)
