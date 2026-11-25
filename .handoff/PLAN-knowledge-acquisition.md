# PLAN: Automated Knowledge Acquisition, Statement Provenance & PKM Integration

- **Trạng thái:** `IMPLEMENTED (Phase 1 & Phase 3)`. Owner chốt 14 quyết định ngày 2026-11-23 (Mục 7). Phase 0 và Phase 1 đã lên `main` (`e83534e`, đã chạy migration Turso `KnowledgeProvenance`, kịch bản `tests/manual/knowledge-provenance.md` P1–P10 Pass). Phase 3 (`match-lessons`, `KnowledgeRelation` / `Related Lessons`, cập nhật nội dung append bảo toàn marker, Abot chat truy ngược `Lesson → External Source` cho Owner) đã triển khai ngày 2026-11-25; còn chạy `yarn db:knowledge-relations --apply` trên Turso sau khi review dry-run. Phase 2 giữ hoãn theo quyết định 2.
- **Ngày lập:** 2026-11-23 · **Rev 2:** 2026-11-23, theo báo cáo verify (Mục 9) · **Rev 3:** 2026-11-23, ghi quyết định của Owner
- **Mốc codebase đối chiếu:** `main` @ `ce7564a` (`feat(news): move inbox to /feed-ingestion and serve public news at /news/[slug]`)
- **Phạm vi liên quan:** `private-news` (tiến hóa thành `knowledge-acquisition`), `roadmap-learning`, `roadmap-assistant-abot`, `storage-media`, `auth-security`
- **Tài liệu liên hệ:** [`.handoff/PLAN-second-brain.md`](./PLAN-second-brain.md) (hợp nhất & nâng cấp Giai đoạn 2), [`GLOSSARY.md`](../GLOSSARY.md), [`docs/README.md`](../docs/README.md)

---

## 1. Mục tiêu & Vị trí trong Hệ sinh thái

Chuyển hóa kho tri thức từ quy trình nhập thủ công sang vòng đời khép kín có truy xuất nguồn gốc:

- **Trước đây:** `Human → Create Knowledge → PKM (RoadmapItem) → Abot AI`
- **Mục tiêu:** `External Sources → Automated Knowledge Acquisition → PKM (RoadmapItem + Provenance + relates) → Abot AI`

### Ranh giới Làm / Không làm

**Làm (In-Scope):**
- Tiến hóa trên nền `/feed-ingestion` + `news-ingest-worker/` hiện có thành subsystem **`Automated Knowledge Acquisition`** nối vào `RoadmapItem` (`Lesson`) và `Abot AI`.
- **Giữ nguyên Public News Site** tại `/news` và `/news/[slug]` ([`app/(public-news)/news/`](../app/(public-news)/news/page.tsx), [`lib/news/public-queries.ts`](../lib/news/public-queries.ts)) cho `Visitor` đọc tin tóm tắt. Đây là **phần duy nhất** Visitor xem được (quyết định 1).
- Bổ sung **Provenance ở cấp từng câu** (inline chip cuối mỗi câu khẳng định trong `Lesson`, MVP chỉ `derived_from`). Quan hệ giữa các Lesson (`relates`) làm ở Phase 3, `contradicts` để Phase 4.
- Cách ly tuyệt đối: **chỉ `Owner`** nhìn thấy và sử dụng dữ liệu Acquisition, Provenance Chip trong `Lesson`, `relates`, và truy ngược nguồn ngoài từ Abot AI.

**Không làm (Out-of-Scope):**
- Không xây mới một RSS Reader độc lập hay một kho lưu trữ PKM thứ hai song song với `Roadmap`/`RoadmapItem`.
- Không tạo lại bảng `KnowledgeTriage` kiểu cũ (đã drop ở [ADR-0011](../docs/adr/0011-drop-knowledge-triage.md)). Nơi duyệt là `/feed-ingestion` với bài `draft` có sẵn, không thêm trạng thái "Pending Review".
- Không đập bỏ `RoadmapItem.content` (Lexical HTML) để chia nhỏ DB thành hàng loạt bảng atom thay cho rich-text bài học.
- Không biến thành web crawler toàn Internet hoặc auto-import hàng loạt vào `RoadmapItem` thiếu kiểm duyệt (`Human-in-the-loop`). Abot chỉ đọc nguồn đã khai báo, không tìm trên web (quyết định 14).
- Không thay đổi hoặc đưa Cris AI (`/portfolio`, `components/floating-bot/**`) vào phạm vi (`AGENTS.md`).

---

## 2. Đối chiếu Hiện trạng Codebase (Baseline `ce7564a`)

| Thành phần trong Đề xuất | Thực tế đã có trong Repo | Khoảng trống / Vấn đề cần xử lý |
| :--- | :--- | :--- |
| **Source Discovery & Management** | `NewsSource` ([`prisma/schema.prisma`](../prisma/schema.prisma)), `/feed-ingestion/sources`, [`feed-discovery.ts`](../lib/news/feed-discovery.ts) (`resolveFeedUrl`), [`url-guard.ts`](../lib/news/url-guard.ts) (whitelist + SSRF), PWA `/share`. | Chỉ hỗ trợ RSS/Atom XML (`feedUrl`). Chưa có `sourceType` (`github_release`, `docs`, `api`, `web`), chưa có `fetchIntervalMinutes` riêng từng nguồn (`vercel.json` chạy 1 cron `0 4 * * *`). |
| **Knowledge Ingestion** | `NewsItem` + `IngestJob` (claim nguyên tử, lease 10p, retry 3x, dedupe `canonicalUrl` + title 72h), `news-ingest-worker/` 3 tầng (`article`/captions → Whisper → Vision). | [`processor.py`](../news-ingest-worker/news_worker/processor.py) chạy nối liền `extract_content` → `summarize_content` trong 1 job và **không lưu raw text gốc**. Nguồn gốc sửa/mất thì mất căn cứ trích xuất. |
| **Processing & AI Extraction** | [`summarizer.py`](../news-ingest-worker/news_worker/summarizer.py) sinh `title`, `tldr`, `takeaways` (1–10 ý), `tags`, `contentType`, `language` dạng JSON strict Pydantic/Zod. | Chưa có **Topic/Section Suggestion**, **Concept/Entity Extraction**, **PKM Duplicate/Linking Check** đối chiếu với `RoadmapItem` hiện có. |
| **Public News Site** | `/news` & `/news/[slug]` đọc qua [`PUBLIC_NEWS_SELECT`](../lib/news/public-queries.ts) allowlist, ẩn Abot. | [`ingest.ts`](../lib/news/ingest.ts#L89-L90) đặt `isPublic: true` cho mọi origin. `PUBLIC_NEWS_WHERE` chỉ loại `dismissed`, nên bài `cron` (`draft`) tự lên `/news` khi worker xong. **Đã chốt** (quyết định 3): `cron` mặc định `false`. |
| **Auth & quyền xem** | [`middleware.ts`](../middleware.ts) (từ commit `d01612a`): mọi trang ngoài `/login` và `/news/*` đều chuyển về `/login`. Mọi request `/api/*` **có** header `x-internal-key` hoặc `x-admin-key` (bất kể giá trị) được cho qua, route tự kiểm quyền. | **Đã chốt** (quyết định 1): giữ Owner-only, chỉ News public. Chưa có ADR (viết ADR-0018). [`full-export`](../app/api/v1/roadmaps/full-export/route.ts) và `GET /api/v1/roadmaps` không tự kiểm quyền, nên header giả dump được toàn bộ `content`: sửa ở task riêng (quyết định 12). |
| **Storage (R2)** | [`lib/r2-client.ts`](../lib/r2-client.ts) `uploadToStorage` ghi vào `uploads/`, trả URL public (`R2_PUBLIC_URL` / `r2.dev`), `Cache-Control: public, immutable`; fallback ghi `public/uploads`. | Dùng lại hàm này cho snapshot sẽ công khai toàn văn bài của bên thứ ba. **Đã chốt** (quyết định 5): Phase 1 không dùng R2; Phase 2 dùng bucket private riêng. |
| **Knowledge Integration (PKM)** | `Roadmap` (`Topic`) → `section` → `RoadmapItem` (`Lesson`) ([ADR-0009](../docs/adr/0009-topic-holds-lessons-by-section.md), [ADR-0010](../docs/adr/0010-lesson-status-known-learning-target.md)); slug Lesson toàn cục ([ADR-0014](../docs/adr/0014-topic-scoped-urls-and-heading-anchors.md), giữ quy tắc slug của ADR-0013); `POST /api/v1/roadmaps/items` đã nhận `status`, chặn trùng và cấp slug toàn cục (`allocateGlobalLessonSlug`). Lexical có `MentionNode` (là `TextNode`, có text). | **0% kết nối** từ `/feed-ingestion` sang `RoadmapItem`. Chưa có `KnowledgeProvenance`, `ProvenanceChip`. [`Editor.tsx`](../components/ui/editor/Editor.tsx) không đăng ký node nào đọc `data-provenance-ref`, nên span lạ bị bỏ khi lưu. [PATCH content](../app/api/v1/roadmaps/items/%5Bid%5D/content/route.ts) ghi thẳng `content`; Abot cũng ghi qua route này ([`http_adapter.py:137`](../roadmap-rag-assistant/rag_service/adapters/http_adapter.py)). |
| **Abot AI Exploitation** | `roadmap-rag-assistant/` (Hybrid BM25 + Gemini 768d), [`CiteChannel`](../roadmap-rag-assistant/rag_service/core/generation/cite_channel.py) + [`CitationChip.tsx`](../roadmap-rag-assistant/sdk/typescript/src/react/components/CitationChip.tsx) (package SDK `roadmap-chat-sdk`) cho câu trả lời chat, [`lesson_content.py`](../roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py). Index in-memory **dùng chung cho cả hai Actor** (ADR-0006). | Abot không biết `NewsItem`/`NewsSource`. Câu trả lời chỉ trỏ về `Topic`/`Lesson`, chưa truy ngược tới External Source (cho `Owner`). `draft_item_content` ở chế độ ghi đè sinh HTML mới, làm mất marker. |
| **LLM ngoài Abot** | `news-ingest-worker/` là service Python thứ hai, có gọi LLM (`summarizer.py`). | Chưa có ADR nào cho worker này. ADR-0001 chỉ nói về Roadmap Assistant (viết ADR-0016). |

---

## 3. Kiến trúc 3 Tầng & Bất biến Bắt buộc

> Lưu ý thuật ngữ ([`GLOSSARY.md`](../GLOSSARY.md) & [ADR-0009](../docs/adr/0009-topic-holds-lessons-by-section.md)): từ `layer` nằm trong danh sách `_Avoid_` của `Section`. Khi đưa vào code/schema/tài liệu chính thức, dùng tên tầng nghiệp vụ (`Source Subsystem`, `Knowledge Repository`, `AI Service`), tránh đặt tên model/module chứa chữ `Layer` hay `Category`.

1. **Tầng 1 — Source & Acquisition (`/feed-ingestion` + `news-ingest-worker`):**
   - Thu thập đa nguồn, chống SSRF qua `assertPublicHostname`.
   - Snapshot văn bản gốc (Phase 2): lưu ở **bucket R2 private riêng** (`R2_PRIVATE_BUCKET_NAME`, dùng chung `r2Client`), qua hàm get/put mới **không trả URL public**. **Không** dùng `uploadToStorage`. Snapshot không bao giờ được phục vụ ra ngoài; chỉ server đọc lại khi chạy pha `process`.
   - `/news` & `/news/[slug]` tiếp tục hoạt động độc lập như mặt xuất bản tin tóm tắt công khai (chỉ đọc qua `PUBLIC_NEWS_SELECT`).
2. **Tầng 2 — Knowledge Repository (`Roadmap` / `RoadmapItem` + Provenance + `relates`):**
   - `RoadmapItem` (`Lesson`) vẫn là **Single Source of Truth** cho PKM.
   - Nguồn ngoài không bao giờ tự trở thành `Lesson`: Owner chọn trên `/feed-ingestion` ("Đưa vào Lesson"), hoặc qua `Preview → ok` trong Abot.
   - **Provenance cấp câu (Hybrid):** Giữ `RoadmapItem.content` là HTML Lexical liền mạch. Mỗi câu khẳng định có nguồn gắn một `ProvenanceNode` (`DecoratorNode`) export ra `<span data-provenance-ref="..."></span>` rỗng, nối với metadata bất biến trong bảng `KnowledgeProvenance` trên Turso.
3. **Tầng 3 — AI Service (`roadmap-rag-assistant` — Abot):**
   - Giữ **2 Python services tách biệt**: `news-ingest-worker` chạy async nặng, `roadmap-rag-assistant` phục vụ chat realtime qua proxy `/api/roadmap-assistant/*` ([ADR-0001](../docs/adr/0001-roadmap-assistant-separate-python-service.md) & [ADR-0002](../docs/adr/0002-roadmap-assistant-access-via-proxy.md) chỉ nói về Roadmap Assistant). **ADR-0016** ghi ranh giới LLM: worker chỉ trích xuất và tóm tắt **một** item, không biết gì về PKM. Mọi suy luận đối chiếu với `Lesson` (gợi ý Topic/Section, trùng lặp, `relates`, viết lại nội dung bài) thuộc Abot.
   - Chỉ kích hoạt `notifyRoadmapChanged()` (`after(requestRagReindex)` + `revalidatePath("/", "layout")`) khi item đã được đưa vào `RoadmapItem` ([ADR-0006](../docs/adr/0006-in-memory-vector-search.md): không nạp kho raw inbox vào RAM vector store của Abot). Mỗi lần integrate sẽ reindex toàn bộ và làm mất cache ISR của mọi trang.

### Ranh giới Bảo mật (`Owner`-only cho Provenance & `relates`)

**Đã chốt (quyết định 1, 2026-11-23):** Topic, Lesson và Abot chỉ dành cho `Owner`, vì kho tri thức đang phục vụ mục tiêu cá nhân. Chỉ `/news` và `/news/[slug]` public. Middleware hiện tại (`d01612a`) đã làm đúng như vậy; ADR-0018 sẽ ghi lại quyết định này. ISR của [`app/[topicSlug]/[lessonSlug]/page.tsx`](../app/%5BtopicSlug%5D/%5BlessonSlug%5D/page.tsx) (`revalidate = 60`) chỉ phục vụ Owner.

Các bất biến dưới đây vẫn giữ **mà không dựa vào middleware** (phòng thủ nhiều lớp). Lý do: middleware cho qua mọi `/api/*` chỉ cần có header key, code cách ly Visitor của Abot (ADR-0002, ADR-0015) vẫn chạy, và quyết định 1 có thể đổi sau này. Giữ các bất biến này gần như không tốn thêm công, vì provenance vốn được nạp phía client.

- **Bất biến 0 (Marker không mang ý nghĩa):** `claimRefKey` là UUID ngẫu nhiên, duy nhất toàn cục. Không suy ra được `newsItemId` hay URL nguồn, và marker không kèm thuộc tính phụ nào (`data-author-type`, ...). Lý do: marker nằm nguyên trong `processedHtml`, trong `lesson.content` (truyền xuống client làm `rawContent`, có trong RSC payload) và trong `full-export`.
- **Bất biến 1 (SSR & Public API):** `getLessonPageData()` và [`/api/v1/roadmaps/full-export`](../app/api/v1/roadmaps/full-export/route.ts) **tuyệt đối không** query hay trả về `KnowledgeProvenance` và `KnowledgeRelation`. Route mới tự gọi `requireWriteAccess`, không trông vào middleware. Lỗi bypass có từ trước của `full-export` sửa ở task riêng (quyết định 12).
- **Bất biến 2 (Marker vô hình):** `ProvenanceNode` là `DecoratorNode` (không phải `TextNode` như `MentionNode`). `exportDOM` ra `<span data-provenance-ref="..."></span>` **rỗng text**, nên không lọt vào [`plainTextExcerpt`](../lib/roadmap/content-utils.ts), SEO description, JSON-LD, `readingMinutes` hay `strip_html` của Abot.
- **Bất biến 3 (Client Hydration theo Pattern `useTopicOwnerStatuses`):** Chỉ khi `canWrite === true`, [`LessonEditorialReader`](../components/roadmap/LessonEditorialReader.tsx) mới gọi `GET /api/v1/roadmaps/items/[id]/provenance` (`requireWriteAccess`, trả `401` cho người không có quyền) để render Provenance Chips. Cache phía client chỉ giữ trong bộ nhớ module như `owner-status-cache`, không dùng `localStorage` (ADR-0015).
- **Bất biến 4 (Abot Actor Isolation):** Provenance **không bao giờ** đi vào `KnowledgeDocument` hay index in-memory, vì index dùng chung cho cả hai Actor (ADR-0006). Chỉ join provenance **sau bước retrieval**, khi `is_owner()`, qua API nội bộ có admin key (giống pattern `OwnerMemory` của [ADR-0015](../docs/adr/0015-abot-owner-memory.md)). Index đã bỏ thẻ HTML, nên Abot chỉ truy được nguồn **ở cấp Lesson**, không ở cấp câu.
- **Bất biến 5 (Marker bền, đối chiếu lúc đọc):** Không chặn lưu và không xoá provenance khi marker mất (quyết định 4), vì Abot ghi nội dung qua chính PATCH content; chặn lưu sẽ làm hỏng luồng Preview → `ok`. `GET provenance` đọc tập `claimRefKey` đang có trong `content` rồi tra theo key (marker copy sang Lesson khác vẫn tìm được). Bản ghi nào của bài mà không còn marker thì hiện ở mục **"Nguồn tham khảo của bài"**. Không có hàm reconcile phía ghi. `ProvenanceNode` phải được đăng ký trong `nodes` của [`Editor.tsx`](../components/ui/editor/Editor.tsx), và `importDOM` của nó phải được ưu tiên hơn handler `span` của `MentionNode`, để lưu từ editor không làm mất marker.

---

## 4. Thiết kế Dữ liệu Dự kiến (`prisma/schema.prisma`, Turso SQLite)

> Mọi schema phải tương thích SQLite/Turso ([ADR-0005](../docs/adr/0005-turso-for-production-database.md)). Cùng một commit phải cập nhật `prisma/schema.prisma`, `prisma/init-turso.sql`, `roadmap-rag-assistant/tests/fixtures/schema.sql` (qua `scripts/export-test-schema.ts`) và pass `yarn test:schema-sql --check`. Turso được đẩy bằng tay (`yarn db:turso:init`, ADR-0005). JSON lưu dạng chuỗi nên không query được theo field bên trong.

### 4.1. Mở rộng `NewsSource`, `NewsItem`, `IngestJob`
- **`NewsSource`** (Phase 2):
  - `sourceType String @default("rss")` (`rss` | `github_release` | `docs` | `api` | `web`). `syncNewsSourcesCron` phải lọc theo `sourceType`, vì hiện nó lấy mọi nguồn `enabled` và parse như RSS.
  - `fetchIntervalMinutes Int?`, `nextFetchAt DateTime?`: chỉ thêm khi đã có scheduler chạy dày hơn cron hằng ngày ở `vercel.json`. MVP giữ lịch hằng ngày.
  - `configJson String @default("{}")`
  - Nguồn vẫn **toàn cục**, không gắn với Topic (quyết định 6). Nếu sau này cần, thêm `defaultTopicSlug String?` (tuỳ chọn) chỉ để chọn sẵn đích khi đưa vào Lesson (Phase 4).
  - Lưu ý: domain của nguồn `enabled` tự vào whitelist của `enqueueNewsUrl`. Một nguồn `github_release` sẽ mở whitelist cho toàn bộ `github.com`.
- **`NewsItem`**:
  - `extractedAt DateTime?` (Phase 1): thời điểm trích xuất nội dung, khác `createdAt` (= `collectedAt`). Next.js tự đóng dấu trong `completeIngestJob` khi outcome là `ready`/`partial`; worker không đổi.
  - `extractedTextR2Key String?` (**Phase 2**): key văn bản trích xuất thô trong bucket private.
  - **Không thêm `integrationStatus`** (quyết định 11). Trạng thái "đã đưa vào Lesson" suy ra từ việc có bản ghi `KnowledgeProvenance` với `newsItemId`.
  - `extractedMetadata` (concepts, entities): để Phase 3. Gợi ý Topic/Section do Abot tính (Mục 3, Tầng 3), không lưu trên NewsItem.
- **`IngestJob`** (Phase 2): `kind String @default("ingest")` (`ingest` | `process`). Claim route lọc theo danh sách `kind` mà worker khai báo hỗ trợ, nên worker bản cũ đang deploy không claim nhầm job loại mới.

### 4.2. Bảng mới `KnowledgeProvenance` (Cấp câu, Phase 1)
Lưu vết quan hệ `Lesson → derived_from → nguồn ngoài`:
- `id String @id @default(uuid(7))`
- `lessonId String` (FK ➔ `RoadmapItem.id`, `onDelete: Cascade`): Lesson mà provenance được tạo cho.
- `claimRefKey String @unique`: UUID ngẫu nhiên, **duy nhất toàn cục** (Bất biến 0), khớp `data-provenance-ref`. Tra theo key lúc đọc (Bất biến 5).
- `newsItemId String?` (FK ➔ `NewsItem.id`, **`onDelete: SetNull`**: xoá item ở inbox không làm mất provenance trong PKM)
- `sourceId String?` (không FK; chỉ để tra cứu, nguồn có thể bị xoá)
- `relationType String @default("derived_from")`: MVP chỉ dùng `derived_from` (quyết định 11). Giữ cột để sau này thêm `supported_by` mà không phải migrate.
- `sourceName String`, `sourceUrl String`, `sourceTitle String` (copy tại thời điểm integrate)
- `excerpt String`: đoạn gốc làm căn cứ, **tối đa 1.000 ký tự**, kiểm ở Zod (quyết định 5).
- `snapshotR2Key String?` (**Phase 2**): trỏ tới bản toàn văn trong bucket private.
- `authorType String` (`human` | `ai_generated` | `ai_assisted`)
- `collectedAt DateTime`, `extractedAt DateTime?`, `createdAt DateTime @default(now())`
- Index: `@@index([lessonId])`, `@@index([newsItemId])`

### 4.3. Bảng mới `KnowledgeRelation` (Phase 3)
Phase 1 không dùng tới bảng này (YAGNI), nên chỉ tạo ở Phase 3 khi có `match-lessons`. Thiết kế dự kiến:
- `id String @id @default(uuid(7))`
- `fromLessonId String`, `toLessonId String` (FK ➔ `RoadmapItem.id`, `onDelete: Cascade`). Hai relation cùng trỏ `RoadmapItem` nên phải đặt tên (`@relation("RelationFrom")`, `@relation("RelationTo")`).
- `relationType String` (`relates`; `contradicts` để Phase 4)
- `relates` là quan hệ đối xứng: lưu theo thứ tự chuẩn `fromLessonId < toLessonId` để tránh trùng A→B và B→A.
- `status String @default("accepted")` (`suggested` | `accepted` | `rejected`)
- `note String?`, `createdBy String @default("owner")` (`owner` | `ai_suggested`)
- `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Index: `@@unique([fromLessonId, toLessonId, relationType])`, `@@index([toLessonId])`
- Chỉ Owner thấy (quyết định 13).

---

## 5. Lộ trình Triển khai Phân kỳ

### Phase 0: Core Docs — ✅ xong 2026-11-23
Các quyết định đã chốt ở Mục 7. Bước 1–4 đã làm theo yêu cầu của Owner; bước 5 đã ghi vào `.handoff/BACKLOG.md`, chờ tách spec.
1. Viết 3 ADR, mỗi ADR một quyết định (quyết định 9):
   - **ADR-0016:** `news-ingest-worker` là service Python riêng, kèm ranh giới LLM giữa worker và Abot (ghi lại hiện trạng, Mục 3, Tầng 3).
   - **ADR-0017:** Provenance ở cấp câu, chỉ Owner thấy. Gồm Bất biến 0–5; vì sao `/feed-ingestion` không phải Knowledge Triage mới (ADR-0011): nguồn vào là feed chứ không phải vote, và Owner chủ động chọn từng ý, không có hàng đợi gợi ý tự động trong MVP.
   - **ADR-0018:** Topic, Lesson và Abot chỉ dành cho Owner; chỉ `/news` public (ghi lại quyết định `d01612a`). Consequences phải nêu các chỗ còn giả định Visitor đọc Lesson: `app/sitemap.ts`, `app/robots.ts`, JSON-LD/OpenGraph của trang Lesson, comment "Public on purpose" ở proxy Abot (xem Mục 9, việc theo sau).
2. Cập nhật [`GLOSSARY.md`](../GLOSSARY.md) (quyết định 10):
   - Thêm nhóm **News**: **News Item**, **News Source**, **Public News** (đặt tên theo code, ADR-0007).
   - Thêm **Provenance** (_Avoid_: citation, vì "citation" đang là của Abot).
   - Không đưa vào: "Knowledge Statement", "Knowledge Relation", "Acquired Item", "Pending Review" (trạng thái chưa duyệt đã có sẵn là `draft`).
3. Sửa mục **Phạm vi hiện tại** của `AGENTS.md` (quyết định 2): Knowledge Acquisition phục vụ Abot thuộc phạm vi, gồm Phase 1 và Phase 3; Phase 2 hoãn.
4. Sửa [`.handoff/PLAN-second-brain.md`](./PLAN-second-brain.md): Giai đoạn 2 trỏ sang plan này, bỏ tham chiếu cũ "ADR-0011" và "Triage", ghi các câu đã chốt theo quyết định 14.
5. Tách task `fix/*` riêng cho lỗi `full-export` + header bypass (quyết định 12), chạy độc lập với Phase 1.

### Phase 1: Acquisition ➔ Lesson Bridge & Statement Provenance (MVP)
*Mục tiêu: Hoàn thành luồng nối từ `/feed-ingestion` sang `RoadmapItem` kèm Provenance Chip cho `Owner`, giữ nguyên `/news` public. Không dùng R2.*
*Phụ thuộc:* Phase 0 xong; `TASK-rag-sync-002` (index FTS trước, embedding chạy nền) đã merge vào `main` (`a3cc73e`).

**Spec** (nhánh `feat/knowledge-provenance`, chạy lần lượt; commit sau khi cả 3 đã verify) — ✅ cả 3 `COMPLETED` 2026-11-23:
| Spec | Nội dung | Phụ thuộc |
| :--- | :--- | :--- |
| [`TASK-knowledge-provenance-001`](./specs/TASK-knowledge-provenance-001.md) | Schema + migration, `isPublic` cho cron, `extractedAt`, helper marker, tách `create-lesson`, `GET provenance`, `POST integrate` (bước 1–3 dưới đây) | — |
| [`TASK-knowledge-provenance-002`](./specs/TASK-knowledge-provenance-002.md) | `ProvenanceNode` + đăng ký editor, chip nguồn, mục "Nguồn tham khảo của bài" (bước 4, ba gạch đầu) | 001 |
| [`TASK-knowledge-provenance-003`](./specs/TASK-knowledge-provenance-003.md) | "Đưa vào Lesson" ở `/feed-ingestion`, code intel, kịch bản test thủ công (bước 4, gạch cuối) | 001 |

1. **`/news` (quyết định 3):** sửa [ingest.ts:89](../lib/news/ingest.ts#L89): `isPublic: input.origin !== "cron"`, và `publicAt` để null với bài cron. `share`/`manual` giữ `true`. Không đụng bài cũ, không thêm điều kiện `reviewStatus` vào `PUBLIC_NEWS_WHERE`.
2. **`extractedAt`:** Next.js đóng dấu trong `completeIngestJob`; worker không đổi. Không lưu raw text ở phase này.
3. **Database & API Next.js:**
   - Migrate `KnowledgeProvenance` và `NewsItem.extractedAt` lên SQLite & Turso, theo checklist ở đầu Mục 4.
   - `GET /api/v1/roadmaps/items/[id]/provenance` (Owner-only, route tự gọi `requireWriteAccess`): trả `{ provenances, orphans }`. `provenances` tra theo các `claimRefKey` có trong `content`; `orphans` là bản ghi của bài mà không còn marker (Bất biến 5).
   - `POST /api/news/[id]/integrate` (Owner-only):
     - 2 mode: `create_lesson` (tạo `RoadmapItem` mới, `status` mặc định `target`, Owner đổi được trên UI; quyết định 8) hoặc `append_to_lesson` (nối vào `RoadmapItem` có sẵn, giữ nguyên `status`).
     - `create_lesson` **dùng lại logic của `POST /api/v1/roadmaps/items`** (chặn trùng, `allocateGlobalLessonSlug`, kiểm `status`); tách phần đó thành hàm dùng chung nếu cần, không viết insert mới.
     - Nhận `statements[]` Owner đã chọn hoặc sửa (`{ text, excerpt, authorType }`), sinh `claimRefKey` (UUID, Bất biến 0), chèn `<span data-provenance-ref="..."></span>` rỗng ở cuối mỗi statement.
     - Ghi `RoadmapItem` và `KnowledgeProvenance` trong **một transaction**. Idempotent theo `(newsItemId, lessonId)`, để bấm hai lần không tạo bài trùng. Sau đó gọi `notifyRoadmapChanged()`.
4. **UI Components:**
   - Popover provenance hiển thị 6 trường (tên nguồn + URL, tiêu đề gốc, `excerpt`, `collectedAt`, `extractedAt`, `authorType`). Nếu dùng chung với [`CitationChip.tsx`](../roadmap-rag-assistant/sdk/typescript/src/react/components/CitationChip.tsx) thì đặt phần dùng chung **trong SDK** `roadmap-chat-sdk` cho app import; SDK không được phụ thuộc ngược vào app. Nếu không thì để component riêng trong app.
   - Thêm `ProvenanceNode` (`DecoratorNode`, Bất biến 2) vào `components/ui/editor/nodes/` và **đăng ký trong `nodes` của [`Editor.tsx`](../components/ui/editor/Editor.tsx)**.
   - [`LessonEditorialReader.tsx`](../components/roadmap/LessonEditorialReader.tsx): khi `canWrite === true`, fetch provenance API, gắn chip vào từng statement và hiện mục "Nguồn tham khảo của bài" cho `orphans`. Phase 1 không có block `Related Lessons`.
   - [`NewsReaderPanel.tsx`](../components/news/NewsReaderPanel.tsx) (`/feed-ingestion`): thêm flow **"Đưa vào Lesson"**: chọn từng ý (`takeaways` hoặc tóm tắt), chọn `Topic`/`Section` hoặc `Lesson` đích, chọn `status` (mặc định `target`), xem trước rồi mới lưu.
5. **Test bắt buộc:**
   - Chống rò rỉ: `GET provenance` trả `401` khi không đăng nhập và khi chỉ có header key giả; `full-export`, HTML và RSC payload chỉ chứa `claimRefKey` không mang ý nghĩa.
   - Round-trip: lưu từ editor không làm mất marker; xoá một đoạn có marker thì bản ghi chuyển sang `orphans`; Abot ghi đè `content` vẫn lưu được; marker copy sang Lesson khác vẫn hiện chip; integrate hai lần chỉ tạo một bài.
   - `/news`: bài `cron` mới không lên `/news`; bài `share`/`manual` vẫn lên như cũ.
   - `plainTextExcerpt` và `strip_html` không có text thừa.

### Phase 2: Source Agnostic & Tách Pha Ingestion vs. AI Processing (hoãn)
*Hoãn tới khi Phase 1 đã được dùng thật (quyết định 2). Mục tiêu: Concept 2.1, 2.2, 2.3 và Giai đoạn 2 của `PLAN-second-brain.md`.*
1. **Mở rộng `NewsSource` (`lib/news/`, `SourcesManagerSheet.tsx`):**
   - Hỗ trợ `github_release` (repo URL ➔ `.atom`, chuẩn hoá tag/version của release notes), `docs` / `web` (bắt buộc qua `assertPublicHostname` và domain whitelist), `api`. `syncNewsSourcesCron` chỉ parse RSS với nguồn `sourceType = "rss"`.
   - `fetchIntervalMinutes` + `nextFetchAt` chỉ làm khi đã có scheduler chạy dày hơn mức hằng ngày. Cần xác minh giới hạn cron theo gói Vercel trước: [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) (chưa verify).
2. **Snapshot private (quyết định 5):**
   - Bucket R2 private riêng (`R2_PRIVATE_BUCKET_NAME`, thêm vào `docs/DEPLOY_ENV.md`), hàm get/put mới không trả URL public. Trước khi làm, xác minh cách R2 bật public access: [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) (chưa verify).
   - Worker gửi raw text qua endpoint nội bộ của Next.js, worker không giữ credential R2. Cần kiểm giới hạn body của endpoint.
   - Giữ snapshot của bài `dismissed` 30 ngày rồi xoá, **trừ khi** có `KnowledgeProvenance` trỏ tới.
3. **Tách đôi Job Worker (`IngestJob.kind`):**
   - Job `ingest`: fetch, parse, normalize, dedupe, lưu snapshot vào bucket private (không gọi LLM).
   - Job `process`: đọc snapshot rồi gọi LLM sinh tóm tắt và takeaways (re-run được mà không crawl lại). **Chạy lazy:** bài `cron` chỉ chạy `process` khi Owner mở bài hoặc chọn đưa vào Lesson. Không gợi ý Topic/Section ở đây (thuộc Abot, Phase 3).
   - `ingestStatus = "ready"` chỉ đặt sau pha `process`, vì `PUBLIC_NEWS_WHERE` dựa vào `ready`; nếu không, `/news` sẽ hiện bài chưa có `tldr`.
   - **Thứ tự deploy:** migrate `kind` (default `ingest`) → deploy Next.js (claim lọc theo `kind` worker khai báo) → deploy worker mới. Worker cũ không khai báo `kind` thì chỉ nhận job `ingest` theo luồng cũ.

### Phase 3: AI Knowledge Linking (`relates`) & Abot End-to-End Provenance
*Mục tiêu: Khép vòng intelligence giữa Acquisition ↔ PKM ↔ Abot.*
1. **Abot Linking Advisor (`roadmap-rag-assistant/`):**
   - Endpoint nội bộ `POST /internal/match-lessons` (`x-internal-key`): **chỉ Next.js server gọi** (route Owner-only của `/feed-ingestion`), không mở qua proxy `/api/roadmap-assistant/*` cho trình duyệt. Dùng Hybrid RAG hiện có để tìm `Lesson` gần với `NewsItem` đang review: gợi ý `Topic`/`Section`, cảnh báo trùng tri thức, đề xuất `relates`, báo `Lesson` cần cập nhật khi có version mới (bài coi là cũ khi có version mới, quyết định 14). Mỗi lần gọi tốn quota embedding của Gemini.
   - Tạo bảng `KnowledgeRelation` (Mục 4.3) và block `Related Lessons` (Owner-only) trong `LessonEditorialReader`. Cách lưu `extractedMetadata` (concepts, entities) chốt ở phase này.
2. **Cập nhật nội dung bài bằng LLM (quyết định 7):** đi qua Abot Preview → `ok`, dùng lại `draft_item_content` ở chế độ `append` trong `lesson_content.py`. `/feed-ingestion` chỉ tạo bài mới hoặc nối thêm, không viết lại bằng LLM.
3. **Abot Chat Truy ngược Nguồn (Owner-only):**
   - Chỉ join `KnowledgeProvenance` **sau bước retrieval**, khi `is_owner()`, qua API nội bộ (tương tự `OwnerMemory`, [ADR-0015](../docs/adr/0015-abot-owner-memory.md)). **Không** nạp vào [`DatabaseIngestionWorker`](../roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py) hay `KnowledgeDocument` (Bất biến 4).
   - Câu trả lời cho `Owner` kèm chuỗi truy ngược `Lesson → External Source` (cấp Lesson, Bất biến 4). `Visitor` bị chặn ở cả Gateway lẫn Python backend. Test chống rò rỉ, gồm cả prompt injection, theo mẫu ADR-0015.

### Phase 4: Advanced Intelligence (Backlog)
- Tự động phát hiện `contradicts` khi nội dung thu thập mâu thuẫn với `Lesson` đang có (`KnowledgeRelation.status: "suggested"`, Owner duyệt).
- Gợi ý ôn tập định kỳ hiện trong chat Abot (quyết định 14, kết hợp `TASK-review-digest-001` trong `PLAN-second-brain.md`); gợi ý từ nguồn tin hiện ở `/feed-ingestion`.
- `NewsSource.defaultTopicSlug` (tuỳ chọn) để chọn sẵn đích khi đưa vào Lesson (quyết định 6).

---

## 6. Ma trận Đồng bộ & Xung đột (`cris-how-to-sync`)

| Kiểm tra | Trạng thái | Chi tiết / Điều kiện tuân thủ |
| :--- | :--- | :--- |
| **ADR-0001 / ADR-0002** | Tuân thủ có điều kiện | Browser chỉ gọi Abot qua proxy `/api/roadmap-assistant/*`; `match-lessons` chỉ Next.js server gọi. ADR-0001 **không** bao gồm `news-ingest-worker`, nên ranh giới LLM giữa hai service ghi trong ADR-0016. API provenance dùng `requireWriteAccess` ngay tại route. |
| **ADR-0004 / ADR-0006** | Tuân thủ có điều kiện | Embeddings dùng Gemini 768d. Chỉ reindex khi đã integrate vào `RoadmapItem`. Ngưỡng ADR-0006 tính bằng **thời gian** (index đầy đủ sau deploy hơn 5 phút), nên đo thời gian index sau mỗi lần deploy chứ không đếm Lesson; cache embedding trên Railway không bền (0,67 giây/bài). Phụ thuộc `TASK-rag-sync-002`. Provenance không vào index dùng chung. |
| **ADR-0005** | Tuân thủ | Model mới dùng kiểu SQLite/Turso, đẩy schema bằng tay (`yarn db:turso:init`), CI `yarn test:schema-sql --check`. Phase 1 chỉ lưu `excerpt` (≤ 1.000 ký tự) trong Turso; toàn văn để bucket R2 private từ Phase 2. |
| **ADR-0009 / ADR-0010** | Tuân thủ | Map đích vào `Topic` + `section` (không tạo `Category`/`Layer`/`Group`). Lesson mới từ feed mặc định `target` ("muốn học"), khớp quyết định cho bài seed ngày 2026-11-05; nối thêm thì giữ nguyên `status`. |
| **ADR-0011** | Tuân thủ | Không hồi sinh `KnowledgeTriage`; Owner chọn từng ý trên `/feed-ingestion`, không có hàng đợi gợi ý tự động trong MVP. ADR-0017 nêu rõ điểm khác. |
| **ADR-0014** (giữ quy tắc slug của ADR-0013) | Tuân thủ | `create_lesson` dùng lại logic của `POST /api/v1/roadmaps/items` (slug toàn cục, chặn trùng). |
| **ADR-0015** | Tuân thủ | Cách ly Owner-only cho UI lẫn prompt/response của Abot; join sau retrieval, test chống rò rỉ theo mẫu ADR-0015. |
| **ADR-0016 / 0017 / 0018** | Đã viết 2026-11-23 | Worker chỉ xử lý từng News Item; Provenance theo câu, Owner-only; site Owner-only trừ Public News. Lỗi header bypass + `full-export` sửa ở task `fix/*` riêng (BACKLOG). |
| **`AGENTS.md` — Phạm vi** | Đã sửa 2026-11-23 | Phase 1 và Phase 3 thuộc phạm vi Abot; Phase 2 hoãn. |
| **Code Intel (`cris-code-intel`)** | Cần sync khi triển khai | Tiến hóa domain `private-news` ➔ `knowledge-acquisition` trong `.agents/skills/cris-code-intel/data/cris-workspace-map.json` & `docs/code-intel/CRIS_WORKSPACE_MAP.md`, kiểm tra bằng `yarn intel status`. |

---

## 7. Quyết định đã chốt (Owner, 2026-11-23)

Owner chấp nhận toàn bộ đề xuất của báo cáo verify, trừ quyết định 1 (chọn Owner-only thay cho mở lại Lesson cho Visitor).

| # | Câu hỏi | Quyết định | Căn cứ |
| :--- | :--- | :--- | :--- |
| 1 | Quyền xem kho tri thức | **Topic, Lesson, Abot chỉ Owner; chỉ `/news` public.** Ghi vào ADR-0018. Vẫn giữ Bất biến 0–5. | Kho tri thức đang phục vụ mục tiêu cá nhân. Middleware `d01612a` đã làm đúng như vậy. |
| 2 | Phạm vi trong `AGENTS.md` | **Thuộc phạm vi**, gồm Phase 1 và Phase 3; Phase 2 hoãn tới khi Phase 1 được dùng thật. Thêm một dòng vào `AGENTS.md`. | Abot là nơi dùng kết quả cuối; Phase 2 không làm Abot tốt hơn ngay. |
| 3 | `isPublic` mặc định | **`cron` → `false`; `share`/`manual` → `true`.** Không đụng bài cũ. | Commit `516afc2` cố ý để bài Owner tự chọn public; bài cron đã là `draft` (chưa duyệt). |
| 4 | Marker bị mất | **Không xoá, không chặn lưu. Đối chiếu lúc đọc**; bản ghi mất marker hiện ở "Nguồn tham khảo của bài". | Abot ghi qua chính PATCH content; chặn lưu làm hỏng Preview → `ok`. Bỏ được hàm reconcile phía ghi. |
| 5 | Snapshot R2 | **Phase 1 không dùng R2**, chỉ lưu `excerpt` ≤ 1.000 ký tự trong Turso. Phase 2: bucket private riêng, giữ snapshot bài `dismissed` 30 ngày trừ khi có provenance trỏ tới, không bao giờ phục vụ ra ngoài. | Popover chỉ cần `excerpt`; toàn văn chỉ cần khi tách job ở Phase 2. |
| 6 | Nguồn gắn Topic | **Giữ `NewsSource` toàn cục.** `defaultTopicSlug` tuỳ chọn để backlog. | Code chưa có quan hệ nào giữa nguồn và Topic. |
| 7 | Cập nhật bài khi có release | **Phase 1:** tạo mới hoặc nối thêm qua `/feed-ingestion`. **Phase 3:** viết lại bằng LLM qua Abot Preview (`draft_item_content`, chế độ `append`). | Thao tác UI của Owner ghi thẳng; LLM thuộc Abot (ADR-0001). |
| 8 | `status` của Lesson mới | **`target` (Owner đổi được trên UI); nối thêm thì giữ nguyên.** | Nghĩa "muốn học" của ADR-0010; khớp quyết định bài seed 2026-11-05. |
| 9 | ADR | **3 ADR:** 0016 worker + ranh giới LLM, 0017 Provenance Owner-only, 0018 login-guard. | Mỗi ADR một quyết định, như các ADR hiện có. |
| 10 | Glossary | **Thêm** News Item, News Source, Public News, Provenance (_Avoid_: citation). **Không thêm** Knowledge Statement, Knowledge Relation, Acquired Item, Pending Review. | Tên theo code (ADR-0007); `draft` đã có nghĩa "chưa duyệt". |
| 11 | Cột và giá trị trong MVP | **Không thêm `integrationStatus`. `relationType` chỉ dùng `derived_from`** (giữ cột). | Trạng thái suy ra từ `KnowledgeProvenance`; Phase 1 chưa có luồng `supported_by`. |
| 12 | Lỗi header bypass có từ trước | **Task `fix/*` riêng:** `full-export` kiểm `RAG_INTERNAL_KEY` hoặc quyền Owner ngay trong route; rà `GET /api/v1/roadmaps`. | Quyết định 1 chọn private, nên lỗi này cần sửa; không gộp vào ADR. |
| 13 | `relates` cho Visitor | **Chỉ Owner.** | Hệ quả của quyết định 1; giống cách ADR-0010 xử lý Lesson Status. |
| 14 | Câu mở của `PLAN-second-brain` | **Chốt:** câu 2 → Abot chỉ đọc nguồn đã khai báo, không tìm web; câu 4 → gợi ý từ nguồn tin ở `/feed-ingestion`, gợi ý ôn tập trong chat Abot; câu 1 → bài coi là cũ khi có version mới. **Tách ra:** câu 3 (đổi techstack), câu 7 (lịch sử chat qua deploy). | Abot hiện không có công cụ tìm web nào. |

---

## 8. Rubric dành cho Agent Verify Độc lập

Khi giao file này cho agent khác (ví dụ Claude Code) thẩm định, đề nghị agent verify kiểm tra lần lượt 6 hạng mục sau đối chiếu thẳng với repo hiện tại:

1. **Verify Baseline & File/Symbol Links:** Kiểm tra mọi đường dẫn và symbol nêu ở Mục 2–4 (`lib/news/paths.ts`, `lib/auth/public-paths.ts`, `lib/news/ingest.ts`, `lib/news/public-queries.ts`, `app/[topicSlug]/[lessonSlug]/page.tsx`, `components/roadmap/useTopicOwnerStatuses.ts`, `components/ui/editor/nodes/MentionNode.ts`, `roadmap-rag-assistant/sdk/typescript/src/react/components/CitationChip.tsx`) xem có chính xác tại HEAD `ce7564a` không.
2. **Verify Lỗ hổng `Owner`-only & ISR (`revalidate = 60`):** Đánh giá thiết kế hydrate provenance phía client (`canWrite`) + invisible HTML marker + `plainTextExcerpt` stripping + cách ly `full-export` và Abot `x-actor` — còn đường rò rỉ dữ liệu nào sang `Visitor` không (kể cả HTML source view / RSC payload / metadata)?
3. **Verify Không phá vỡ `/news` Public Site:** Kiểm tra thay đổi đề xuất ở Phase 1–2 (đổi `isPublic` mặc định cho `cron`, mở rộng `NewsSource`, tách job worker qua `IngestJob.kind`, thêm `extractedAt`/`extractedTextR2Key`; `NewsItem.slug` đã có sẵn) có gây regression cho `/news`, `/news/[slug]`, `/share`, `/api/news/cron`, hoặc `news-ingest-worker` đang deploy không.
4. **Verify Ngưỡng Kiến trúc & Hiệu năng:** Kiểm tra rủi ro phình Turso (ADR-0005), phình RAM/cold-start của Abot in-memory vector store (ADR-0006), và chi phí R2/LLM khi tách pha ingestion vs AI processing.
5. **Verify Độ khớp với `PLAN-second-brain.md` & `AGENTS.md`:** Đối chiếu xem plan này có hợp nhất mượt với Giai đoạn 2 của `.handoff/PLAN-second-brain.md`, không đụng phạm vi bị khóa (`Cris AI`), và không lặp lại mô hình đã drop ở `ADR-0011`.
6. **Chỉ ra Bug Thiết kế / Gap còn thiếu:** Liệt kê phân loại `[BLOCKER]`, `[RISK]`, `[NIT]`, và đề xuất chỉnh sửa plan hoặc danh sách câu hỏi cần đưa vào buổi `/grill-with-docs` trước khi tách thành các `TASK-*.md`.

---

## 9. Kết quả Verify Độc lập (2026-11-23, `main` @ `ce7564a`)

Kết luận lúc verify: **🟡 CẢI THIỆN.** Rev 2 đưa các chỉnh sửa vào plan; rev 3 ghi quyết định của Owner (Mục 7). Lần verify chỉ đọc code, chưa chạy test runtime hay Playwright; các link tài liệu ngoài (R2, Vercel cron) chưa được đọc lại.

**Rubric:** (1) file/symbol: đạt, có lệch nhỏ đã sửa. (2) rò rỉ sang Visitor: có lỗ hổng, tiền đề sai. (3) `/news`: giữ được nếu theo rollout ở Phase 2. (4) ngưỡng: đo bằng thời gian index. (5) khớp `PLAN-second-brain`: mới một phần.

### [BLOCKER] — trạng thái sau rev 3
1. **Tiền đề Visitor/ISR lệch với middleware (`d01612a`).** ✅ Đã giải quyết: quyết định 1 (Owner-only, chỉ News public), ghi ở ADR-0018.
2. **Provenance lọt vào index Abot dùng chung.** ✅ Đã giải quyết trong plan: bỏ phương án `DatabaseIngestionWorker`, chỉ join sau retrieval (Bất biến 4).
3. **Marker bị Lexical hoặc Abot xoá âm thầm.** ✅ Thu gọn: đăng ký `ProvenanceNode` trong `Editor.tsx` + đối chiếu lúc đọc (Bất biến 5, quyết định 4); không cần hàm reconcile phía ghi.
4. **Snapshot R2 public qua `uploadToStorage`.** ✅ Ra khỏi Phase 1 (quyết định 5); Phase 2 dùng bucket private riêng.

### [RISK]
1. Lỗi có từ trước: middleware cho qua chỉ cần có header key; `full-export` và `GET /api/v1/roadmaps` không kiểm quyền → task `fix/*` riêng (quyết định 12).
2. Bài `cron` (`draft`) tự lên `/news` → sửa ở Phase 1, bước 1 (quyết định 3).
3. Rollout tách job: `kind`, claim lọc theo `kind`, `ready` chỉ đặt sau `process`, lọc `sourceType` (Phase 2).
4. `integrationStatus` trùng nghĩa với state đã có → đã bỏ (quyết định 11).
5. Integrate tự tạo Lesson → dùng lại logic `POST /api/v1/roadmaps/items`, transaction, idempotent (Phase 1).
6. ADR-0006: đo thời gian index; mỗi lần integrate reindex toàn bộ và revalidate layout (phụ thuộc `TASK-rag-sync-002`).
7. Phạm vi "chỉ Abot" trong `AGENTS.md` → đã chốt (quyết định 2), chờ sửa file.
8. Lệch Giai đoạn 2 của `PLAN-second-brain` → đã chốt nguồn toàn cục và luồng cập nhật (quyết định 6, 7, 14).
9. ADR-0001 không bao gồm `news-ingest-worker` → ADR-0016.
10. Thuật ngữ Glossary → đã chốt danh sách (quyết định 10).
11. Bản quyền khi lưu toàn văn và `excerpt` → `excerpt` ≤ 1.000 ký tự; toàn văn chỉ ở bucket private, không phục vụ ra ngoài.
12. Chi phí LLM của pha `process` → chạy lazy (Phase 2).
13. **Mới (hệ quả quyết định 1):** vài chỗ trong code vẫn giả định Visitor đọc Lesson: `app/sitemap.ts` liệt kê mọi Lesson (URL chuyển về `/login`), `app/robots.ts` cho phép `/`, JSON-LD/OpenGraph của trang Lesson, comment "Public on purpose" và luồng rate limit Visitor ở proxy Abot. Nằm ngoài scope plan này; ghi vào Consequences của ADR-0018 và hỏi Owner trước khi dọn.

### [NIT] (đã sửa trong rev 2)
- Phase 0 ghi "5 câu hỏi" trong khi Mục 7 chỉ có 4; Rubric nói "thêm `slug`" nhưng cột đã có; link `#L87` lệch 2 dòng.
- "Pattern theo `MentionNode`" sai (đó là `TextNode`).
- Vị trí component dùng chung với `CitationChip` (package SDK).
- Checklist sync schema thiếu `export-test-schema` và `test:schema-sql --check`.
- `KnowledgeRelation`: thiếu tên relation, thiếu thứ tự chuẩn cho `relates`; hoãn sang Phase 3.
- `claimRefKey` đổi thành duy nhất toàn cục; `excerpt` có giới hạn độ dài.
- `fetchIntervalMinutes` phụ thuộc scheduler.
- `PLAN-second-brain` còn tham chiếu cũ "ADR-0011" và "Triage" (sửa ở Phase 0, bước 4).
