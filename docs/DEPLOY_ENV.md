# Deploy ENV — Vercel (Next.js) & Render (RAG service)

> Ký hiệu: 🔴 bắt buộc · 🟡 tuỳ chọn · ⛔ không được có trên Production
> Giá trị secret không ghi ở đây. Các cặp 🔗 phải **trùng giá trị** giữa 2 server.

## Các cặp phải khớp giữa 2 server

| Vercel | Render | Ghi chú |
|---|---|---|
| `RAG_INTERNAL_KEY` | `INTERNAL_API_KEY` | Sinh: `openssl rand -base64 32`. Lệch → proxy nhận 401 |
| `ADMIN_API_KEY` | `ADMIN_API_KEY` | Lệch → owner ghi qua Roadmap Assistant bị 401 |
| `RAG_SERVICE_URL` = URL Render | `NEXTJS_API_BASE_URL` = `https://crisne.blog` | Không có `/` ở cuối |

---

## Vercel — Next.js (crisne.blog)

Đổi ENV xong phải **Redeploy** mới có hiệu lực.

### Database
| ENV | | Ghi chú |
|---|---|---|
| `TURSO_DATABASE_URL` | 🔴 | `libsql://...` |
| `TURSO_AUTH_TOKEN` | 🔴 | |
| `DATABASE_URL` | 🔴 | Prisma cần lúc build (`prisma generate`) |

### Auth
| ENV | | Ghi chú |
|---|---|---|
| `AUTH_SECRET` | 🔴 | `npx auth secret` |
| `AUTH_GOOGLE_ID` | 🔴 | Redirect URI: `https://crisne.blog/api/auth/callback/google` (login) và `https://crisne.blog/api/v1/connectors/gmail/callback` (Gmail Connector) |
| `AUTH_GOOGLE_SECRET` | 🔴 | Dùng chung cho NextAuth login và Abot Gmail Connector |
| `AUTH_OWNER_EMAILS` | 🔴 | Phân tách bằng dấu phẩy. Trống = không ai ghi được |
| `ADMIN_API_KEY` | 🔴 🔗 | Chrome extension, script, RAG service |
| `CONNECTOR_ENCRYPTION_KEY` | 🟡 | 32-byte hex (64 ký tự) hoặc base64 để mã hoá OAuth token của `OwnerConnector` bằng AES-256-GCM (bắt buộc khi bật Gmail Connector) |

### Roadmap Assistant (proxy tới Render)
| ENV | | Ghi chú |
|---|---|---|
| `RAG_SERVICE_URL` | 🔴 🔗 | URL service Render |
| `RAG_INTERNAL_KEY` | 🔴 🔗 | Thiếu → proxy trả 503 |

### Private News Reader (`/news`, `/api/ingest`)
| ENV | | Ghi chú |
|---|---|---|
| `NEWS_WORKER_URL` | 🟡 🔗 | URL service `news-ingest-worker`. Thiếu = không gọi wake, worker tự poll |
| `NEWS_WORKER_INTERNAL_KEY` | 🟡 🔗 | Phải khớp `INTERNAL_API_KEY` của `news-ingest-worker` |
| `NEWS_ALLOWED_DOMAINS` | 🟡 | Domain whitelist bổ sung (phân tách dấu phẩy) ngoài danh sách mặc định |
| `CRON_SECRET` | 🟡 | Secret cho lịch cron gọi `GET` hoặc `POST /api/news/cron` (`Authorization: Bearer` hoặc `x-cron-secret`) |
| `NEWS_CRON_MAX_ITEMS_PER_SOURCE` | 🟡 | Số bài tối đa lấy mỗi nguồn khi cron không truyền `maxItemsPerSource` (`1..30`, mặc định `10`) |

### AI — Cris AI (`/api/chat`)
| ENV | | Ghi chú |
|---|---|---|
| `GEMINI_API_KEY` | 🔴 | Embeddings luôn dùng Gemini |
| `LLM_PROVIDER` | 🟡 | `groq` để chat bằng Groq; khác/trống = Gemini |
| `GROQ_API_KEY` | 🟡 | **Một** key. Next.js không đọc `GROQ_API_KEYS`. Model cố định trong `lib/ai/groq.ts` |
| `WORKFLOW_DAILY_LLM_LIMIT` | 🟡 | Giới hạn LLM/ngày cho workflow |

### Langfuse
| ENV | | Ghi chú |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | 🟡 | Trống = tắt tracing |
| `LANGFUSE_SECRET_KEY` | 🟡 | |
| `LANGFUSE_BASE_URL` | 🟡 | `https://jp.cloud.langfuse.com` (theo region project) |
| `LANGFUSE_TRACING_ENVIRONMENT` | 🟡 | Mặc định theo `NODE_ENV` |
| `LANGFUSE_RELEASE` | 🟡 | Mặc định `VERCEL_GIT_COMMIT_SHA` |
| `LANGFUSE_ANNOTATION_QUEUE_ID` | 🟡 | Queue review 👎 (`yarn setup:langfuse-review`) |

### Storage — Cloudflare R2
Thiếu → file upload ghi vào `.data/`, **bị mất** trên Vercel.
| ENV | | |
|---|---|---|
| `R2_ACCOUNT_ID` | 🔴 | |
| `R2_ACCESS_KEY_ID` | 🔴 | |
| `R2_SECRET_ACCESS_KEY` | 🔴 | |
| `R2_BUCKET_NAME` | 🔴 | |
| `R2_PUBLIC_URL` | 🔴 | |

### Analytics & Client
| ENV | | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 🟡 | Tuỳ chọn; để trống để gọi cùng domain `/api/...` |
| `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID` | 🟡 | |
| `NEXT_PUBLIC_ZALO_URL` | 🟡 | |

### ⛔ Không được có trên Production
| ENV | Lý do |
|---|---|
| `NEXT_PUBLIC_RAG_SERVICE_URL` | Biến cũ, lộ URL service ra client |
| `NEXT_PUBLIC_ADMIN_KEY` | Biến cũ, lộ admin key ra client |
| `DEV_OWNER_BYPASS` | Cho mọi request quyền Owner khi `NODE_ENV=development`; vô hiệu trên prod nhưng không nên để lại |

---

## Render — RAG service (`roadmap-rag-assistant`)

Cấu hình service: Language **Docker** · Root Directory `roadmap-rag-assistant` · Dockerfile `./Dockerfile` · Region Singapore · Health Check `/health`.
Không set `PORT` (Render tự cấp). Lưu ENV → Render tự redeploy.

### Access
| ENV | | Ghi chú |
|---|---|---|
| `INTERNAL_API_KEY` | 🔴 🔗 | Trống = mọi request (trừ `/health`) bị 401 |
| `ADMIN_API_KEY` | 🔴 🔗 | Gửi qua `x-admin-key` khi owner ghi |
| `NEXTJS_API_BASE_URL` | 🔴 🔗 | `https://crisne.blog`. Mặc định `127.0.0.1:3334` |
| `CORS_ORIGINS` | 🟡 | Để trống (browser đi qua proxy Next.js) |

### LLM
| ENV | | Ghi chú |
|---|---|---|
| `GEMINI_API_KEY` | 🔴 | Embeddings + fallback; luôn giữ kể cả khi dùng Groq (`GOOGLE_API_KEY` cũng được đọc làm fallback) |
| `GEMINI_API_KEYS` | 🟡 | `k1,k2` — xoay vòng khi bị rate limit |
| `LLM_PROVIDER` | 🟡 | `google_genai` (mặc định) \| `groq` |
| `LLM_MODEL` | 🟡 | Mặc định `gemini-flash-latest`. **Phải đổi sang model Groq** khi `LLM_PROVIDER=groq` |
| `GROQ_API_KEY` / `GROQ_API_KEYS` | 🟡 | `GROQ_API_KEYS=k1,k2` — xoay vòng key |
| `LLM_FALLBACK_PROVIDER` | 🟡 | Provider khi mọi key chính bị rate limit. Trống = không fallback |
| `LLM_FALLBACK_MODEL` | 🟡 | Mặc định `gemini-flash-latest`. **Phải đổi** nếu fallback là `groq` |
| `LLM_MODEL_ROUTER` | 🟡 | Model nhỏ cho routing/verify (vd `llama-3.1-8b-instant`) |
| `LLM_ROUTER_REASONING_EFFORT` | 🟡 | Mặc định `low` (chỉ với gpt-oss) |
| `LLM_CONTEXT_WINDOW` | 🟡 | Tuỳ chọn, số token context của `LLM_MODEL`; `0` = tự tra theo tên model |

**Preset Gemini chính (mặc định):** chỉ cần `GEMINI_API_KEY`.

**Preset Groq chính, Gemini fallback:**
```
LLM_PROVIDER=groq
LLM_MODEL=llama-3.3-70b-versatile
GROQ_API_KEYS=k1,k2
LLM_FALLBACK_PROVIDER=google_genai
LLM_FALLBACK_MODEL=gemini-flash-latest
GEMINI_API_KEY=...
```
Kiểm tra tên model Groq trên console.groq.com trước khi set.

### RAG tuning
| ENV | | Ghi chú |
|---|---|---|
| `RAG_QUERY_TRANSFORM` | 🟡 | Mặc định `true` |
| `RAG_RERANK` | 🟡 | Mặc định `false` (+1 LLM call/câu) |
| `RAG_RERANK_GAP` | 🟡 | Mặc định `auto` |
| `RAG_SEMANTIC_GROUNDING` | 🟡 | Mặc định `false` (+1 LLM call/câu) |
| `RAG_HISTORY_DB` | 🟡 | Trống (nên để trống trên Render Free): lịch sử Thread của Owner lưu ở Turso qua Next.js (ADR-0012, cần `ADMIN_API_KEY` và đã chạy `yarn db:turso:init`), Thread của Visitor chỉ trong RAM. Chỉ set khi có Persistent Disk |
| `RAG_ADAPTER_MODE` | 🟡 | Giữ mặc định `http` |
| `SQLITE_DB_PATH` | 🟡 | Đường dẫn SQLite khi `RAG_ADAPTER_MODE=sqlite` (mặc định `../prisma/dev.db`) |
| `EMBEDDING_CACHE_PATH` | 🟡 | Trống: cache embedding nằm trong image, mất sau mỗi lần deploy (mọi đoạn bài phải embed lại). Có ổ đĩa bền thì trỏ vào đó, ví dụ `/data/embedding_cache.json` (ADR-0006) |
| `RAG_TYPING_DELAY_MS` | 🟡 | Độ trễ stream từng từ (ms), mặc định `5` |

`ADMIN_API_KEY` của service này giờ cũng là điều kiện để **đọc** roadmap: `full-export`, `GET /api/v1/roadmaps` và `index-version` chỉ trả dữ liệu cho Owner hoặc `x-admin-key` đúng (ADR-0018). Thiếu hoặc lệch thì Abot không index được gì.

### Langfuse
| ENV | | Ghi chú |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | 🟡 | Cùng project với Next.js |
| `LANGFUSE_BASE_URL` | 🟡 | `https://jp.cloud.langfuse.com` |
| `LANGFUSE_TRACING_ENVIRONMENT` | 🟡 | `production` |
| `LANGFUSE_RELEASE` | 🟡 | |
| `LANGFUSE_PROMPT_SYNC` | 🟡 | Mặc định `false`. Bật `true` để đồng bộ prompt theo label từ Langfuse (fail-open về bản local) |
| `LANGFUSE_PROMPT_LABEL` | 🟡 | Label prompt trên Langfuse (mặc định `production`) |

---

## Kiểm tra sau khi đổi ENV

1. Render Logs có `🤖 Agent initialized: provider=...` đúng provider, không có `Using offline mode`.
2. `curl -i https://<rag>/health` → 200; `curl -i -X POST https://<rag>/chat/stream` → 401.
3. `curl -i https://crisne.blog/api/roadmap-assistant/health` → 200 (503 = thiếu `RAG_SERVICE_URL`/`RAG_INTERNAL_KEY` hoặc chưa redeploy).
4. Visitor chat được, "xóa topic X ngay" bị từ chối; owner tạo/sửa/xoá được.

## GitHub Actions secrets
| Secret | | |
|---|---|---|
| `GEMINI_API_KEY` | 🟡 | Job `rag-eval` |

---

## News Ingest Worker (`news-ingest-worker`)

Cấu hình service tách riêng: Language **Docker** · Root Directory `news-ingest-worker` · Dockerfile `./Dockerfile` · Health Check `/health`.

| ENV | | Ghi chú |
|---|---|---|
| `NEXTJS_API_BASE_URL` | 🔴 🔗 | `https://crisne.blog` (local: `http://127.0.0.1:3334`) |
| `ADMIN_API_KEY` | 🔴 🔗 | Phải khớp `ADMIN_API_KEY` trên Next.js để claim & complete job |
| `INTERNAL_API_KEY` | 🔴 🔗 | Phải khớp `NEWS_WORKER_INTERNAL_KEY` trên Next.js để nhận `/internal/wake` |
| `GEMINI_API_KEY` | 🔴 | Tóm tắt JSON và Vision đọc slide/frame |
| `GEMINI_API_KEYS` | 🟡 | `k1,k2` — xoay vòng key khi gặp rate limit (429) |
| `GROQ_API_KEY` | 🟡 | Groq Whisper API (`whisper-large-v3-turbo`) + LLM fallback |
| `GROQ_API_KEYS` | 🟡 | `k1,k2` — xoay vòng key Groq khi gặp rate limit |
| `LLM_MODEL` | 🟡 | Mặc định `gemini-flash-latest` |
| `VISION_MODEL` | 🟡 | Mặc định `gemini-flash-latest` |
| `WHISPER_MODEL` | 🟡 | Mặc định `whisper-large-v3-turbo` |
| `GROQ_LLM_MODEL` | 🟡 | Mặc định `openai/gpt-oss-120b` |
| `POLL_INTERVAL_SECONDS` | 🟡 | Mặc định `10` |
| `WORKER_CONCURRENCY` | 🟡 | Số job xử lý song song (`1..5`, mặc định `2`) |
| `MAX_VIDEO_DURATION_SECONDS` | 🟡 | Mặc định `1200` (20 phút) |
| `MAX_VISION_FRAMES` | 🟡 | Mặc định `6` |
| `MEDIA_PROXY_URL` | 🟡 | Proxy HTTP/SOCKS tùy chọn chỉ dùng cho `yt-dlp` tải media |
| `TIKTOK_FALLBACK_API_URL` | 🟡 | Endpoint Cobalt-compatible tùy chọn khi `yt-dlp` bị chặn IP trên TikTok |
| `TIKTOK_FALLBACK_API_KEY` | 🟡 | API key tùy chọn cho `TIKTOK_FALLBACK_API_URL` (`Authorization: Api-Key ...`) |
| `MIN_DESCRIPTION_CHARS` | 🟡 | Độ dài tối thiểu phần mô tả video trước khi bỏ qua chuyển sang transcript (mặc định `300`) |
| `MIN_TRANSCRIPT_WORDS` | 🟡 | Số từ tối thiểu của transcript (mặc định `40`) |

> Lưu ý nguồn Cron RSS: `vercel.json` đã cấu hình sẵn Vercel Cron chạy `GET /api/news/cron` hằng ngày lúc `04:00 UTC` (11:00 VN, khớp `lib/news/cron-schedule.ts`). Nếu cần quét dày hơn, có thể bổ sung GitHub Actions hoặc cron ngoài gọi `POST /api/news/cron` kèm `Authorization: Bearer <CRON_SECRET>`. Nhớ chạy `yarn db:news-source-cache --apply` lên Turso nếu nâng cấp từ bảng `NewsSource` cũ.
