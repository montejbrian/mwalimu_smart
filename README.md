# MwalimuSmart Web

> CBC-aligned AI lesson platform for Kenyan schools — web version.
> Runs on any cloud host, VPS, or local server accessible via browser.

[![Node 22](https://img.shields.io/badge/Node-22-green)](https://nodejs.org)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue)](https://python.org)
[![React 18](https://img.shields.io/badge/React-18-61dafb)](https://react.dev)
[![Gemini 2.5 Flash](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4)](https://ai.google.dev)

---

## Current Project Status

The platform is feature-complete across all core pipeline phases (**P1–P5**) and web interface modules:

- **Unified Gemini AI Stack** — Migrated all LLM and embedding workflows to Google Gemini (`gemini-2.5-flash` for scripting, NLU, Q&A, and Manim codegen; `models/text-embedding-004` with 768-dim vectors for RAG).
- **Teacher & Student Role Support** — Dual-role login flow supporting password-authenticated teachers and frictionless passwordless auto-registration for students.
- **RAG-Powered KICD Research (P1–P2)** — PDF-to-text conversion (`PyMuPDF`), sliding-window chunking, 768-dim Gemini embeddings, and `pgvector` HNSW cosine similarity search with CBC strand/grade filtering and automatic fallback.
- **Pedagogical Scriptwriter (P3)** — Generates structured, bilingual (English & Kiswahili) CBC lesson scripts with learning objectives, sectioned content, key concepts, and remedial explanations.
- **Mastery-Based Diagnostic Gate (P4)** — 5-question MCQ loop enforcing an **80% pass threshold** (4/5 correct). Triggers up to 2 remedial script rewrites targeting weak competency tags before force-passing.
- **Voiceover-Synced Manim Animations (P5)** — Generates `manim-voiceover` scenes narrated via **ElevenLabs** (`eleven_multilingual_v2`) and renders classroom-ready high-contrast MP4s asynchronously via a background worker.
- **Interactive Lesson Viewer & Transcripts** — Real-time pipeline progress bar, tabbed lesson viewer (Script, Full downloadable `.txt` Transcript, Assessment Results), and embedded MP4 video player.
- **Bilingual Voice Assistant** — Real-time WebSocket + REST voice interface powered by Gemini 2.5 Flash NLU and Google Cloud STT/TTS (`en-KE` & `sw-KE`), capable of answering questions, submitting diagnostic answers, and triggering new lessons by voice.

---

## Project Structure

```
mwalimusmart-web/
├── backend/                    # Node.js API + Python AI agents
│   ├── api/
│   │   ├── server.js           # Express + WebSocket server (entry point)
│   │   ├── python_bridge.js    # Node ↔ Python IPC bridge
│   │   ├── python_bridge_server.py
│   │   ├── db.js               # PostgreSQL + MongoDB clients & health checks
│   │   ├── middleware/         # auth.js (JWT), validators.js
│   │   ├── routes/             # auth.js (Teacher + Student login/refresh/me)
│   │   └── utils/              # logger.js (Pino)
│   ├── agents/                 # LangGraph agent nodes
│   │   ├── researcher.py       # RAG: pgvector → KICD chunks (with grade fallback)
│   │   ├── scriptwriter.py     # Gemini 2.5 Flash → CBC lesson script (EN/SW + remedial)
│   │   ├── diagnostic.py       # 5-question MCQ loop, 80% gate, max-2 retake routing
│   │   └── animator.py         # Gemini 2.5 Flash → Manim Voiceover + ElevenLabs → MP4 queue
│   ├── graph/
│   │   ├── state.py            # AgentState TypedDict definitions
│   │   └── graph.py            # LangGraph StateGraph orchestration
│   ├── rag/
│   │   ├── ingest.py           # TXT/MD → chunk → Gemini 768-dim embed → pgvector
│   │   ├── retriever.py        # Cosine search with CBC strand/grade filters
│   │   └── pdf_converter.py    # KICD PDF → text (PyMuPDF)
│   ├── voice/
│   │   ├── assistant.py        # Gemini 2.5 Flash NLU/Q&A + Google Cloud TTS
│   │   └── session_manager.py  # Multi-user conversation session store
│   ├── workers/
│   │   └── manim_worker.py     # Background MongoDB-polled Manim MP4 render worker
│   ├── manim_scenes/
│   │   └── supply_demand_scene.py # Reference high-contrast classroom Manim scene
│   ├── prompts/
│   │   └── templates.py        # Bilingual (EN/SW) system & user prompt templates
│   ├── utils/
│   │   └── lesson_store.py     # MongoDB persistence & animation queue helpers
│   ├── config/
│   │   └── settings.py         # Pydantic settings (reads .env)
│   ├── scripts/
│   │   ├── init_db.py          # PostgreSQL + pgvector schema bootstrap & demo seed
│   │   ├── create_teacher.py   # CLI utility to provision teacher accounts
│   │   └── setup.sh            # Environment setup script
│   ├── tests/
│   │   └── test_p3_p4_integration.py # Pytest suite for Researcher, Scriptwriter & Diagnostic
│   ├── graph_runner.py         # End-to-end CLI test harness (Pass, Retake, Force-Pass)
│   ├── renders/                # Rendered Manim MP4 output directory
│   ├── public/                 # Built React SPA (auto-generated on build)
│   ├── requirements.txt        # Python dependencies
│   └── package.json
│
├── frontend/                   # React 18 + Vite + Tailwind CSS + Motion
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx          # Teacher & Student role-based sign-in
│   │   │   ├── DashboardPage.jsx      # Analytics cards, quick actions & recent lessons
│   │   │   ├── LessonGeneratePage.jsx # 4-step wizard (Topic, Strand/Grade, Language, Review)
│   │   │   ├── LessonViewPage.jsx     # Live pipeline tracker, video player, Script/Transcript/Results tabs
│   │   │   ├── DiagnosticPage.jsx     # Interactive 5-question MCQ assessment with progress ring
│   │   │   ├── VoicePage.jsx          # WebSocket/REST bilingual voice & chat assistant
│   │   │   └── HistoryPage.jsx        # Filterable, sortable school lesson archive
│   │   ├── components/layout/  # Sidebar + Layout shell
│   │   ├── lib/
│   │   │   ├── api.js          # Axios client + automatic JWT token refresh
│   │   │   └── store.js        # Zustand global state
│   │   └── index.css           # Design tokens + glassmorphism utilities
│   ├── vite.config.js          # Builds static assets to backend/public/
│   └── package.json
│
├── deploy/
│   ├── Dockerfile              # Multi-stage production image (Frontend + Python + Node)
│   ├── docker-compose.yml      # Full stack (pgvector PG16 + Mongo 7 + db-init + app + worker)
│   └── railway.toml            # One-click Railway deployment config
│
├── .env.example                # Environment variable template
└── package.json                # Monorepo root with npm workspaces
```

---

## Quickstart (Local Development)

### Prerequisites
- **Node.js** 20+ (22 recommended)
- **Python** 3.12+
- **PostgreSQL** 15+ with `pgvector` extension
- **MongoDB** 6+ (7 recommended)
- **FFmpeg / Cairo / Pango / LaTeX** (required only for local Manim video rendering)

### 1. Clone and configure
```bash
git clone <your-repo> mwalimusmart-web
cd mwalimusmart-web
cp .env.example .env
```

Ensure your `.env` includes the required keys:
- `GEMINI_API_KEY` — Required for lesson scripting, RAG embeddings (`models/text-embedding-004`), Manim codegen, and Voice NLU
- `ELEVENLABS_API_KEY` — Required for `manim-voiceover` audio narration
- `GOOGLE_APPLICATION_CREDENTIALS` — Optional path to GCP service account JSON for Google Cloud TTS/STT (falls back to text-only if omitted)
- `POSTGRES_DSN` & `MONGODB_URI` — Database connection strings
- `AUTH_SECRET` & `AUTH_REFRESH_SECRET` — JWT signing secrets

### 2. Install dependencies
```bash
# Node (both backend + frontend workspaces)
npm install

# Python
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 3. Bootstrap database
```bash
npm run setup:db
# Or manually:
# cd backend && source venv/bin/activate && python3 -m scripts.init_db --seed
```
This creates the `schools`, `teachers`, `students`, `kicd_chunks` (`VECTOR(768)`), and `lesson_jobs` tables, and seeds a demo school & teacher account.

### 4. Run development servers
```bash
# Option A: Backend (:4000) + Frontend (:5173) concurrently
npm run dev

# Option B: Separately
cd backend && npm run dev          # Express + WS API on :4000
cd frontend && npm run dev         # Vite React SPA on :5173 (proxied to :4000)

# Manim render worker (separate terminal)
npm run worker
```

### 5. Sign in
Open `http://localhost:5173`:
- **Teacher Demo Login**: `wanjiku@westlands.sc.ke` / `MwalimuDemo2025`
- **Student Login**: Switch to the **Student** tab and enter any student email address (auto-registers on first sign-in, no password required).

---

## Running Tests & E2E Pipeline

```bash
# Run unit & integration test suite (mocked DB/LLM)
npm test

# Run full E2E LangGraph pipeline harness (Pass, Retake, and Force-Pass scenarios)
cd backend && source venv/bin/activate
python3 graph_runner.py
```

---

## Docker (Recommended for Production)

```bash
cp .env.example .env
# Edit .env — fill in API keys

docker compose -f deploy/docker-compose.yml up -d
```
> Note: `docker-compose.yml` includes a `db-init` service that automatically runs `python3 -m scripts.init_db --seed` once PostgreSQL and MongoDB are healthy.

Open `http://localhost:4000` once all containers are up.

---

## Deploy to Railway / Render / Fly.io

1. Push repo to GitHub
2. Connect to your cloud platform
3. Set all environment variables from `.env.example`
4. Deploy — the multi-stage `deploy/Dockerfile` builds the React SPA into `backend/public/` and bundles both Node.js and Python runtimes.

**Railway one-click:**
- New Project → Deploy from GitHub → select repo
- Set env vars in dashboard
- `deploy/railway.toml` configures the build and healthcheck automatically

---

## Ingest KICD Content

```bash
# Place KICD PDF textbooks in strand/grade folders:
mkdir -p kicd_pdfs/science_technology/grade_7

cd backend && source venv/bin/activate

# 1. Convert PDFs to text
python3 -m rag.pdf_converter --input_dir ../kicd_pdfs --output_dir ../kicd_docs

# 2. Validate chunking & embeddings (dry run — no DB write)
python3 -m rag.ingest --source_dir ../kicd_docs --dry_run

# 3. Full ingest → pgvector (768-dim Gemini embeddings)
python3 -m rag.ingest --source_dir ../kicd_docs
```

> The system works even without ingested KICD PDFs — Gemini falls back to general CBC curriculum knowledge when no chunks meet the similarity threshold. RAG improves factual precision and KICD page-level source attribution.

---

## Add Teachers

```bash
cd backend && source venv/bin/activate
python3 -m scripts.create_teacher \
  --school_id 00000000-0000-0000-0000-000000000001 \
  --name "Mr. Kamau Njoroge" \
  --email kamau@school.sc.ke \
  --password SecurePass123 \
  --strand mathematics
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3, Motion (Framer), Zustand, Axios |
| **API & Real-time** | Node.js 22, Express 4, WebSocket (`ws`), JWT + bcrypt |
| **AI Orchestration** | LangGraph 0.2, Python 3.12 |
| **Lesson Scripts** | Google Gemini 2.5 Flash (`google-generativeai`) |
| **Animation Codegen** | Google Gemini 2.5 Flash |
| **Animations & Voiceover** | Manim Community Edition 0.18 + `manim-voiceover` + ElevenLabs (`eleven_multilingual_v2`) |
| **Voice Assistant NLU & Q&A** | Google Gemini 2.5 Flash |
| **Voice TTS / STT** | Google Cloud Text-to-Speech & Speech-to-Text (`en-KE` / `sw-KE`) |
| **Embeddings** | Google Gemini `models/text-embedding-004` (768 dimensions) |
| **Vector & Relational DB** | PostgreSQL 16 + `pgvector` (HNSW cosine index) |
| **Document & Job Store** | MongoDB 7 (`lessons`, `diagnostic_logs`, `animation_jobs`) |
| **Deployment** | Docker Compose, Railway, Render, Fly.io, VPS |

