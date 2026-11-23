#!/usr/bin/env sh
# Runs a local news-ingest-worker that claims PRODUCTION jobs (fallback when the deployed worker is down).
#
#   yarn news:worker:prod
#
# Production values live in news-ingest-worker/.env.prod (gitignored by `.env*`), never in .env:
#   NEXTJS_API_BASE_URL=https://crisne.blog   # no trailing slash
#   ADMIN_API_KEY=<same value as ADMIN_API_KEY on Vercel>
# LLM keys (GEMINI_API_KEY, GROQ_API_KEY, ...) still come from news-ingest-worker/.env.
# Port 8002 keeps it apart from the dev worker on 8001, which keeps pointing at local Next.js.
set -eu

cd "$(dirname "$0")/../news-ingest-worker"

ENV_FILE=".env.prod"
if [ ! -f "$ENV_FILE" ]; then
  echo "Thiếu news-ingest-worker/$ENV_FILE. Tạo file với 2 dòng:" >&2
  echo "  NEXTJS_API_BASE_URL=https://crisne.blog" >&2
  echo "  ADMIN_API_KEY=<giá trị ADMIN_API_KEY trên Vercel>" >&2
  exit 1
fi

set -a
. "./$ENV_FILE"
set +a

if [ -z "${NEXTJS_API_BASE_URL:-}" ] || [ -z "${ADMIN_API_KEY:-}" ]; then
  echo "$ENV_FILE phải có cả NEXTJS_API_BASE_URL và ADMIN_API_KEY." >&2
  exit 1
fi

case "$NEXTJS_API_BASE_URL" in
  https://localhost* | https://127.0.0.1* | http://*)
    echo "NEXTJS_API_BASE_URL phải là URL production https (đang là $NEXTJS_API_BASE_URL)." >&2
    exit 1
    ;;
  https://*) ;;
  *)
    echo "NEXTJS_API_BASE_URL không hợp lệ: $NEXTJS_API_BASE_URL" >&2
    exit 1
    ;;
esac

echo "news-worker (prod fallback) -> $NEXTJS_API_BASE_URL, port 8002"
exec .venv/bin/uvicorn news_worker.server:app --port 8002
