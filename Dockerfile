# ==============================================================
# ExamForge AI — Single-container Dockerfile for Coolify
# Runs: FastAPI backend + Celery worker + Next.js frontend
# via supervisord
# ==============================================================

# ---- Stage 1: Build Next.js frontend ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY frontend/ .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=
RUN npm run build

# ---- Stage 2: Final runtime ----
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-vie \
    tesseract-ocr-eng \
    libmagic1 \
    curl \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    libcairo2 \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js runtime from builder stage
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node

# ---- Python backend ----
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# ---- Next.js frontend (standalone) ----
# Standalone output: .next/standalone/ contains server.js + node_modules + app structure
# We copy the ENTIRE standalone output to /app (preserving the directory structure)
COPY --from=frontend-builder /app/frontend/.next/standalone /app
# Static assets and public files
COPY --from=frontend-builder /app/frontend/public /app/frontend/public
COPY --from=frontend-builder /app/frontend/.next/static /app/frontend/.next/static

# ---- Supervisor config ----
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ---- Health check ----
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Coolify proxies to a single port — expose 3000 (frontend)
# Next.js rewrites /api/* to localhost:8000 internally
EXPOSE 3000

WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
