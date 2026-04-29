# ── Stage 1: build React frontend ────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2: run Python backend ───────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Dipendenze Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Codice backend
COPY backend/ ./backend/

# Frontend buildato dallo stage 1
COPY --from=frontend /app/dist ./dist

EXPOSE 8000
CMD ["sh", "-c", "cd backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
