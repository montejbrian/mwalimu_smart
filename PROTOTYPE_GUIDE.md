# MwalimuSmart Prototype Setup Guide

This guide will help you set up the core functional prototype of MwalimuSmart, focusing on lesson generation, visuals (Canvas & Manim), and audio.

## 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+)
- **PostgreSQL** (with `pgvector` extension)
- **Manim** (for math/physics animations)
  - Install via: `sudo apt-get install manim` (Linux) or `brew install manim` (macOS)
  - Also requires `ffmpeg` and `latex` (usually installed with manim).

## 2. API Credentials Step-by-Step

### A. Gemini API Key (Essential)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **"Get API key"**.
3. Create a new API key.
4. Copy it.

### B. Hugging Face Token (For AI Images)
1. Go to [Hugging Face Settings](https://huggingface.co/settings/tokens).
2. Create a new **Access Token** (type: "Read").
3. Copy it.

### C. Google Cloud TTS (For Audio)
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **"Cloud Text-to-Speech API"**.
4. Go to **IAM & Admin > Service Accounts**.
5. Create a Service Account, give it "Cloud Text-to-Speech API User" role.
6. Click on the account -> **Keys** -> **Add Key** -> **Create new key** (JSON).
7. Save the JSON file as `google-credentials.json` in the `backend/` directory.

## 3. Environment Configuration

### Root Directory
Create a `.env` file in the root directory:
```bash
# Copy from .env.example
cp .env.example .env
```
Open `.env` and fill in your keys.

### Backend Directory
The backend will use the root `.env` or you can create one in `backend/.env`.

### Database Setup
Ensure PostgreSQL is running and the `pgvector` extension is enabled.
```sql
CREATE DATABASE mwalimu_smart;
\c mwalimu_smart
CREATE EXTENSION IF NOT EXISTS vector;
```

## 4. Running the System

### Step 1: Install Dependencies
```bash
# Backend
cd backend
npm install

# Manim Service
cd manim-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../../frontend
npm install
```

### Step 2: Start Services (3 Terminals)

**Terminal 1: Manim Animation Service**
```bash
cd backend/manim-service
source venv/bin/activate
python app.py
```

**Terminal 2: Main Backend**
```bash
cd backend
npm run dev
```

**Terminal 3: Frontend**
```bash
cd frontend
npm run dev
```

## 5. Testing the Visuals
1. Open `http://localhost:5173`.
2. Enter a topic like **"Pythagorean Theorem"** or **"Plant Cell Structure"**.
3. The system will:
   - Generate a lesson using Gemini.
   - Generate audio for each step.
   - For Math/Physics: Render Manim animations in the background.
   - For Science: Generate AI images using Stable Diffusion (Hugging Face).
   - Fallback: Generate Canvas drawing instructions.

## 6. Prototyping Notes
- Multi-tenancy and strict authentication are **bypassed** in this prototype mode.
- The system defaults to "Senior School" / "Grade 10" levels.
- If a service is slow (especially Manim rendering), the UI will show a fallback visual while it loads.
