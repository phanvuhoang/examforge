# ---- Stage 1: Build Next.js frontend ----
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps
COPY frontend/ .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=
RUN npm run build

# ---- Stage 2: Final runtime ----
FROM python:3.12-slim

# Install system dependencies + Node.js 20 (from NodeSource for proper version)
RUN apt-get update && apt-get install -y --no-install-recommends     build-essential     libpq-dev     tesseract-ocr     tesseract-ocr-vie     tesseract-ocr-eng     libmagic1     curl     libpango-1.0-0     libpangocairo-1.0-0     libgdk-pixbuf-2.0-0     libffi-dev     libcairo2     supervisor     && curl -fsSL https://deb.nodesource.com/setup_20.x | bash -     && apt-get install -y nodejs     && rm -rf /var/lib/apt/lists/*

# ---- Python backend ----
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# ---- Next.js frontend (standalone) ----
WORKDIR /app
# Copy the standalone output (includes server.js + minimal node_modules)
COPY --from=frontend-builder /app/frontend/.next/standalone/ /app/
# Overlay public assets and static chunks
COPY --from=frontend-builder /app/frontend/public /app/public
COPY --from=frontend-builder /app/frontend/.next/static /app/.next/static

# Copy URL-decode patch wrapper
COPY frontend/server-custom.js /app/server-custom.js

# ---- Supervisor config ----
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 3000

WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
