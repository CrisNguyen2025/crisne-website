FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8001

EXPOSE 8001

CMD ["sh", "-c", "uvicorn news_worker.server:app --host 0.0.0.0 --port ${PORT}"]
