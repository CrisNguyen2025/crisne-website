# Multi-stage Dockerfile for Roadmap RAG Assistant (FastAPI)
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Set Python path to include current directory and SDKs
ENV PYTHONPATH=/app:/app/sdk/python
ENV PORT=8000

EXPOSE 8000

# Run uvicorn server with dynamic port support for cloud providers (Railway, Render, Fly.io, Cloud Run)
CMD ["sh", "-c", "uvicorn rag_service.api.server:app --host 0.0.0.0 --port ${PORT}"]
