---
task_id: "TASK-tiktok-photo-post-001"
branch: "fix/tiktok-photo-post"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude" # agy bị Dev dừng sau 36s (chưa sửa code), Claude làm tiếp tại chỗ ngày 2026-11-28
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "news-ingest-worker/news_worker/extractors/pipeline.py"
    - "news-ingest-worker/news_worker/extractors/tiktok.py"
    - "news-ingest-worker/news_worker/extractors/media.py"
    - "news-ingest-worker/news_worker/config.py"
    - "news-ingest-worker/tests/test_pipeline.py"
    - "news-ingest-worker/tests/test_tiktok.py"
    - "news-ingest-worker/tests/test_media.py"
    - "news-ingest-worker/.env.example"
    - "docs/DEPLOY_ENV.md"
    - "tests/manual/news-inbox.md"
  continues_dirty: []
  read_only_references:
    - "news-ingest-worker/news_worker/ssrf.py"
    - "news-ingest-worker/news_worker/schemas.py"
    - "news-ingest-worker/news_worker/processor.py"
    - "lib/news/ingest.ts"
    - "lib/news/url-guard.ts"
    - "docs/adr/**"
  strictly_forbidden:
    - "news-ingest-worker/news_worker/summarizer.py" # Dev đang sửa dở, không thuộc task này
    - "news-ingest-worker/news_worker/schemas.py"
    - "news-ingest-worker/requirements.txt"
    - "news-ingest-worker/pyproject.toml"
    - "lib/news/**"
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"

deploy_steps: [] # MAX_PHOTO_IMAGES có mặc định, không bắt buộc đặt trên host

fast_gate: ["worker_test_focus", "boundary_check"]
verification_gate:
  worker_test_focus: "cd news-ingest-worker && .venv/bin/python -m pytest -q tests/test_tiktok.py tests/test_pipeline.py tests/test_media.py"
  worker_test: "cd news-ingest-worker && .venv/bin/python -m pytest -q"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-tiktok-photo-post-001"
---

# TASK: Worker tóm tắt được bài ảnh TikTok (`/photo/`, slideshow)

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED 2026-11-28 trên nhánh `fix/tiktok-photo-post` (đã lên `main` @ `f337ba1`, nhánh đã xoá). Đủ 7 bước, gate pass, chạy thật trên link gốc ra `description` và lấy được 10 ảnh. Còn: chạy manual `N15` (đặc biệt `forceDeep`, vì Gemini Vision trên ảnh thật chưa gọi); ruff chưa chạy được vì máy chưa cài.

## 1. Context & Architectural Intent

- **Goal**: Link bài ảnh TikTok (dạng `https://www.tiktok.com/@<user>/photo/<id>`, kể cả bài ảnh mở bằng link `/video/`) cho ra tóm tắt thay vì `metadata_only`. Thứ tự: caption đủ dài thì dùng caption; không đủ (hoặc `forceDeep`) thì đọc các ảnh slide bằng Gemini Vision.
- **Why**: Ngày 2026-11-28, job cho `https://tiktok.com/@trihuynh.dev2026/photo/7712881150922247445` ra `metadata_only`, kèm lỗi `Metadata/Whisper/Vision: ERROR: Unsupported URL`. Nguyên nhân: mẫu URL TikTok trong yt-dlp `2026.10.26` chỉ nhận `/video/` (`yt_dlp/extractor/tiktok.py:709`), và pipeline coi mọi link TikTok là video.
- **Đã kiểm chứng tay (2026-11-28, cùng bài trên):**
  - oEmbed với link `/photo/` trả HTTP 400. Với link `/video/<cùng id>` thì trả 200.
  - yt-dlp với link `/video/<cùng id>` chạy được: có `title`, `description` dài 1051 ký tự, `duration` 184, và chỉ có một format `audio` mp3 (`vcodec: none`). Như vậy là bài ảnh có kèm nhạc, không có video để cắt frame, và yt-dlp không trả danh sách ảnh (chỉ có `thumbnails` là ảnh bìa).
  - Tải HTML trang `/video/<id>` (User-Agent trình duyệt) được thẻ `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">`. Trong JSON có `__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct.imagePost.images[]`, gồm 10 ảnh. Mỗi ảnh có `imageURL.urlList` (2 URL CDN `*.tiktokcdn.com`, ảnh `~tplv-photomode-image.jpeg`), `imageWidth: 1080`, `imageHeight: 1920`. Trang `/photo/<id>` thì **không** có `webapp.video-detail`.
  - Tải trực tiếp `urlList[0]` không cần cookie: HTTP 200, `image/jpeg`, khoảng 179KB.
- **Dependencies**:
  - Flow `FLOW_NEWS_INGEST_PIPELINE` (map `cris-code-intel`, mục `private-news`; `pipeline.py` và `tiktok.py` đã có trong map, task này không thêm module mới).
  - Chuỗi gọi: `news_worker/processor.py:32` → `pipeline.extract_content`. Không có caller nào khác ngoài test. GitNexus chưa index phần Python của worker; caller dò bằng grep. Risk: LOW.
  - `pipeline.py#extract_content`, `pipeline.py#_handle_metadata_error`, `pipeline.py#_extract_video_tiers`
  - `tiktok.py#fetch_tiktok_oembed`, `tiktok.py#resolve_tiktok_via_fallback_api`, `tiktok.py#format_blocked_error`
  - `media.py#_fetch_video_metadata_sync`, `media.py#_download_direct_media_sync`, `media.py#_extract_slides_vision_sync`
  - `ssrf.py#assert_public_url`, `ssrf.py#assert_public_url_async`
  - `lib/news/ingest.ts:177` (`reingestBlockedNewsItems` lọc `extractionError` chứa `[IP_BLOCKED]`)

## 2. Invariants & Rules

- **Không đổi `job.canonicalUrl`** và không sửa phía Next.js. Link `/photo/` vẫn là URL gốc để dedupe; link `/video/` chỉ là URL tra cứu nội bộ của worker.
- **Không thêm giá trị `ExtractionMethod` mới** (Zod phía Next cũng đang dùng enum này). Dùng lại `description`, `vision`, `metadata_only`.
- Mọi request ra ngoài (trang TikTok, ảnh CDN, API dự phòng) phải qua kiểm SSRF (`assert_public_url*`), có timeout, có giới hạn dung lượng. Có `media_proxy_url` thì đi qua proxy giống `_download_direct_media_sync`. Redirect phải kiểm SSRF từng bước, không bật `follow_redirects=True` mù.
- Với bài ảnh, **không chạy** Whisper và Vision cắt frame video (nhạc nền không có nội dung, và cũng không có video để cắt).
- Khi lỗi gốc là chặn IP hoặc geo (`tiktok.is_ip_or_geo_block_error`), `extractionError` phải giữ tiền tố `[IP_BLOCKED]` để `reingestBlockedNewsItems` còn bắt được.
- Lỗi mới của bài ảnh dùng tiền tố `[PHOTO_POST]`, viết tiếng Việt, giống các lỗi khác trong worker.
- Ruff của worker có `C901` với `max-complexity = 10` (`news-ingest-worker/pyproject.toml`). Logic bài ảnh đặt trong hàm riêng, không nhồi vào `extract_content`.
- Behavior của link TikTok `/video/` thật và của YouTube giữ nguyên. 36 test hiện có phải pass (mốc ngày 2026-11-28 trên `main` @ `e6b94f9`: `36 passed`).
- Test không gọi mạng thật. HTML fixture là chuỗi JSON tối thiểu tự dựng trong test, không commit HTML thật của TikTok.
- Ngoài phạm vi: phía Next.js (`lib/news/**`, UI); tự chạy lại các job đã fail; nâng cấp yt-dlp; bài ảnh trên nền tảng khác; ghép ảnh thành video.

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1: config** (`news-ingest-worker/news_worker/config.py`). Thêm `max_photo_images: int = 10`, là số ảnh tối đa gửi Vision cho một bài ảnh; tách khỏi `max_vision_frames` vì bài ảnh thường có 6–20 slide. Ghi `MAX_PHOTO_IMAGES=10` vào `news-ingest-worker/.env.example` (ngay dưới `MAX_VISION_FRAMES`) và thêm một dòng vào bảng worker trong `docs/DEPLOY_ENV.md` (cạnh `MAX_VISION_FRAMES`, mức 🟡, "Mặc định `10`").

- [x] **Step 2: nhận diện và tra cứu** (`news-ingest-worker/news_worker/extractors/tiktok.py`)
  - `photo_url_to_video_url(url: str) -> str | None`: path dạng `/@<user>/photo/<id>` (host `tiktok.com`, `www.tiktok.com` hoặc `m.tiktok.com`; `<id>` toàn số) thì trả `https://www.tiktok.com/@<user>/video/<id>`, bỏ query. Không khớp thì trả `None`.
  - `parse_photo_image_urls(html: str, limit: int) -> list[str]`: hàm thuần. Tìm thẻ `script` có `id="__UNIVERSAL_DATA_FOR_REHYDRATION__"`, `json.loads` nội dung, đi theo đường `__DEFAULT_SCOPE__` → `webapp.video-detail` → `itemInfo` → `itemStruct` → `imagePost` → `images[]` → `imageURL.urlList[0]`. Giữ đúng thứ tự slide, cắt theo `limit`. Gặp mọi dạng thiếu hoặc sai kiểu thì trả `[]`, không raise.
  - `async fetch_tiktok_photo_image_urls(video_url: str, settings: Settings) -> list[str]`: GET trang bằng `httpx.AsyncClient` (timeout 15s, header `User-Agent` trình duyệt desktop và `Accept-Language`, `proxy=settings.media_proxy_url` nếu có). Kiểm SSRF trước khi gọi, xử lý tối đa 3 redirect và kiểm SSRF từng bước, giới hạn body 5MB. Gọi `parse_photo_image_urls(..., settings.max_photo_images)`, sau đó kiểm SSRF từng URL ảnh và bỏ URL không đạt. Lỗi thì trả `[]`.
  - `async resolve_tiktok_photos_via_fallback_api(url: str, settings: Settings) -> list[str]`: dùng chung endpoint và key với `resolve_tiktok_via_fallback_api`. Response có `status == "picker"` thì lấy `picker[].url` của các phần tử `type == "photo"` (giữ thứ tự, cắt theo `max_photo_images`, kiểm SSRF từng URL). Tách phần gửi request và đọc JSON ra helper dùng chung, ví dụ `_post_fallback_api(url, settings) -> dict | None`. `resolve_tiktok_via_fallback_api` phải giữ nguyên chữ ký và behavior (vẫn từ chối `picker`), để test hiện có trong `tests/test_tiktok.py` vẫn pass.

- [x] **Step 3: metadata và Vision cho ảnh** (`news-ingest-worker/news_worker/extractors/media.py`)
  - `_fetch_video_metadata_sync`: thêm khoá `"is_audio_only": bool`, đúng khi `info["formats"]` không rỗng và mọi format có `vcodec` là `"none"` hoặc rỗng. Các khoá cũ giữ nguyên.
  - Tách phần gọi Gemini (vòng lặp qua `get_gemini_keys`, `genai.Client`, `generate_content`) trong `_extract_slides_vision_sync` ra `_ask_gemini_vision(prompt: str, images: list[tuple[bytes, str]], settings: Settings) -> str`. `_extract_slides_vision_sync` gọi lại hàm này, prompt và behavior giữ nguyên.
  - `_extract_photo_post_vision_sync(image_urls: list[str], tmp_dir: str, settings: Settings) -> str`: báo lỗi khi thiếu key Gemini. Tải từng ảnh bằng `_download_direct_media_sync` (dùng lại kiểm SSRF, redirect, giới hạn dung lượng, proxy). Xác định mime theo magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF....WEBP`), ảnh không nhận ra thì bỏ. Ảnh tải lỗi thì bỏ qua ảnh đó, không bỏ cả bài. Không có ảnh nào dùng được thì raise `RuntimeError("[PHOTO_POST] Không tải được ảnh nào của bài ảnh TikTok.")`. Prompt nói rõ đây là các slide của một bài ảnh theo đúng thứ tự, yêu cầu trích xuất trung thực chữ, số liệu, code theo từng slide ("Ảnh 1: ...") và không bịa thêm.
  - Wrapper async `extract_photo_post_with_vision(image_urls, tmp_dir, settings) -> str` dùng `asyncio.to_thread`, giống `extract_slides_with_vision`.

- [x] **Step 4: luồng pipeline** (`news-ingest-worker/news_worker/extractors/pipeline.py`)
  - Trong `extract_content`, nhánh `tiktok`: tính `photo_video_url = tiktok.photo_url_to_video_url(url)` và `lookup_url = photo_video_url or url`. Dùng `lookup_url` cho `fetch_tiktok_oembed` và `media.fetch_video_metadata`.
  - `is_photo_post = photo_video_url is not None or meta.get("is_audio_only") is True` (chỉ với `platform == "tiktok"`).
  - Metadata lỗi mà link là `/photo/`: ghi lỗi vào `errors`, sau đó vẫn chạy tầng ảnh. Không return sớm theo nhánh `is_permanent_media_block_error`, vì trang HTML hoặc API dự phòng vẫn có thể lấy được ảnh. Link không phải `/photo/` thì giữ nguyên luồng `_handle_metadata_error` hiện tại.
  - Tầng caption giữ nguyên: không `forceDeep` và `description` qua `has_meaningful_text(..., min_description_chars)` thì trả `method="description"`. Bài trong mục 1 dừng ở đây (1051 ký tự).
  - Hàm mới `_extract_tiktok_photo_post(...) -> ExtractionResult` thay cho `_extract_video_tiers` khi `is_photo_post`:
    1. `image_urls = await tiktok.fetch_tiktok_photo_image_urls(lookup_url, settings)`. Rỗng thì gọi `await tiktok.resolve_tiktok_photos_via_fallback_api(url, settings)`.
    2. Vẫn rỗng thì trả `metadata_only` với lỗi `[PHOTO_POST] Không lấy được danh sách ảnh của bài ảnh TikTok.`, nối thêm `errors` trước đó. Nếu một lỗi trong `errors` là chặn IP hoặc geo thì toàn bộ `error` phải bắt đầu bằng `[IP_BLOCKED]` (dùng `tiktok.format_blocked_error`).
    3. Gọi `media.extract_photo_post_with_vision` trong `tempfile.mkdtemp` (dọn bằng `shutil.rmtree` trong `finally`, giống `_extract_video_tiers`), dùng `asyncio.wait_for(..., MEDIA_TIER_TIMEOUT_SECONDS)`.
    4. Vision có chữ thì trả `method="vision"`, `text` = caption (`description`, nếu không có thì `title`; bỏ trống nếu không có) + `"\n\n"` + chữ Vision đọc được. Vision lỗi hoặc rỗng thì trả `metadata_only` và ghi lỗi `Vision: ...`.
  - Không gọi `media.transcribe_audio_with_whisper` hay `media.extract_slides_with_vision` cho bài ảnh.

- [x] **Step 5: test tự động** (`news-ingest-worker/tests/`; mock mọi I/O mạng bằng `monkeypatch` và `AsyncMock`, theo kiểu `tests/test_pipeline.py`)
  - `test_tiktok.py`:
    - `photo_url_to_video_url`: `/photo/` có query, host `tiktok.com` / `www.` / `m.`; link `/video/` và link `/discover` trả `None`.
    - `parse_photo_image_urls`: HTML tối thiểu tự dựng có 3 ảnh thì trả đúng thứ tự; `limit=2` thì cắt còn 2; thiếu `webapp.video-detail`, JSON hỏng, `images` sai kiểu thì đều trả `[]`.
    - `resolve_tiktok_photos_via_fallback_api`: payload `picker` có 1 photo và 1 video thì chỉ lấy photo; chưa cấu hình endpoint thì trả `[]`.
  - `test_media.py` (file mới): `_fetch_video_metadata_sync` trả `is_audio_only` đúng/sai (mock `yt_dlp.YoutubeDL` và `assert_public_url`); nhận mime theo magic bytes; `_extract_photo_post_vision_sync` bỏ ảnh tải lỗi, raise `[PHOTO_POST]` khi không còn ảnh nào (mock `_download_direct_media_sync` và `_ask_gemini_vision`).
  - `test_pipeline.py`:
    - (a) Link `/photo/`, caption ≥ 300 ký tự: trả `description`; `fetch_video_metadata` và `fetch_tiktok_oembed` được gọi với URL `/video/`; Whisper và Vision không bị gọi.
    - (b) Link `/photo/`, caption ngắn: trả `vision`, `text` có caption và chữ Vision; Whisper và Vision cắt frame không bị gọi.
    - (c) Link `/photo/` với `forceDeep=True` và caption dài: vẫn đi tầng ảnh.
    - (d) Link `/video/` mà metadata `is_audio_only=True`: đi tầng ảnh.
    - (e) Trang không có ảnh nhưng API dự phòng trả picker: trả `vision`.
    - (f) Không lấy được ảnh từ nguồn nào: trả `metadata_only`, lỗi chứa `[PHOTO_POST]`.
    - (g) Metadata lỗi kiểu `Your IP address is blocked`, link `/photo/`, không lấy được ảnh: lỗi bắt đầu bằng `[IP_BLOCKED]`.
    - (h) Link TikTok `/video/` thường (`is_audio_only=False`): luồng Whisper và Vision cũ không đổi.

- [x] **Step 6: kịch bản test thủ công** (`tests/manual/news-inbox.md`). Thêm case `N15`: thêm link `https://www.tiktok.com/@trihuynh.dev2026/photo/7712881150922247445`. Kỳ vọng: job xong với `extractionMethod` là `description` (caption 1051 ký tự), có tiêu đề, TL;DR, ý chính, tag. Bật `forceDeep` thì ra `vision`, nội dung có chữ đọc từ slide. Để trạng thái chưa chạy, không tự điền Pass; Dev chạy thật sau khi merge.

- [x] **Step 7: gate**. Chạy đủ `verification_gate`, ghi kết quả vào mục 4. Nếu `doctor_delta` báo finding mới thì sửa code, không tự `--update-baseline`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `Worker Test Focus`: PASSED
- [x] `Worker Test`: PASSED (59 passed, trước task là 36)
- [x] `Intel Status`: PASSED
- [x] `Doctor Delta`: PASSED (PY-RUFF/PY-MYPY bị skip vì chưa cài ruff/mypy)
- [x] `Boundary Check`: PASSED (changed=11, violations=0)
- [x] `agents:sync --check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-tiktok-photo-post-001/result.json`
- **Modified Files**:
  - `news-ingest-worker/news_worker/config.py`, `.env.example`, `docs/DEPLOY_ENV.md`: `max_photo_images` / `MAX_PHOTO_IMAGES`
  - `news-ingest-worker/news_worker/extractors/tiktok.py`: `photo_url_to_video_url`, `parse_photo_image_urls`, `fetch_tiktok_photo_image_urls`, `resolve_tiktok_photos_via_fallback_api`, tách `_post_fallback_api`
  - `news-ingest-worker/news_worker/extractors/media.py`: `is_audio_only`, `_ask_gemini_vision`, `extract_photo_post_with_vision`
  - `news-ingest-worker/news_worker/extractors/pipeline.py`: `_MediaInfo`, `_load_media_info`, `_extract_tiktok_photo_post`
  - `news-ingest-worker/tests/test_tiktok.py`, `test_pipeline.py`, `test_media.py` (mới), `tests/manual/news-inbox.md` (N15)
- **Chạy thật** (2026-11-28, link gốc, `forceDeep=false`): `method=description`, text 1051 ký tự, `fetch_tiktok_photo_image_urls` trả 10 ảnh, ảnh đầu tải về là JPEG 178771 byte.
- **Bài học**: yt-dlp không nhận link `/photo/` nhưng nhận `/video/<cùng id>`; trang `/photo/` không có `webapp.video-detail`, trang `/video/` thì có `imagePost`. GitNexus chưa index Python của worker, impact phải dò bằng grep.
