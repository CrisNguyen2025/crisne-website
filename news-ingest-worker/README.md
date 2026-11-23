# News Ingest Worker (`news-ingest-worker`)

Standalone Python service xử lý hàng đợi `IngestJob` cho `/news` theo pipeline 3 tầng rẻ → đắt (description/captions → Groq Whisper → Gemini Vision keyframes) và tóm tắt có cấu trúc (JSON, không dùng agent hay tool).

## Chạy local

```bash
cd news-ingest-worker
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Cần cài sẵn ffmpeg trên máy (brew install ffmpeg)
.venv/bin/uvicorn news_worker.server:app --reload --port 8001
```

Hoặc từ thư mục gốc repo:

```bash
yarn news:worker
```

## Worker local xử lý job production (fallback)

Khi worker đã deploy không chạy, có thể cho worker trên máy nhận job của production. Worker tự gọi `/api/news/jobs/claim` nên không cần mở port; job được nhận nguyên tử, chạy song song với worker production vẫn an toàn.

1. Tạo `news-ingest-worker/.env.prod` (đã gitignore), không sửa `.env`:

   ```bash
   NEXTJS_API_BASE_URL=https://crisne.blog
   ADMIN_API_KEY=<giá trị ADMIN_API_KEY trên Vercel>
   ```

2. Chạy từ thư mục gốc repo (port 8002, worker dev ở 8001 vẫn trỏ về local):

   ```bash
   yarn news:worker:prod
   ```

Lưu ý: không nhận được wake từ Vercel nên job được nhận trong tối đa `POLL_INTERVAL_SECONDS` (mặc định 10s); dùng khoá LLM trong `.env` của máy; kết quả ghi thẳng vào Turso production. Máy sleep giữa chừng thì job tự quay lại hàng đợi sau 10 phút (tính một lần thử).

## Chạy test

```bash
cd news-ingest-worker
.venv/bin/python -m pytest -q
```
