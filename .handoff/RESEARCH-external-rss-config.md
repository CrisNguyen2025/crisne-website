# RESEARCH: Logic & Phương án Cấu hình RSS/Atom từ Website Bên ngoài (`/news`)

- **Trạng thái:** `TIER 1 IMPLEMENTED · TIER 2–3 PROPOSAL` (2026-11-25: Tier 1 đã triển khai — `platform-feeds.ts`, JSON Feed parser, deadline tổng `AbortSignal`, xoá N+1 query trong cron, phân loại mã lỗi, `POST /api/news/sources/preview` và UI kiểm tra feed trong `SourcesManagerSheet.tsx`; Tier 2–3 giữ ở mức đề xuất khi cần migration lịch quét / aggregator ngoài whitelist)
- **Ngày lập:** 2026-11-24
- **Nhánh đối chiếu:** `feat/abot-lesson-chunks` (sau upgrade UI `components/news/SourcesManagerSheet.tsx`)
- **Phạm vi liên quan:** `private-news` / `knowledge-acquisition`, Next.js `/news` + `/api/news/*`, `news-ingest-worker/`
- **Tài liệu liên hệ:** [`.handoff/PLAN-knowledge-acquisition.md`](./PLAN-knowledge-acquisition.md), [`GLOSSARY.md`](../GLOSSARY.md), [`docs/DEPLOY_ENV.md`](../docs/DEPLOY_ENV.md), [`docs/adr/0005-turso-for-production-database.md`](../docs/adr/0005-turso-for-production-database.md), [`docs/adr/0016-news-ingest-worker-separate-service.md`](../docs/adr/0016-news-ingest-worker-separate-service.md), [`docs/adr/0017-owner-only-statement-provenance.md`](../docs/adr/0017-owner-only-statement-provenance.md), [`docs/adr/0019-owner-only-site-no-public-news.md`](../docs/adr/0019-owner-only-site-no-public-news.md)

---

## 1. Kiến trúc `/news` RSS/Atom & Cron Hiện tại và 5 Khoảng trống Thực tế

### 1.1 Bản đồ Module Đã Kiểm tra Trực tiếp trong Repo

| Lớp | File & Dòng | Hành vi hiện tại & Ràng buộc |
|---|---|---|
| **DB Schema (Prisma)** | [`prisma/schema.prisma:117-228`](../prisma/schema.prisma#L117-L228) | `NewsSource` (`:117-132`): `id`, `name`, `feedUrl` (`@unique`), `domain`, `enabled`, `defaultTags` (JSON array string), `etag`, `lastModified`, `lastFetchedAt`, `lastError`, `createdAt`, `updatedAt`. `NewsItem` (`:134-184`): `canonicalUrl` (`@unique`), `platform`, `origin` (`cron\|share\|manual`), `sourceId` (nullable FK `onDelete: SetNull`), `reviewStatus` (`draft\|published\|dismissed`), `ingestStatus`. `IngestJob` (`:210-228`): atomic queue, `maxAttempts: 3`. |
| **Turso SQL & Fixture** | [`prisma/init-turso.sql:108-243`](../prisma/init-turso.sql#L108-L243), [`scripts/export-test-schema.ts`](../scripts/export-test-schema.ts), [`scripts/add-news-source-cache.ts`](../scripts/add-news-source-cache.ts) | Production dùng **Turso/libSQL (SQLite)** theo ADR-0005. Mọi thay đổi schema phải đồng bộ `prisma/schema.prisma`, `prisma/init-turso.sql`, và `roadmap-rag-assistant/tests/fixtures/schema.sql` (`yarn test:schema-sql --check`). |
| **Feed Auto-Discovery** | [`lib/news/feed-discovery.ts:1-304`](../lib/news/feed-discovery.ts) | `resolveFeedUrl` (`:233-304`) fetch URL đầu vào (`timeoutMs: 8_000`, `:246`), kiểm tra `isRssOrAtomDocument` (`:68-92`), nếu HTML thì quét `<head>` tối đa 128KB (`MAX_HEAD_SCAN_BYTES = 131_072`, `:4`) lấy `<link rel="alternate">` khớp `FEED_MIME_REGEX` (`:9-10`), chấm điểm RSS (0) < Atom (1) < XML (2) < comments feed (3) (`:122-134`), probe tối đa 5 link (`MAX_ALTERNATE_CANDIDATES = 5`, `:7`), rồi fallback sang `COMMON_FEED_PATHS` (`:12-20`) + subpath `/feed`, `/rss.xml`, `/atom.xml` (`:187-205`) theo batch 3 (`PROBE_BATCH_SIZE = 3`, `:6`, timeout `5_000ms`, `:5`). |
| **RSS/Atom Fetch & Sync** | [`lib/news/rss-fetcher.ts:1-450`](../lib/news/rss-fetcher.ts) | `parseRssOrAtomXml` (`:131-184`) dùng `fast-xml-parser` (`processEntities: { enabled: true, maxTotalExpansions: 1000 }`, `:22-31`), hỗ trợ RSS 2.0, RSS 1.0/RDF, Atom. `fetchFeedWithCacheSafely` (`:228-307`) chống SSRF mỗi hop (`assertPublicHostname`, tối đa `MAX_FEED_REDIRECTS = 3`, `:14`), gửi `If-None-Match` / `If-Modified-Since` (`:255-260`), xử lý `304`, stream giới hạn `MAX_FEED_XML_BYTES = 2MB` (`:12, 192-215`), timeout `10_000ms` (`:13`). `syncNewsSourcesCron` (`:325-450`) chạy tuần tự qua từng nguồn `enabled: true`, cắt `.slice(0, maxItems)` (`:373`, mặc định `10`, tối đa `30`), gọi `enqueueNewsUrl`, và wake worker 1 lần (`:440-442`). |
| **Source CRUD Service** | [`lib/news/sources.ts:1-186`](../lib/news/sources.ts) | `createNewsSource` (`:82-117`) kiểm tra URL + `assertPublicHostname` (`:86-87`), gọi `resolveFeedUrl` (`:89`), tính `domain` (`:91-95`), kiểm `assertPublicHostname(domain)` (`:96`). `updateNewsSource` (`:119-175`) chạy lại `resolveFeedUrl` nếu đổi `feedUrl` và reset `etag: null, lastModified: null, lastError: null` (`:155`). |
| **SSRF & Domain Guard** | [`lib/news/url-guard.ts:1-545`](../lib/news/url-guard.ts) | `DEFAULT_ALLOWED_DOMAINS` (`:24-50`, 25 domain), `SHORT_LINK_DOMAINS` (`:52-58`), `TRACKING_QUERY_PARAMS` (`:60-82`), `isPrivateIp` IPv4/IPv6/CGNAT/NAT64/Teredo (`:158-262`), `assertPublicHostname` (`:268-308`), `normalizeCanonicalUrl` (`:336-404`), `resolveAndValidateUrl` (`:487-545`). |
| **Ingest & Job Queue** | [`lib/news/ingest.ts:42-118`](../lib/news/ingest.ts#L42-L118) | `enqueueNewsUrl` query toàn bộ `NewsSource` `enabled: true` (`:46-50`) để gộp `domain` vào whitelist, chạy `resolveAndValidateUrl`, dedupe theo `canonicalUrl`, rồi tạo `NewsItem` (`reviewStatus: origin === "cron" ? "draft" : "published"`, `:64`) + `IngestJob` trong `$transaction`. |
| **API Routes & Cron** | [`app/api/news/sources/route.ts`](../app/api/news/sources/route.ts), [`app/api/news/sources/[id]/route.ts`](../app/api/news/sources/%5Bid%5D/route.ts), [`app/api/news/cron/route.ts`](../app/api/news/cron/route.ts) | CRUD nguồn qua `requireWriteAccess` (ADR-0019 Owner-only). `/api/news/cron` hỗ trợ `GET`/`POST`, nhận `sourceId?` và `maxItemsPerSource?`, xác thực `CRON_SECRET` bằng `timingSafeEqual` (rate limit 10 lần/5 phút khi sai, `:39-52`) hoặc fallback `requireWriteAccess` (`:55`). Chưa khai báo `export const maxDuration`. |
| **Cron Schedule & Docs** | [`vercel.json:1-9`](../vercel.json), [`lib/news/cron-schedule.ts:1-8`](../lib/news/cron-schedule.ts), [`docs/DEPLOY_ENV.md:42-49, 171-193`](../docs/DEPLOY_ENV.md#L171-L193) | `vercel.json` chạy `GET /api/news/cron` theo lịch `"0 4 * * *"` (11:00 VN). `NEWS_CRON_SCHEDULE.cron` được test `tests/unit/news-cron-schedule.test.ts` khóa khớp `vercel.json`. Lưu ý doc drift: `docs/DEPLOY_ENV.md:193` vẫn ghi *"repo không cố định sẵn vercel.json hay workflow lịch"* dù `vercel.json` đã có. |
| **Python Worker** | [`news-ingest-worker/news_worker/config.py`](../news-ingest-worker/news_worker/config.py), [`extractors/article.py`](../news-ingest-worker/news_worker/extractors/article.py) | Service Python tách riêng (ADR-0016), poll `/api/news/jobs/claim` mỗi `10s` (`:36`), concurrency `2` (`:37`), fetch bài bằng `httpx` + `trafilatura` (`timeout=15.0`, `MAX_HTML_BYTES = 5MB`, UA `CrisneNewsBot/1.0`, `:51-73`). |

---

### 1.2 Năm Khoảng trống Cốt lõi Khi Cấu hình Nguồn Ngoài

1. **Gap 1 (Nghiêm trọng) — Link ngoài trong Aggregator / Linkblog bị chặn âm thầm vào `skippedErrors`:**
   - Trong `syncNewsSourcesCron` (`lib/news/rss-fetcher.ts:389-393`), mỗi item trong feed được đưa qua `enqueueNewsUrl(..., { extraAllowedDomains: [source.domain, feedHost] })`.
   - Bên trong `enqueueNewsUrl` (`lib/news/ingest.ts:46-55`), `resolveAndValidateUrl` kiểm tra `isDomainAllowed(parsed.hostname, allowedDomains)` (`lib/news/url-guard.ts:514-519`) đối chiếu `DEFAULT_ALLOWED_DOMAINS` (25 domain) + `NEWS_ALLOWED_DOMAINS` + `domain` của các `NewsSource` đang bật.
   - Khi Owner thêm một News Source dạng aggregator/newsletter/bridge (ví dụ Hacker News `news.ycombinator.com/rss`, Lobste.rs, TLDR, hoặc RSSHub), `<link>` từng bài trỏ ra blog bên thứ ba không nằm trong whitelist → `resolveAndValidateUrl` ném `UrlGuardError("DOMAIN_NOT_ALLOWED", 403)`.
   - `syncNewsSourcesCron` (`lib/news/rss-fetcher.ts:402-404`) `catch` toàn bộ lỗi per-item và chỉ tăng `skippedErrors++`, **không lưu lý do vào `lastError` hay trả danh sách domain bị chặn**. UI chỉ hiện `"1 link bị bỏ qua"`, khiến Owner không biết vì sao nguồn hợp lệ lại ra 0 bài.

2. **Gap 2 (Cao) — Lưu thành công giả (False-Success) với URL lỗi 4xx/5xx & Trang HTML challenge 200 OK:**
   - Trong `lib/news/feed-discovery.ts:248-255` và `:267-269`, nếu URL đầu vào gặp HTTP `403`/`404`/`500`, timeout, hoặc trả về non-HTML/non-XML (ví dụ JSON), `resolveFeedUrl` bắt lỗi / rẽ nhánh và trả về `{ feedUrl: normalizedInput, discovered: false }`. Kết quả là `POST /api/news/sources` lưu thẳng nguồn hỏng và hiện toast xanh `"Đã thêm nguồn RSS mới"`.
   - Trong `syncNewsSourcesCron` (`lib/news/rss-fetcher.ts:373, 407-415`), nếu feed URL trả HTTP `200 OK` nhưng body là HTML (ví dụ trang chặn bot Cloudflare hoặc trang chủ sau khi blog đổi đường dẫn), `parseRssOrAtomXml` trả về `[]` và hàm cập nhật `lastError: null` — xóa luôn dấu hiệu lỗi dù feed không đọc được XML.
   - Chưa có bước dry-run preview trước khi lưu và chưa cho chọn khi trang có nhiều `<link rel="alternate">` (hiện tự lấy candidate đầu tiên probe được).

3. **Gap 3 (Cao) — Thiếu URL Pattern cho Nền tảng phổ biến, JSON Feed, Sort theo ngày & Fallback nội dung:**
   - `lib/news/feed-discovery.ts:12-20, 140-205` chỉ tìm `<link rel="alternate">` XML (`FEED_MIME_REGEX`, `:9-10`) và ghép hậu tố (`${basePath}/feed`, `/rss.xml`, `/atom.xml`).
   - Các nền tảng đặt `/feed/` ở **tiền tố** như Medium (`medium.com/@user` → `medium.com/feed/@user`), Dev.to (`dev.to/user` → `dev.to/feed/user`), hay repo GitHub (`github.com/owner/repo` → `releases.atom`) không tự khớp `COMMON_FEED_PATHS`. Trang `youtube.com/@handle` cần trích `channel_id` nếu không có `<link rel="alternate">`.
   - **JSON Feed** (`application/feed+json` / `/feed.json`) chưa được `FEED_MIME_REGEX` hay `parseRssOrAtomXml` hỗ trợ.
   - `rss-fetcher.ts:373` cắt `.slice(0, maxItems)` theo **thứ tự xuất hiện trong XML**, không sort `publishedAt` mới nhất trước → feed xếp cũ-trước-mới-sau bị bỏ sót bài mới.
   - `readFeedBodyWithLimit` (`rss-fetcher.ts:201`) mặc định `new TextDecoder()` (UTF-8), dễ lỗi font với feed cũ dùng `iso-8859-1` / `windows-1252`; `extractRssItemUrl` (`:119, 125`) gọi `resolveHttpUrl(guid)` thiếu `baseFeedUrl`.
   - `parseRssOrAtomXml` bỏ qua `<content:encoded>` / `<description>` / `<summary>`, nên khi `news-ingest-worker` (`extractors/article.py`) bị Cloudflare chặn 403 ở URL bài gốc, job rơi xuống `metadata_only` (`partial`) dù RSS đã chứa phần tóm tắt/nội dung.

4. **Gap 4 (Trung bình) — Khả năng mở rộng Cron, N+1 Query & Thiếu Tần suất riêng từng Nguồn:**
   - `vercel.json` chạy 1 lần/ngày (`0 4 * * *`), `app/api/news/cron/route.ts` chưa khai báo `maxDuration`.
   - `syncNewsSourcesCron` (`rss-fetcher.ts:346-438`) lặp tuần tự từng nguồn (mỗi nguồn tối đa 10s timeout + tối đa 30 bài tuần tự). Bên trong vòng lặp item, `enqueueNewsUrl` (`lib/news/ingest.ts:46-50`) lại query `prisma.newsSource.findMany({ where: { enabled: true } })` cho **từng bài một** (N+1 DB queries).
   - Ở phía tạo nguồn, `resolveFeedUrl` (`feed-discovery.ts:233-304`) thực hiện 1 request ban đầu (`timeoutMs: 8_000`, `:246`), tối đa 5 probe `<link rel="alternate">` tuần tự (`MAX_ALTERNATE_CANDIDATES = 5`, `:7, 277-285`), và các `COMMON_FEED_PATHS` + subpath chạy theo batch `PROBE_BATCH_SIZE = 3` (`:6, 292-300`; tối đa 10 path ≈ 4 batch, tổng 16 lời gọi `fetchFeedWithCacheSafely` trước redirect). Đáng chú ý, `fetchFeedWithCacheSafely` áp `AbortSignal.timeout(timeoutMs)` **cho từng redirect hop** (`rss-fetcher.ts:266`, tối đa `MAX_FEED_REDIRECTS = 3`, `:14` = 4 hop/lần gọi), nên **chưa có tổng ngân sách thời gian (overall deadline)** dùng chung — worst-case trên host chậm/tarpit có thể vượt quá 3 phút và chạm 504 serverless timeout.
   - `NewsSource` chưa có `fetchIntervalMinutes`, `nextFetchAt`, hay `consecutiveFailures` để giãn lịch (exponential backoff) cho feed chết/429.

5. **Gap 5 (Trung bình) — Website không có RSS/Atom gốc & Redirect `301`/`308`:**
   - Nhiều trang AI/tech hiện đại (ví dụ SPA, blog tài liệu, newsletter) không xuất `<link rel="alternate">` hoặc không có RSS. Theo [`PLAN-knowledge-acquisition.md:88-90, 177-191`](./PLAN-knowledge-acquisition.md#L88-L90), mở rộng `sourceType` (`github_release`, `docs`, `api`, `web`) và snapshot R2 private thuộc Phase 2 (đang hoãn), nên cần phương án phân tầng rõ ràng giữa giải pháp dùng ngay trong Phase 1 và mở rộng Phase 2.
   - Ngoài ra, trong `syncNewsSourcesCron` (`rss-fetcher.ts:354`), nếu feed trả `301`/`308` Permanent Redirect sang URL mới, mỗi lần cron vẫn phải đi qua hop redirect mà chưa tự cập nhật `feedUrl`. Tuy nhiên, `fetchFeedWithCacheSafely` (`rss-fetcher.ts:217-304`) hiện trả `finalUrl` giống hệt nhau cho cả redirect tạm (`302`/`307`) lẫn redirect vĩnh viễn (`301`/`308`), và khi `301 -> 304` thì trả `{ kind: "not_modified", etag, lastModified }` **không kèm `finalUrl`**.

---

## 2. Phương án Đề xuất theo Kịch bản Ưu tiên (Kèm Trade-offs)

### Kịch bản A — Auto-Discovery Cải tiến & JSON Feed

| Kỹ thuật | Cơ chế áp dụng vào Repo | Trade-offs & Phù hợp với `crisne-website` |
|---|---|---|
| **1. Ngừng lưu thành công giả khi HTTP 4xx/5xx hoặc non-feed** | Tách chế độ trong `resolveFeedUrl` (`lib/news/feed-discovery.ts:233`): chế độ tương tác mặc định báo lỗi rõ ràng nếu URL trả 4xx/5xx/HTML không có feed; chỉ cho phép lưu "cưỡng bức" khi Owner xác nhận cờ `allowUnverified` trên UI. | **Ưu:** Tránh lưu nguồn chết kèm toast xanh. **Nhược:** Nếu site tạm thời rate-limit lúc thêm nguồn, cần nút *"Vẫn lưu nguồn này"* để không chặn Owner. |
| **2. Trả danh sách Multi-Candidate thay vì chọn ngầm index 0** | Khi `<head>` có nhiều `<link rel="alternate">` (vd: blog chính vs `/changelog` vs `/comments`), trả về tối đa 5 ứng viên (kèm `title`, `type`, `url`) để UI cho Owner chọn thay vì probe và lấy link đầu tiên (`feed-discovery.ts:284`). | **Ưu:** Không đăng ký nhầm comment feed hoặc chuyên mục phụ. **Nhược:** Thêm bước chọn trên UI khi có >1 feed (1 click bổ sung). |
| **3. Hỗ trợ JSON Feed 1.0/1.1 (`application/feed+json`)** | Mở rộng `FEED_MIME_REGEX` (`feed-discovery.ts:9`) nhận `application/feed+json` (và `application/json` nếu cấu trúc khớp `version: "https://jsonfeed.org/version/..."`); thêm parser ~40 dòng `parseJsonFeed` song song `parseRssOrAtomXml` trong `lib/news/rss-fetcher.ts`. Chỉ probe `/feed.json` khi thấy `<link rel="alternate">` hoặc quy tắc nền tảng để tránh probe nhầm API JSON. | **Ưu:** Zero dependency mới, zero DB migration, hỗ trợ tốt các blog Hugo/IndieWeb/Ghost/Next.js hiện đại. **Nhược:** Cần test validation chặt để không nhận nhầm JSON API thường. |
| **4. Phát hiện HTTP 200 HTML trong `syncNewsSourcesCron`** | Sau `fetchFeedWithCacheSafely`, kiểm tra `!isRssOrAtomDocument(...)` (và `!isJsonFeedDocument(...)`) trước khi parse (`rss-fetcher.ts:373`). Nếu nhận HTML thay vì feed, **không** ghi `lastError: null` mà ghi rõ `lastError` phân loại (Cloudflare challenge / URL đổi sang trang HTML). | **Ưu:** Phát hiện ngay nguồn bị bot-block âm thầm; zero migration. |

---

### Kịch bản B — Deterministic Platform URL Pattern Mapping (Trước bước HTML Probe)

Chạy một pure helper mới (ví dụ `lib/news/platform-feeds.ts`) **trước** bước fetch HTML chung trong `resolveFeedUrl`: khi URL khớp host/path của nền tảng phổ biến, ánh xạ trực tiếp sang candidate feed URL (vẫn chạy `assertPublicHostname` và probe xác nhận XML/JSON).

| Nền tảng | Pattern đầu vào | Feed URL ánh xạ / Chiến lược | Độ tin cậy & Lưu ý riêng cho Repo |
|---|---|---|---|
| **GitHub Repo / User** | `github.com/:owner/:repo(/releases)?`, `github.com/:user` | `https://github.com/:owner/:repo/releases.atom` (hoặc `/tags.atom`, `/commits.atom`); user/org → `https://github.com/:user.atom` | **Rất cao** (native Atom, không cần auth). Khớp trực tiếp nhu cầu Phase 2 (`github_release` trong `PLAN-knowledge-acquisition.md:88`). Lưu ý cảnh báo `:92`: domain `github.com` đã nằm sẵn trong `DEFAULT_ALLOWED_DOMAINS` (`url-guard.ts:32`). |
| **YouTube Channel / Playlist / `@handle`** | `youtube.com/channel/UC...`, `youtube.com/playlist?list=PL...`, `youtube.com/@handle` | `channel_id` / `playlist_id` → `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` (hoặc `playlist_id=PL...`). Với `@handle`: ưu tiên trích `channelId` từ `<link rel="canonical">` hoặc `<link rel="alternate">` trong `<head>` (hoặc quét `"externalId"` trên HTML thô trước bước strip `<script>` với cửa sổ byte đủ lớn) rồi map sang `videos.xml`. | **Cao.** `url-guard.ts:310-366` đã chuẩn hóa URL video YouTube (`youtube.com/watch?v=...`) và `news-ingest-worker` đã có extractor captions/Whisper/Vision. Caveat: `extractAlternateFeedLinksFromHtml` (`feed-discovery.ts:141-146`) cắt ở `</head>` hoặc `128KB` (`MAX_HEAD_SCAN_BYTES`) và strip `<script>` — nơi chứa `ytInitialData."externalId"`; ngoài ra trang `@handle` có thể gặp EU consent page trên IP datacenter. |
| **Medium** | `medium.com/@:user`, `medium.com/:pub`, `:user.medium.com` | `https://medium.com/feed/@:user`, `https://medium.com/feed/:pub`, `https://:user.medium.com/feed` | **Trung bình–Cao.** HTML của Medium thường trả `403` Cloudflare với datacenter IP, trong khi `/feed/...` thường đọc thẳng được → pattern mapping giải quyết trực diện lỗi này. |
| **Dev.to** | `dev.to/:user`, `dev.to/t/:tag` | `https://dev.to/feed/:user`, `https://dev.to/feed/tag/:tag` | **Rất cao** (native RSS). |
| **Substack** | `*.substack.com(/p/...)?` (lưu ý: **không** rewrite cưỡng bức `substack.com/@:user`) | `https://:pub.substack.com/feed` | **Rất cao** với subdomain `:pub.substack.com` (rút ngắn 1 HTTP GET so với `COMMON_FEED_PATHS`). Với `substack.com/@:user`, handle tác giả thường khác subdomain hoặc là custom domain nên **bắt buộc** fallback về HTML `<link rel="alternate">` discovery thay vì đoán `:user.substack.com/feed`. |
| **Hashnode / Ghost / WordPress** | `*.hashnode.dev`, blog Ghost/WP | Hashnode: `:origin/rss.xml`; Ghost: `:origin/rss/`; WP: `:origin/feed/` | **Cao** (kết hợp `<link rel="alternate">` cho custom domain). |
| **Bluesky / Mastodon** | `bsky.app/profile/:handle`, `:instance/@:user` | Bluesky: `https://bsky.app/profile/:handle/rss`; Mastodon: `https://:instance/@:user.rss` | **Cao** (cả hai hỗ trợ RSS gốc). |
| **Reddit** | `reddit.com/r/:sub` | `https://www.reddit.com/r/:sub/.rss` | **Thấp–Trung bình trên Vercel:** Reddit thường chặn `429`/`403` IP datacenter; cần User-Agent rõ ràng và báo lỗi `RATE_LIMITED` / `BOT_BLOCKED` minh bạch. |
| **Hacker News / Lobste.rs** | `news.ycombinator.com`, `lobste.rs` | HN: `https://news.ycombinator.com/rss` hoặc `https://hnrss.org/frontpage`; Lobste.rs: `https://lobste.rs/rss` | **Caveat `DOMAIN_NOT_ALLOWED`:** Entry `<link>` của aggregator trỏ ra domain ngoài whitelist → hiện bị `enqueueNewsUrl` chặn (xem Gap 1 & Kịch bản C). |

**Trade-off:** Tốn công bảo trì rất thấp (1 file pure TypeScript + unit test), giảm số HTTP request trong `POST /api/news/sources` (tránh chạm timeout serverless), và vượt được trường hợp trang HTML chặn bot nhưng endpoint `/feed` vẫn mở. Nhược điểm duy nhất là URL custom domain (Substack/Ghost dùng domain riêng) vẫn cần fallback về `<link rel="alternate">`.

---

### Kịch bản C — Feed Validation, Dry-Run Preview, Chuẩn hóa Lỗi & Aggregator Links

1. **Dry-Run Preview Endpoint (`POST /api/news/sources/preview`):**
   - Bảo vệ bằng `requireWriteAccess` (Owner-only).
   - Nhận `{ feedUrl }` → chạy `assertPublicHostname` → platform pattern / `<link rel="alternate">` discovery → fetch với **tổng ngân sách thời gian dùng chung (shared overall deadline / `AbortSignal`, vd 8–10s)** truyền xuyên suốt `resolveFeedUrl` và `fetchFeedWithCacheSafely` (vì hiện `fetchFeedWithCacheSafely` đặt timeout per-hop ở `rss-fetcher.ts:266`) → parse XML/JSON **không ghi DB**.
   - Trả về:
     ```ts
     {
       resolvedFeedUrl: string;
       siteHost: string;
       feedTitle?: string;
       format: "rss" | "atom" | "json";
       candidates: Array<{ url: string; title?: string; format?: string }>;
       itemCount: number;
       sampleItems: Array<{ title?: string; url: string; publishedAt?: string }>;
       warnings: string[]; // vd: phát hiện link ngoài whitelist, hoặc feed 0 bài
     }
     ```
   - **Trade-off:** Thêm ~1–3s độ trễ bình quân (bị chặn trần ở 8–10s để tránh Vercel 504 timeout trên host chậm) lúc bấm "Kiểm tra feed" trên UI `SourcesManagerSheet`, đổi lại Owner thấy trước tiêu đề, số bài mẫu, chọn đúng feed trong nhiều candidate, và phát hiện sớm site chặn bot hoặc link ngoài whitelist trước khi bấm lưu.

2. **Phân loại Lỗi Fetch/Parse Có Hành động Cụ thể:**
   Thay vì chuỗi chung `"Tải feed thất bại với HTTP 403"` hay `lastError: null`, chuẩn hóa mã lỗi lưu vào `lastError` / trả ở preview:
   - `SSRF_BLOCKED`: Host/IP nội bộ hoặc DNS private (`url-guard.ts`).
   - `BOT_BLOCKED` (HTTP 403/401 + dấu hiệu `cf-mitigated` / `server: cloudflare`, hoặc HTTP 200 HTML challenge): Gợi ý *"Site chặn bot tự động — thử RSSHub hoặc dán bài lẻ qua Quick Paste"*.
   - `RATE_LIMITED` (HTTP 429, đọc header `Retry-After`): Gợi ý giãn lịch quét.
   - `NOT_FOUND` (HTTP 404/410): Gợi ý kiểm tra lại URL hoặc chạy Auto-Discovery lại.
   - `TIMEOUT` / `TOO_LARGE` (>2MB): Gợi ý giảm hoặc kiểm tra feed tổng hợp quá nặng.
   - `MALFORMED_XML` / `EMPTY_FEED`: Phân biệt file không phải feed với feed hợp lệ nhưng tạm chưa có item.

3. **Giải quyết Aggregator External Links (`DOMAIN_NOT_ALLOWED`) — So sánh 2 Phương án:**
   - **Option C1 (Zero-migration, chỉ chẩn đoán):** Giữ nguyên whitelist chặt trong `enqueueNewsUrl`; thêm `skippedReasons: Array<{ url: string; code: string }>` (giới hạn 5 dòng) vào `CronSyncSourceResult` và cảnh báo ngay ở `/preview` nếu phần lớn `sampleItems` trỏ ra domain ngoài `DEFAULT_ALLOWED_DOMAINS`.
   - **Option C2 (Khuyến nghị nếu dùng nguồn aggregator — 1 migration nhỏ):** Thêm cột `allowExternalLinks Boolean @default(false)` trên `NewsSource`. Khi `syncNewsSourcesCron` chạy cho nguồn có `allowExternalLinks === true`, truyền cờ boolean chuyên biệt **`allowAnyPublicDomain: true`** (hoặc `skipDomainAllowlist: true`) trong `ResolveUrlOptions` (`lib/news/url-guard.ts:95-100`) — áp dụng ở cả `followRedirectsSafely` (`:474`) lẫn `resolveAndValidateUrl` (`:514, 529`) — **chỉ cho item từ cron job của nguồn đó** (không mở whitelist toàn cục cho `/share` hay `/api/ingest`). Không dùng trick truyền `new URL(entry.url).hostname` vào `extraAllowedDomains`, vì các link rút gọn (`t.co`, `bit.ly`, tracking redirect của newsletter) sẽ redirect sang domain đích không có trong `extraAllowedDomains` và vẫn bị `followRedirectsSafely` (`:474`) từ chối với `DOMAIN_NOT_ALLOWED`.
   - **An toàn SSRF & Mở rộng Bề mặt Tấn công (Threat Model):**
     - Dù bật `allowAnyPublicDomain`, `resolveAndValidateUrl` (`url-guard.ts:472, 522, 536`), `assertNoUrlCredentials` (`:470, 505`), và `news-ingest-worker/news_worker/ssrf.py` **vẫn bắt buộc** kiểm tra private IP / `assertPublicHostname` trên URL gốc và **mọi redirect hop**. Kết hợp thêm `parseRssOrAtomXml` sort `publishedAt` mới nhất trước khi `.slice(0, maxItems)` và suy luận charset từ `Content-Type` / `<?xml encoding="..."?>` trước `TextDecoder`.
     - **Rủi ro DNS rebinding (TOCTOU) & khuếch đại quota worker/LLM:** Cần lưu ý rằng khi bật `allowExternalLinks === true` cho aggregator công cộng (HN, Lobste.rs, newsletter, RSSHub), **bên thứ ba không tin cậy (untrusted submitters)** — chứ không phải Owner — kiểm soát URL `<link>` đích và authoritative DNS server của domain đó, nên giả định "Owner-only (ADR-0019)" không bảo vệ được đích đến. Để bật an toàn cần 2 lớp bảo vệ đi kèm: (a) **chống DNS rebinding TOCTOU** bằng custom undici `Dispatcher` `lookup` (và pin IP khi fetch ở `news-ingest-worker`) để socket kết nối đúng IP public đã validate; (b) **chống khuếch đại quota worker/LLM** bằng cách giới hạn `maxItemsPerSource` cho nguồn `allowExternalLinks` (vd `<= 5–10`), và tùy chọn tắt fallback tải video/Whisper nặng hoặc chỉ cho phép trích xuất bài viết nhẹ (article/summary) với các item xuất phát từ aggregator ngoài whitelist.

---

### Kịch bản D — Cấu hình Cron/Sync Theo Nguồn & Giới hạn Hạ tầng `crisne-website`

> **Lưu ý kiến trúc (ADR-0005):** `crisne-website` chạy **Turso (libSQL/SQLite)**, **không dùng Postgres/Supabase**, do đó `pg_cron` / `pg_net` không áp dụng được. Mọi thiết kế lịch quét phải dựa trên Next.js API (`/api/news/cron`) + scheduler ngoài hoặc Vercel Cron + SQLite DDL.

#### 1. So sánh Runner Lịch Quét

| Phương án Runner | Cách hoạt động | Trade-offs trên Stack Hiện tại |
|---|---|---|
| **Vercel Cron (Hiện tại: `0 4 * * *`)** | `vercel.json` gọi `GET /api/news/cron` với `CRON_SECRET`. | **Hobby plan:** Tối đa 1 lần/ngày cho mỗi cron job và giới hạn thời gian thực thi serverless ngắn (nên cần `export const maxDuration` tối đa gói cho phép, xem [`PLAN-knowledge-acquisition.md:181`](./PLAN-knowledge-acquisition.md#L181)). Không hỗ trợ chu kỳ 1h/4h nếu ở gói Hobby. **Pro plan:** Chạy được dày hơn (từng phút/giờ) và `maxDuration` cao hơn. |
| **GitHub Actions Scheduled Workflow** | Workflow `.github/workflows/news-cron.yml` (`cron: "0 * * * *"`) gọi `POST /api/news/cron` kèm `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. | **Ưu:** Miễn phí chạy theo giờ (1h/6h) mà không cần nâng cấp Vercel Pro; đã được endpoint `/api/news/cron` hỗ trợ sẵn (`docs/DEPLOY_ENV.md:193`). **Nhược:** GitHub `schedule` có thể trễ 5–20 phút vào giờ cao điểm và cần khai báo `CRON_SECRET` trong GitHub Secrets. |
| **Trigger định kỳ từ `news-ingest-worker`** | Thêm vòng lặp nhẹ trong `news-ingest-worker` (đã chạy luôn trên Render/Docker) gọi `POST /api/news/cron` theo nhịp cố định (vd 30–60 phút). | **Ưu:** Đúng giờ nhất, không phụ thuộc Vercel Hobby hay GitHub jitter; vẫn giữ logic parse/enqueue ở Next.js đúng ranh giới **ADR-0016**. **Nhược:** Nếu worker ngủ (Render free tier spin-down khi idle) thì cron cũng trễ; cần thêm `CRON_SECRET` cho worker. |
| **External Cron (cron-job.org / Cloudflare Worker)** | Gọi HTTP `GET/POST /api/news/cron` kèm `x-cron-secret`. | **Ưu:** Độc lập deploy, dễ cấu hình. **Nhược:** Thêm một dịch vụ ngoài để quản lý secret. |

#### 2. Tối ưu Bắt buộc trong `syncNewsSourcesCron` (Làm được ngay, chưa cần đổi lịch)

1. **Loại bỏ N+1 DB query trong cron:** Preload danh sách `domain` của các `NewsSource` `enabled: true` **1 lần** ở đầu `syncNewsSourcesCron` và truyền vào `enqueueNewsUrl` (hoặc thêm option `preloadedSourceDomains?: string[]` ở `EnqueueNewsOptions`) thay vì `prisma.newsSource.findMany` cho từng entry (`lib/news/ingest.ts:46-50`).
2. **Khai báo `maxDuration` & Giới hạn thời gian (Time Budget):** Đặt `export const maxDuration = 60` trên `app/api/news/cron/route.ts` (giống `app/api/roadmap-assistant/[...path]/route.ts:7`, tùy gói Vercel) và chạy `syncNewsSourcesCron` theo batch đồng thời có giới hạn (vd concurrency `3–4` bằng `Promise.allSettled`) kết hợp time-budget guard (dừng nhận thêm nguồn mới khi gần chạm ngưỡng timeout) để không chết giữa chừng khi có >10 nguồn.
3. **Cập nhật `301`/`308` Permanent Redirect URL có điều kiện:** Hiện `fetchFeedWithCacheSafely` (`lib/news/rss-fetcher.ts:217-304`) trả `finalUrl` giống nhau cho cả redirect tạm (`302`/`307`) lẫn `301`/`308` và bỏ mất `finalUrl` khi `301 -> 304`. Do đó **không** ghi đè `feedUrl` mù theo `finalUrl` (sẽ làm hỏng nguồn nếu CDN/site trả `302` tạm thời); cần mở rộng `FeedFetchResult` để theo dõi liệu chuỗi redirect chỉ gồm các hop vĩnh viễn (`301`/`308`) và giữ lại `finalUrl` kể cả khi hop cuối trả `304`, khi đó mới tự động cập nhật `NewsSource.feedUrl` (sau `assertPublicHostname` và không đụng `@unique`).

#### 3. Per-Source Cadence & Backoff (Khi đã có Runner dày hơn 1 lần/ngày)

Khớp với tên cột dự kiến ở [`PLAN-knowledge-acquisition.md:89, 181`](./PLAN-knowledge-acquisition.md#L89):
- Thêm vào `NewsSource`: `fetchIntervalMinutes Int @default(1440)` (preset UI: `60` = 1 giờ, `360` = 6 giờ, `720` = 12 giờ, `1440` = hằng ngày), `nextFetchAt DateTime?`, cùng các trường theo dõi độ ổn định tùy chọn `consecutiveFailures Int @default(0)` và `lastSuccessAt DateTime?`.
- `syncNewsSourcesCron` (khi không truyền `sourceId` thủ công) chỉ quét các nguồn `enabled: true` và `nextFetchAt === null || nextFetchAt <= now`, ưu tiên `nextFetchAt ASC`.
- **Backoff thông minh:** Thành công (`200` / `304`) → `consecutiveFailures = 0`, `lastSuccessAt = now`, `nextFetchAt = now + fetchIntervalMinutes`. Lỗi tạm thời (`429`, `5xx`, timeout) → tăng `consecutiveFailures`, `nextFetchAt = now + min(fetchIntervalMinutes * 2^failures, 7 ngày)` (ưu tiên `Retry-After` nếu có). Lỗi vĩnh viễn (`404`/`410`) vượt ngưỡng (vd 10 lần) → giữ `lastError` rõ ràng hoặc tự tạm tắt `enabled = false` để không đốt ngân sách cron.
- Bấm **"Quét tất cả ngay"** hoặc **"Quét"** từng nguồn trên `SourcesManagerSheet` luôn bỏ qua `nextFetchAt` để Owner ép quét tức thời.

---

### Kịch bản E — Lựa chọn cho Website Không có Native RSS/Atom Feed

| Phương án | Cơ chế & Vị trí trong Kiến trúc | Trade-offs & Khuyến nghị |
|---|---|---|
| **1. Quick Paste / PWA `/share` / Chrome Extension (Đã có)** | `QuickPasteDialog.tsx` → `POST /api/ingest` → `news-ingest-worker`. | **Tối ưu cho tin lẻ & site chống bot nặng (X/Twitter, TikTok).** Zero bảo trì, độ chính xác cao nhất. |
| **2. JSON Feed (`/feed.json`)** | Như Kịch bản A.3 (`fast-xml-parser` giữ cho XML, thêm JSON Feed parser ~40 dòng). | **Nên làm ngay** vì nhiều blog tech hiện đại xuất JSON Feed thay hoặc song song RSS. |
| **3. Cầu nối bên ngoài (Kill the Newsletter / Self-hosted RSSHub)** | Newsletter → Atom URL từ Kill the Newsletter; site không RSS → URL của RSSHub self-hosted nhập thẳng vào `NewsSource.feedUrl`. | **Không cần sửa backend.** Lưu ý: tránh phụ thuộc public `rsshub.app` (thường 429/chết); nếu dùng cầu nối trỏ link gốc ra ngoài, cần Kịch bản C (`allowExternalLinks`) để item không bị `DOMAIN_NOT_ALLOWED`. |
| **4. `sitemap.xml` theo Prefix URL (`sourceType: "sitemap"`)** | Nhiều trang AI/Docs (OpenAI, Anthropic, Next.js) bỏ RSS nhưng vẫn duy trì `/sitemap.xml` hoặc `/sitemap-posts.xml` kèm `<lastmod>`. Có thể tái sử dụng `fast-xml-parser` lọc `<loc>` theo prefix cấu hình (vd `/blog/`, `/news/`) và chỉ lấy URL có `<lastmod>` mới hơn `lastFetchedAt`. | **Ưu:** Phủ tốt các trang Next.js/Astro không có RSS, không cần headless browser. **Nhược:** File sitemap có thể vượt `2MB` (`MAX_FEED_XML_BYTES`), thiếu `<title>`/`<description>` (phải chờ worker fetch từng trang), cần `configJson` lưu `urlPrefix` (`PLAN-knowledge-acquisition.md:90`). |
| **5. HTML Listing Scraping (`sourceType: "web"` — Phase 2)** | Thuộc **Phase 2** đang hoãn (`PLAN-knowledge-acquisition.md:88, 177-191`). Theo **ADR-0016**, nếu triển khai sau này nên đặt bộ trích xuất HTML (`httpx` + `trafilatura`/BeautifulSoup, **không LLM** ở bước quét danh sách) tại `news-ingest-worker` thay vì nhét `cheerio`/Playwright vào Vercel serverless routes. | **Không khuyến nghị làm trên Next.js Vercel** (dễ vỡ khi DOM đổi, phình bundle, chạm timeout Vercel). |

---

## 3. Lộ trình Triển khai Đề xuất (Phân kỳ Hành động)

### Tier 1 — Cải tiến Ngay, Zero DB Migration (Pure TypeScript + UI)

1. **`lib/news/platform-feeds.ts` (mới) + `lib/news/feed-discovery.ts`:**
   - Thêm deterministic mapping cho GitHub (`releases.atom`, user `.atom`), YouTube (`channel/`, `playlist?list=`, `@handle` trích `channelId` từ `<head>` hoặc raw HTML trước strip `<script>`), Medium, Dev.to, Substack (`*.substack.com`, không rewrite mù `substack.com/@:user`), Hashnode, Bluesky, Mastodon.
   - Mở rộng `FEED_MIME_REGEX` nhận `application/feed+json`; ngừng trả thành công giả khi URL lỗi 4xx/5xx (trừ khi có cờ xác nhận từ UI).
   - Bắt buộc gắn **tổng ngân sách thời gian dùng chung (shared deadline / `AbortSignal`, vd 8–10s)** cho `resolveFeedUrl` và truyền xuống `fetchFeedWithCacheSafely` (vốn đặt `AbortSignal.timeout` per-hop ở `rss-fetcher.ts:266`) để tránh 504 serverless timeout trên host chậm.
2. **`lib/news/rss-fetcher.ts` + `lib/news/ingest.ts`:**
   - Hỗ trợ parse JSON Feed 1.0/1.1; sort entry theo `publishedAt` giảm dần trước `.slice(0, maxItems)`; sửa `extractRssItemUrl` truyền `baseFeedUrl` cho `guid`; suy luận charset từ `Content-Type`/XML prolog trước `TextDecoder`.
   - Phát hiện HTTP 200 trả HTML (không ghi `lastError: null`); phân loại lỗi rõ (`BOT_BLOCKED`, `RATE_LIMITED`, `NOT_FOUND`, `MALFORMED_XML`, `EMPTY_FEED`).
   - Preload `enabled` source domains 1 lần trong `syncNewsSourcesCron` (xóa N+1 query); gom bounded concurrency (`Promise.allSettled` batch 3–4) + time budget; trả chi tiết `skippedReasons` (tối đa 5) cho `DOMAIN_NOT_ALLOWED`.
3. **`app/api/news/sources/preview/route.ts` (mới) + `components/news/SourcesManagerSheet.tsx`:**
   - Route `POST /api/news/sources/preview` (`requireWriteAccess`) dùng chung overall deadline (8–10s) trả candidates, sample items và cảnh báo (aggregator external links / bot-block) để Owner kiểm tra & chọn feed trước khi lưu.
   - Gắn `export const maxDuration = 60` (theo giới hạn gói Vercel) trên `app/api/news/cron/route.ts`.
   - **Yêu cầu đồng bộ (`cris-how-to-sync`):** Cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json` & `docs/code-intel/` nếu thêm route mới `/api/news/sources/preview`, chạy `yarn intel status`.

### Tier 2 — Nâng cấp Schema Turso & Lịch Quét Linh hoạt (1 Migration)

1. **Schema & Migration (ADR-0005):**
   - Thêm trên `NewsSource`: `allowExternalLinks Boolean @default(false)`, `fetchIntervalMinutes Int @default(1440)`, `nextFetchAt DateTime?`, `consecutiveFailures Int @default(0)`, `lastSuccessAt DateTime?` (tên cột đồng bộ [`PLAN-knowledge-acquisition.md:89`](./PLAN-knowledge-acquisition.md#L89)).
   - Nếu bật `allowExternalLinks`: thêm `allowAnyPublicDomain?: boolean` trong `ResolveUrlOptions` (`lib/news/url-guard.ts`) cho cả `resolveAndValidateUrl` lẫn `followRedirectsSafely`, kết hợp DNS IP pinning (custom undici `Dispatcher` `lookup` + `news-ingest-worker` `ssrf.py`) và giới hạn quota (`maxItemsPerSource`, tùy chọn tắt video/Whisper fallback cho item aggregator).
   - Nếu tự động cập nhật redirect vĩnh viễn: mở rộng `FeedFetchResult` (`lib/news/rss-fetcher.ts`) phân biệt `301`/`308` với `302`/`307` và giữ `finalUrl` trên `304`.
   - **Checklist bắt buộc trong cùng 1 commit (`PLAN-knowledge-acquisition.md:84`):**
     - Cập nhật `prisma/schema.prisma` và `prisma/init-turso.sql`.
     - Viết script migration Turso (tương tự `scripts/add-news-source-cache.ts`).
     - Chạy `yarn test:schema-sql` để cập nhật `roadmap-rag-assistant/tests/fixtures/schema.sql` và kiểm bằng `yarn test:schema-sql --check`.
2. **Scheduler & Doc Sync:**
   - Nếu cần quét dày hơn 1 lần/ngày trên Vercel Hobby, bổ sung GitHub Actions workflow (hoặc trigger từ `news-ingest-worker`) gọi `POST /api/news/cron` với `CRON_SECRET`, vẫn giữ `vercel.json` khớp `NEWS_CRON_SCHEDULE` (`tests/unit/news-cron-schedule.test.ts`).
   - Cập nhật `docs/DEPLOY_ENV.md:193` cho hết doc drift với `vercel.json`.
   - Cập nhật Zod schemas (`lib/news/schemas.ts`), `SourcesManagerSheet.tsx` (preset tần suất + checkbox `allowExternalLinks`), và `cris-code-intel` + `yarn intel status`.

### Tier 3 — Mở rộng Cho Site Không có Feed (Tùy chọn / Phase 2)

1. Thêm `sourceType` (`"rss" | "sitemap" | "web"`) + `configJson` theo lộ trình Phase 2 của [`PLAN-knowledge-acquisition.md:88-90, 177-191`](./PLAN-knowledge-acquisition.md#L88-L90).
2. Hỗ trợ `sitemap.xml` path-prefix ingestion trước; chỉ xem xét `sourceType: "web"` (chạy trên `news-ingest-worker` theo ADR-0016) khi thực sự có site mục tiêu không dùng được Quick Paste hay RSSHub.

---

## 4. Ràng buộc Tuân thủ & Lưu ý (Caveats)

- **Thuật ngữ (`GLOSSARY.md:93-108`):** Tài liệu, UI và code mới dùng **News Source** (`nguồn tin` / `nguồn RSS`) và **News Item** (`tin`), tránh các từ bị cấm như `subscription`, `channel`, `article`, `bookmark`.
- **Owner-only & SSRF (ADR-0019, `lib/news/url-guard.ts`):** Mọi endpoint preview/probe hay chế độ `allowExternalLinks` bắt buộc giữ `requireWriteAccess` và `assertPublicHostname` / `resolveAndValidateUrl` trên URL đầu vào lẫn từng redirect hop.
- **Không phá vỡ hợp đồng test hiện có:** Khi thay đổi `vercel.json`, luôn cập nhật `lib/news/cron-schedule.ts` (`NEWS_CRON_SCHEDULE.cron`) để pass `tests/unit/news-cron-schedule.test.ts`.
- **Giới hạn đã xác minh vs chưa xác minh:** Các đường dẫn/symbol trong repo đã kiểm tra trực tiếp; giới hạn thực tế của gói Vercel đang deploy (`maxDuration` tối đa và số cron/ngày) cần xác nhận trên dashboard Vercel của project trước khi triển khai Tier 2.
