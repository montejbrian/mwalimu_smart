/**
 * MwalimuSmart Web
 * backend/api/server.js — Production Web Server
 *
 * Web-native changes from OS version:
 *  - CORS configured for web domains (not LAN subnets)
 *  - Static MP4s served via CDN-friendly signed URL pattern
 *  - No local filesystem assumptions — uses env vars for all paths
 *  - Helmet CSP tuned for React SPA on any domain
 *  - PORT defaults to 4000; cloud hosts inject PORT automatically
 *  - SPA served from backend/public/  (built frontend copied here)
 */

import "dotenv/config";
import express           from "express";
import cors              from "cors";
import helmet            from "helmet";
import { createServer }  from "http";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 }  from "uuid";
import rateLimit         from "express-rate-limit";
import path              from "path";
import { fileURLToPath } from "url";

import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { pool, getDb, checkHealth } from "./db.js";
import { PythonBridge }   from "./python_bridge.js";
import { authMiddleware } from "./middleware/auth.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { validateLesson, validateVoice } from "./middleware/validators.js";
import { errorHandler }   from "./utils/asyncHandler.js";
import { logger }         from "./utils/logger.js";
import authRoutes         from "./routes/auth.js";
import catalogRoutes      from "./routes/catalog.js";
import lessonRoutes       from "./routes/lessons.js";
import authoringRoutes    from "./routes/authoring.js";
import progressRoutes     from "./routes/progress.js";
import followupRoutes     from "./routes/followups.js";
import { createVoiceRouter } from "./routes/voice.js";
import { processVoiceTurn }  from "./services/voice_service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// public/ = compiled React SPA copied here during CI/CD build step
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });
const bridge = new PythonBridge();

export function broadcastFollowupVisual(eventPayload) {
  const data = typeof eventPayload === "string" ? eventPayload : JSON.stringify(eventPayload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}
app.set("broadcastFollowupVisual", broadcastFollowupVisual);

// ── Security & CORS ───────────────────────────────────────────────────────────
const WEB_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",").map(s => s.trim());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "blob:"],
      mediaSrc:    ["'self'", "blob:", process.env.CDN_URL || "'self'"],
      connectSrc:  ["'self'", "wss:", "ws:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin(origin, cb) {
    if (!origin || WEB_ORIGINS.includes("*") || WEB_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods:     ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Accept-Language","X-Request-Id"],
}));

app.use(express.json({ limit: "20mb" }));
app.use(requestContextMiddleware);

// Rate limiting — stricter on write endpoints
const readLimiter  = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60_000, max: 30,  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment." } });

app.use("/api/",             readLimiter);
app.use("/api/lesson/generate", writeLimiter);
app.use("/api/voice/",       writeLimiter);

// ── Static: Manim renders ─────────────────────────────────────────────────────
// In production, set RENDERS_DIR to an S3-mounted path or serve via CDN.
// Default: local path for dev/self-hosted.
const RENDERS_DIR = process.env.RENDERS_DIR || path.join(__dirname, "..", "..", "renders");
app.use("/renders", express.static(RENDERS_DIR, {
  maxAge: "7d",
  setHeaders(res) {
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.set("Access-Control-Allow-Origin", "*");
  },
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/authoring", authoringRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/followups", followupRoutes);
app.use("/api/voice", createVoiceRouter(bridge));

// Health — used by cloud load balancers and uptime monitors
app.get("/api/health", async (_req, res) => {
  const services = await checkHealth();
  const ok = Object.values(services).every(v => v === "up");
  res.status(ok ? 200 : 503).json({
    status:    ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || "1.0.0",
    services:  { ...services, python_bridge: bridge.isReady ? "up" : "starting" },
  });
});

// ── Lesson: generate ─────────────────────────────────────────────────────────
app.post("/api/lesson/generate", authMiddleware, validateLesson, async (req, res) => {
  const lessonId = uuidv4();
  const { topic, strand, grade_level, language = "en" } = req.body;
  const { school_id, teacher_id, student_id } = req.auth;
  const creator_id = student_id || teacher_id;
  try {
    await pool.query(
      `INSERT INTO lesson_jobs (lesson_id,school_id,creator_id,topic,strand,grade_level,language,workflow_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'initialised')`,
      [lessonId, school_id, creator_id, topic, strand, grade_level, language]
    );
    // Fire-and-forget — graph runs async, frontend polls
    bridge.invokeGraph({ lesson_id: lessonId, topic, strand, grade_level, language, school_id, teacher_id: creator_id, remedial_mode: false })
      .then(async result => {
        const db = await getDb();
        await db.collection("lessons").replaceOne(
          { lesson_id: lessonId },
          { ...result, lesson_id: lessonId, updated_at: new Date() },
          { upsert: true }
        );
        logger.info({ lessonId, status: result.workflow_status }, "Graph complete");
      })
      .catch(err => {
        logger.error({ lessonId, err: err.message }, "Graph failed");
        pool.query("UPDATE lesson_jobs SET workflow_status='error' WHERE lesson_id=$1", [lessonId]);
      });
    res.status(202).json({ lesson_id: lessonId, status: "initialised", poll_url: `/api/lesson/${lessonId}` });
  } catch (err) {
    logger.error({ err: err.message }, "generate failed");
    res.status(500).json({ error: "Failed to start lesson generation" });
  }
});

// ── Lesson: get ───────────────────────────────────────────────────────────────
app.get("/api/lesson/:lessonId", authMiddleware, async (req, res) => {
  const { lessonId } = req.params;
  const creator_id = req.auth.student_id || req.auth.teacher_id;
  try {
    const pg = await pool.query(
      `SELECT lesson_id,workflow_status,script_version,retake_count,
              diagnostic_score,diagnostic_outcome,mp4_path,
              topic,strand,grade_level,language,error_log,node_durations,
              created_at,updated_at
       FROM lesson_jobs WHERE lesson_id=$1 AND school_id=$2 AND creator_id=$3`,
      [lessonId, req.auth.school_id, creator_id]
    );
    if (!pg.rows.length) return res.status(404).json({ error: "Lesson not found" });
    let content = {};
    if (["diagnosing","animating","complete"].includes(pg.rows[0].workflow_status)) {
      const db  = await getDb();
      const doc = await db.collection("lessons").findOne({ lesson_id: lessonId }, { projection: { _id: 0 } });
      if (doc) content = doc;
    }
    res.json({ ...pg.rows[0], ...content });
  } catch (err) {
    logger.error({ lessonId, err: err.message }, "get lesson failed");
    res.status(500).json({ error: "Failed to retrieve lesson" });
  }
});

// ── Lesson: submit answers ────────────────────────────────────────────────────
app.post("/api/lesson/:lessonId/answer", authMiddleware, async (req, res) => {
  const { lessonId } = req.params;
  const { answers, student_id } = req.body;
  if (!answers || Object.keys(answers).length !== 5)
    return res.status(400).json({ error: "All 5 answers (q1–q5) required" });
  const valid = new Set(["A","B","C","D"]);
  for (const [k, v] of Object.entries(answers))
    if (!valid.has(String(v).toUpperCase())) return res.status(400).json({ error: `Invalid answer for ${k}: must be A–D` });
  const norm = Object.fromEntries(Object.entries(answers).map(([k,v]) => [k, v.toUpperCase()]));
  try {
    const result = await bridge.resumeGraphWithAnswers(lessonId, norm);
    const diag   = result.diagnostic_result || {};
    const db     = await getDb();
    await db.collection("diagnostic_logs").insertOne({
      lesson_id: lessonId, student_id: student_id || req.auth.teacher_id,
      answers: norm, score: diag.score, percentage: diag.percentage,
      outcome: diag.outcome, weak_competencies: diag.weak_competencies || [],
      answered_at: new Date(),
    });
    res.json({
      outcome:           diag.outcome,
      score:             diag.score,
      percentage:        diag.percentage,
      weak_competencies: diag.weak_competencies || [],
      next_action:       diag.outcome === "pass" ? "PROCEED_TO_ANIMATION" : "RETAKE_LESSON",
      message:           diag.outcome === "pass"
        ? `Excellent! You scored ${diag.percentage?.toFixed(0)}%. Lesson unlocked.`
        : `You scored ${diag.percentage?.toFixed(0)}%. Review the lesson and try again.`,
      retake_count: result.retake_count || 0,
    });
  } catch (err) {
    logger.error({ lessonId, err: err.message }, "answer failed");
    res.status(500).json({ error: "Failed to process answers" });
  }
});

// ── Lesson: school history ────────────────────────────────────────────────────
app.get("/api/schools/:schoolId/lessons", authMiddleware, async (req, res) => {
  const { schoolId } = req.params;
  if (schoolId !== req.auth.school_id) return res.status(403).json({ error: "Access denied" });
  const creator_id = req.auth.student_id || req.auth.teacher_id;
  const limit  = Math.min(parseInt(req.query.limit  || "20"), 100);
  const offset = parseInt(req.query.offset || "0");
  try {
    let q = `SELECT lesson_id,topic,strand,grade_level,language,workflow_status,
                    diagnostic_score,diagnostic_outcome,retake_count,mp4_path,created_at,updated_at
             FROM lesson_jobs WHERE school_id=$1 AND creator_id=$2`;
    const p = [schoolId, creator_id];
    if (req.query.strand) { p.push(req.query.strand); q += ` AND strand=$${p.length}`; }
    if (req.query.status) { p.push(req.query.status); q += ` AND workflow_status=$${p.length}`; }
    q += ` ORDER BY created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`;
    p.push(limit, offset);
    const result = await pool.query(q, p);
    res.json({ lessons: result.rows, limit, offset });
  } catch { res.status(500).json({ error: "Failed to fetch history" }); }
});

// ── WebSocket — real-time voice & follow-up visual broadcast ──────────────────
wss.on("connection", (ws, req) => {
  const sid = uuidv4();
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname.startsWith("/ws/voice")) {
    let buf = Buffer.alloc(0);
    logger.info({ sid }, "Voice WS opened");

    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "Unauthorized");
      return;
    }

    let authUser = null;
    try {
      authUser = jwt.verify(token, config.authSecret);
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case "audio_chunk":
            buf = Buffer.concat([buf, Buffer.from(msg.payload, "base64")]);
            break;
          case "audio_end": {
            if (!buf.length) break;
            const stt = await bridge.transcribeAudio({
              audio_b64: buf.toString("base64"),
              language: msg.language || "en-KE",
              encoding: msg.encoding || "WEBM_OPUS",
              sample_rate: msg.sample_rate || 48000,
            });
            ws.send(JSON.stringify({ type: "transcript", payload: stt }));
            buf = Buffer.alloc(0);

            if (msg.lesson_id && stt.transcript) {
              const voiceTurn = await processVoiceTurn({
                schoolId: msg.school_id || authUser.school_id,
                studentId: msg.student_id || authUser.student_id || authUser.teacher_id || sid,
                lessonId: msg.lesson_id,
                text: stt.transcript,
                language: (msg.language || "en-KE").slice(0, 2),
                bridge,
              });
              ws.send(JSON.stringify({ type: "response", payload: voiceTurn }));
            }
            break;
          }
          case "text": {
            if (msg.lesson_id && msg.payload) {
              const voiceTurn = await processVoiceTurn({
                schoolId: msg.school_id || authUser.school_id,
                studentId: msg.student_id || authUser.student_id || authUser.teacher_id || sid,
                lessonId: msg.lesson_id,
                text: msg.payload,
                language: msg.language || "en",
                bridge,
              });
              ws.send(JSON.stringify({ type: "response", payload: voiceTurn }));
            }
            break;
          }
          case "end_session":
            ws.close(1000);
            break;
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", payload: err.message }));
      }
    });
    ws.on("close", () => logger.info({ sid }, "Voice WS closed"));
  } else {
    // Follow-up visual broadcast & real-time notification socket
    logger.info({ sid, pathname }, "Follow-up WS opened");
    ws.send(JSON.stringify({ type: "connected", sid }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
        // ignore
      }
    });

    ws.on("close", () => logger.info({ sid }, "Follow-up WS closed"));
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));
app.get("*", (_req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  res.sendFile(indexPath, err => {
    if (err) res.status(200).json({ message: "MwalimuSmart API running. Frontend not built yet.", docs: "/api/health" });
  });
});

// ── Canonical error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "4000");
if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`MwalimuSmart Web running on :${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
}

export default app;
