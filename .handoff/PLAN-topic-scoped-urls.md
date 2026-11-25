# PLAN: URL theo Topic `/[topicSlug]/[lessonSlug]#[headingSlug]`

- Quyết định: [ADR-0014](../docs/adr/0014-topic-scoped-urls-and-heading-anchors.md) (thay ADR-0013)
- Trạng thái: Phase 1 và Phase 2 đã làm và commit trên `main` @ `8543da4` (2026-11-19). Kết quả test thủ công: `tests/manual/topic-scoped-urls.md`

## Đang làm

Gộp URL về một cây theo Topic:

| Hiện tại | Mới |
|---|---|
| `/topic/ai-architecture` | `/ai-architecture` |
| `/lessons/knowledge-base#h-2` | `/ai-architecture/knowledge-base#context-window` |

URL cũ (`/topic/*`, `/lessons/*`, `/?topic=&item=`) trả 308 về URL mới.

## Không làm

- Roadmap Assistant (`roadmap-rag-assistant/`: `engine.py`, `links.py`, `prompts.py`, evals). Link cũ của nó vẫn chạy nhờ 308. Đổi sau, theo yêu cầu của Owner.
- Schema / migration: giữ `RoadmapItem.slug` unique toàn cục và bảng `SlugRedirect`.
- Sửa cách sinh `Topic.slug` từ title (regex `\w` đang bỏ ký tự có dấu). Đây là vấn đề có sẵn, không thuộc task này.
- Cris AI (`/portfolio`, floating bot) và `middleware.ts`.

## Cách làm

Chuyển các page về `app/[topicSlug]/...`. Route tĩnh (`notes`, `portfolio`, `login`, `lessons`, `topic`, `api`) vẫn được Next.js ưu tiên hơn segment động. Để `Topic.slug` không bao giờ trùng các route đó, thêm danh sách slug cấm. Link được sinh từ hai helper, thay cho khoảng 30 chỗ đang tự ghép chuỗi. URL đã đổi hai lần nên gom về một chỗ là đáng làm.

Phương án tối thiểu bị loại: chỉ thêm rewrite trong `next.config` và giữ page cũ. Cách này không đổi canonical, sitemap hay link nội bộ, nên vẫn tồn tại hai bộ URL.

## Phase 1: Anchor heading ổn định (ship riêng được)

- `lib/roadmap/content-utils.ts:165` `withHeadingIds`: đổi id `h-${n}` thành slug từ text heading. Cách sinh slug: NFD, bỏ dấu, `đ` thành `d`, chữ thường, ký tự khác `[a-z0-9]` thành `-`, gộp nhiều `-` liên tiếp, cắt `-` ở đầu và cuối. Text rỗng sau khi xử lý thì dùng `section`. Id trùng thì nối `-2`, `-3`, …
- Không phải sửa nơi gọi hàm: `LessonEditorialReader` và mục lục đều đọc `headings[].id`.
- Test: thêm vào `tests/unit/` các case heading tiếng Việt, heading trùng, heading chỉ có emoji/ký hiệu, và kiểm tra id không đổi khi chèn heading mới phía trên.

## Phase 2: Route mới, redirect, link nội bộ (một phase, không tách được)

Route mới và link phải đổi cùng lúc. Nếu tách, link nội bộ sẽ đi qua 308 hoặc trỏ tới route chưa tồn tại.

**Helper**: `lib/roadmap/paths.ts` (file mới)
- `topicPath(topicSlug)` trả `/${topicSlug}`. `lessonPath(topicSlug, lessonSlug)` trả `/${topicSlug}/${lessonSlug}`.
- `RESERVED_TOPIC_SLUGS = ['api', 'lessons', 'topic', 'notes', 'portfolio', 'login', '_next']` và `isReservedTopicSlug()`.

**Route mới**: chuyển file, giữ nguyên nội dung render
- `app/topic/[topicSlug]/{page,opengraph-image,error}.tsx` và `app/topic/layout.tsx` chuyển sang `app/[topicSlug]/...`.
- `app/lessons/[lessonSlug]/{page,opengraph-image,error}.tsx` chuyển sang `app/[topicSlug]/[lessonSlug]/...`. Ở `page.tsx` và `generateMetadata`, sau khi `resolveLessonGlobal(lessonSlug)`:
  - `redirect` → 308 về `lessonPath(topic.slug, toSlug)`, tra topic của bài đích.
  - `found` nhưng `topic.slug !== params.topicSlug` → 308 về `lessonPath(topic.slug, item.slug)`.
  - canonical, OG url: dùng `lessonPath`.
- `app/lessons/layout.tsx`: gộp vào `app/[topicSlug]/layout.tsx` nếu hai layout giống nhau. Nếu khác, đặt layout ở `app/[topicSlug]/[lessonSlug]/layout.tsx`.

**Redirect cũ**: page mỏng, chỉ resolve rồi `permanentRedirect`
- `app/topic/[topicSlug]/page.tsx` → `topicPath`.
- `app/topic/[topicSlug]/[itemSlug]/page.tsx` → `lessonPath` (giữ logic resolve hiện có).
- `app/lessons/[lessonSlug]/page.tsx` → `lessonPath`.
- `app/page.tsx:53,57` (query `?topic=&item=`) → `lessonPath` / `topicPath`.

**Chặn slug trùng**: `app/api/v1/roadmaps/route.ts:50`. Nếu `isReservedTopicSlug(baseSlug)` thì nối `-topic` trước bước kiểm trùng. Abot tạo Topic cũng đi qua route này (ADR-0002), nên chỉ cần sửa một chỗ.

**Link nội bộ**: thay chuỗi tự ghép bằng `topicPath` / `lessonPath`
- `components/roadmap/RoadmapMap.tsx:102,165`: thêm prop `topicSlug`, truyền từ `TopicEditorialPage.tsx:383` và `RoadmapWorkspace.tsx:326`.
- `components/roadmap/PublicationHome.tsx:47,101,147` (`recentLessons` đã có `topicSlug`).
- `components/roadmap/TopicEditorialPage.tsx:163,284,413,472,550`
- `components/roadmap/LessonEditorialReader.tsx:165,184,227,233,241,255,270`. Ở dòng 165, sau khi lưu bài: dùng topic slug sau cập nhật, vì có thể bài vừa được chuyển sang Topic khác.
- `components/roadmap/LectureShell.tsx:292,433,450,490`
- `components/roadmap/RoadmapWorkspace.tsx:197,210,219,232,400`
- `components/roadmap/EditItemInfoDrawer.tsx:264,267`: text preview hiển thị `lessonPath(topicSlug, normalizedSlug)` với topic đang chọn.
- `app/sitemap.ts:63,72`, `app/[topicSlug]/page.tsx` (JSON-LD, dòng 85 cũ), `app/page.tsx:75`.

**Page context cho Abot**: `logic/roadmap/roadmapAssistantService.ts:69` `getRoadmapPageContext`
- Đọc `/{topic}` và `/{topic}/{lesson}` khi segment đầu không nằm trong `RESERVED_TOPIC_SLUGS`. Giữ nhánh đọc `data-roadmap-context` cho trang Lesson.
- Bỏ regex `/lessons/` và `/topic/`, vì URL cũ đã 308 trước khi client chạy.

**Tests**: sửa và thêm
- Sửa kỳ vọng href: `tests/unit/roadmap-lecture-layout.test.tsx:310,341,348`, `tests/unit/slug-and-section-combobox.test.tsx:218,233,328`, `tests/route/lesson-slug-and-move.test.ts:155-171`.
- Thêm: Lesson với topic sai → 308; slug cũ → 308 một bước; `/lessons/x`, `/topic/t`, `/topic/t/x` → 308 URL mới; tạo Topic tên `Notes` → slug `notes-topic`; `getRoadmapPageContext` trên `/notes` trả `undefined`.

**Docs và code intel**
- `docs/code-intel/CRIS_WORKSPACE_MAP.md:200-202,236` và `.agents/skills/cris-code-intel/data/cris-workspace-map.json`: route mới, các route redirect, ADR-0014. Chạy `yarn intel status`.

## Quyết định chính

1. Tìm bài theo `lessonSlug` toàn cục, `topicSlug` chỉ để kiểm tra rồi 308. Nhờ vậy chuyển bài sang Topic khác không cần bảng redirect mới.
2. Slug cấm thì nối `-topic` thay vì trả lỗi, để Abot tạo Topic "Notes" vẫn thành công. Cách này giống cách ADR-0013 nối `-${topicSlug}` khi slug bài bị trùng.
3. Giữ page redirect cho URL cũ, không xoá route. Abot và link đã chia sẻ đều cần chúng.
4. Phase 1 tách riêng vì không phụ thuộc route.

## Impact

GitNexus MCP không kết nối trong phiên này, và `yarn intel` không có lệnh `impact`. Danh sách trên lấy bằng grep `/lessons/` và `/topic/` trong `app components lib logic hooks tests`, chưa phải impact analysis đầy đủ. Cần chạy `gitnexus_impact` cho `withHeadingIds`, `getRoadmapPageContext`, `resolveLessonGlobal` trước khi sửa.

- Phase 2 chạm khoảng 20 file (vượt ngưỡng 8): toàn bộ route roadmap công khai và link nội bộ. Risk: MEDIUM. Rollback bằng revert commit, không đụng dữ liệu.
- Không có env, dependency, service hay lệnh mới.

## Xung đột rule

- ADR-0013 đã được đánh dấu superseded bởi ADR-0014 theo yêu cầu của Owner.
- Phạm vi Abot (AGENTS.md): phần Python để làm sau. Riêng `getRoadmapPageContext` là code Next.js gửi page context cho Abot, nên phải sửa ở phase 2 để Abot không mất context trên URL mới.

## Verify

- `yarn tsc --noEmit -p .` · `yarn lint` · `yarn test`
- Manual trên dev: `/ai-architecture`, `/ai-architecture/knowledge-base#<heading>`, `/lessons/knowledge-base` (308), `/topic/ai-architecture` (308), `/ai-architecture/sai-slug` (404), `/backend-roadmap/knowledge-base` (308 về đúng topic), `/notes`, `/portfolio`, `/llms.txt`, `/og-image.png` vẫn mở được. Ghi kết quả theo `tests/manual/README.md`.
- Câu hỏi về Abot (bot chưa đổi): link trong câu trả lời mở được và về đúng URL mới.

## Chưa rõ

- File trong `public/` có được ưu tiên hơn `app/[topicSlug]` không. Kiểm tra bằng bước manual `/llms.txt`, `/og-image.png` ở phase 2. Slug Topic không chứa dấu chấm nên không thể trùng tên file.
