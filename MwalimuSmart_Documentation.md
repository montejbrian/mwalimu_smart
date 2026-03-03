# MwalimuSmart - System Documentation & Walkthrough

## Overview

**MwalimuSmart** is an AI-powered educational platform designed to provide interactive, multi-modal tutoring. It breaks down complex subject matter into easily digestible lessons using dynamic text, automated voice narration (TTS), and real-time animated diagrams. The platform acts as a knowledgeable, encouraging "Tutor," utilizing the Socratic method to guide students toward deep understanding rather than simply providing answers.

## Architecture & Technology Stack

The project follows a standard internal Client-Server architecture:

- **Frontend:** React (Vite build system), Tailwind CSS (for styling), GSAP (for canvas animations), shadcn/ui components.
- **Backend:** Node.js, Express.js.
- **AI Integration:** Google Generative AI SDK (`gemini-2.5-flash` model).

### Core Features

#### 1. Interactive Step-by-Step Lessons (`/board`)
- **Flow:** A student enters a topic. The frontend sends a request to the backend. The backend uses the Gemini AI to break the topic down into **4 to 7 progressive steps** (depending on complexity).
- **Multi-modal Learning:** Each step contains:
  1. A text explanation.
  2. Synthesized audio narration (cached locally to save on API costs and improve speed).
  3. JSON-based visual instructions that the frontend renders and animates on an HTML5 `<canvas>` using GSAP.

#### 2. Socratic AI Tutor Q&A (`/qa`)
- **Flow:** A dedicated chat interface where students can ask free-form questions or seek help with specific problems.
- **Tutor Persona:** The AI is instructed via a strict system prompt (`QA_SYSTEM_PROMPT`) to act as an encouraging guide. It provides hints and breaks down problems instead of just giving the final answer. It also remembers conversation history for context.
- **Real-time Canvas Drawing:** The newest enhancement. When a student asks a visual question (e.g., "Draw the hydrological cycle"), the AI responds with a JSON payload containing both the conversational text and an optional array of `visuals`. A reusable `<ChatCanvas />` component intercepts these instructions and draws animated diagrams directly inside the chat bubble.

#### 3. Session History (`/history`)
- **Flow:** Tracks previously generated lessons so students can easily jump back into past topics without regenerating them from scratch.

---

## Project Structure Walkthrough

### Backend (`/backend`)
The backend is responsible for all external API communication (Gemini), prompt engineering, and audio caching.

- **`src/server.js`**: The main entry point. Sets up CORS, middleware, and mounts API routes.
- **`src/routes/`**:
  - `lesson.routes.js`: Endpoints for generating lessons, visuals, and audio.
  - `qa.routes.js`: Endpoints for the Q&A chat feature (`/api/qa/ask`).
- **`src/controllers/`**:
  - `lesson.controller.js`: Request validation and orchestration for lesson generation.
  - `qa.controller.js`: Handles incoming chat messages, validates the `history` array, and passes data to the service.
- **`src/services/`**:
  - `gemini.service.js`: Intricate prompting and interaction with the Google Generative AI API. Contains the logic for determining step counts and extracting valid JSON blocks from AI responses (`cleanJsonString`).
  - `qa.service.js`: Specific AI configuration for the Tutor persona, ensuring responses strictly adhere to the `{"text": "...", "visuals": [...]}` JSON schema.
- **`cache/audio/`**: Local storage for generated TTS MP3 files. Note: This directory is ignored by git to prevent repository bloat.

### Frontend (`/frontend`)
The frontend is built for responsiveness and aesthetic appeal, handling all real-time rendering and state management.

- **`src/App.jsx`**: React Router configuration, defining paths to `/`, `/board`, `/history`, and `/qa`.
- **`src/pages/`**:
  - `Index.jsx`: The beautiful, animated landing page with quick-start inputs and navigation.
  - `Board.jsx`: The core lesson viewer. Manages complex state for current steps, audio playback synchronization, and the main canvas renderer.
  - `QA.jsx`: The chat interface. Manages conversation history, loading states, and dynamically renders the `ChatCanvas` when the backend returns drawing instructions.
- **`src/components/`**:
  - `ChatCanvas.jsx`: A reusable React component extracted from `Board.jsx`. Takes JSON visual instructions and uses GSAP to animate drawing lines, shapes, arrows, and text onto an isolated canvas.
- **`src/services/api.service.js`**: Axios wrappers for communicating with the backend (e.g., `generateLesson`, `askQuestion`).

---

## Key Technical Decisions & Optimizations

1. **Model Usage:** The system is optimized for `gemini-2.5-flash` to leverage the latest features and improved reasoning capabilities for educational content generation.
2. **Robust JSON Parsing:** The AI sometimes hallucinates conversational text outside of its required JSON block (e.g., "Sure, here is your diagram: ```json...```"). The backend uses an advanced Regex extractor (`cleanJsonString`) to isolate and parse only the valid JSON payload, preventing frontend crashes.
3. **Audio Caching:** Text-to-speech files are hashed and saved locally in `backend/cache/audio/`. If a student requests a lesson on "Photosynthesis" twice, the backend serves the cached audio instantly instead of regenerating it, saving time and API quotas.

## Setup Instructions for Development

1. **Environment Variables**:
   - `backend/.env`: Requires `GEMINI_API_KEY`, `PORT` (e.g., 3001), and `FRONTEND_URL` (e.g., `http://localhost:5173`).
   - `frontend/.env`: Requires `VITE_BACKEND_URL` (e.g., `http://localhost:3001`).
2. **Run Backend**: Navigate to `/backend`, run `npm install`, then `npm run dev`.
3. **Run Frontend**: Navigate to `/frontend`, run `npm install`, then `npm run dev`.
