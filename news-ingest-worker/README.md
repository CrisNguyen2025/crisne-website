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

## Chạy test

```bash
cd news-ingest-worker
.venv/bin/python -m pytest -q
```
