# ══════════════════════════════════════════════════════════════════════════════
# MwalimuSmart Web — Multi-stage Dockerfile
# Stage 1: Build React frontend
# Stage 2: Python AI layer
# Stage 3: Final Node.js + Python production image
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Outputs to /app/backend/public (vite outDir)
RUN mkdir -p ../backend/public && npm run build

# ── Stage 2: Python dependencies ─────────────────────────────────────────────
FROM python:3.12-slim AS python-deps
WORKDIR /app

# System deps for Manim, psycopg2, PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    ffmpeg texlive-latex-base texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

# Install Python runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip libpq5 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtualenv from python-deps
COPY --from=python-deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=python-deps /usr/local/bin/python3    /usr/local/bin/python3

# Copy backend
COPY backend/ ./backend/
COPY --from=frontend-build /app/backend/public ./backend/public/

# Install Node deps
WORKDIR /app/backend
RUN npm ci --omit=dev

# Create renders directory
RUN mkdir -p /app/renders

# Non-root user
RUN useradd -r -s /bin/false mwalimu && chown -R mwalimu /app /app/renders
USER mwalimu

WORKDIR /app/backend
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "api/server.js"]
