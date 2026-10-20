/**
 * MwalimuSmart Institutional OS
 * api/python_bridge.js — Node.js ↔ Python Bridge Client
 *
 * Spawns api/python_bridge_server.py as a child process.
 * Communicates via stdin/stdout newline-delimited JSON (NDJSON).
 * Pending requests are tracked by UUID — responses routed back
 * to the correct Promise resolver.
 */

import { spawn }       from "child_process";
import { createInterface } from "readline";
import { v4 as uuidv4 } from "uuid";
import path              from "path";
import { fileURLToPath } from "url";
import { logger }        from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_SCRIPT = path.join(__dirname, "python_bridge_server.py");
const PYTHON_BIN    = process.env.PYTHON_BIN || "python3";
const REQUEST_TIMEOUT_MS = 120_000;   // 2 min — graph + TTS can take time


export class PythonBridge {
  constructor() {
    this._pending  = new Map();   // requestId → { resolve, reject, timer }
    this._ready    = false;
    this._proc     = null;
    if (process.env.NODE_ENV !== "test") {
      this._spawn();
    }
  }

  get isReady() { return this._ready; }

  // ── Spawn ──────────────────────────────────────────────────────────────────

  _spawn() {
    logger.info({ script: BRIDGE_SCRIPT }, "Spawning Python bridge");

    this._proc = spawn(PYTHON_BIN, [BRIDGE_SCRIPT], {
      cwd:   path.join(__dirname, ".."),   // project root — so imports resolve
      stdio: ["pipe", "pipe", "pipe"],
      env:   { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    // Route stdout lines back to waiting promises
    const rl = createInterface({ input: this._proc.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        const pending = this._pending.get(msg.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error));
        else           pending.resolve(msg.result);
      } catch (err) {
        logger.error({ err: err.message, line }, "Bridge parse error");
      }
    });

    // Log stderr
    this._proc.stderr.on("data", (data) => {
      const text = data.toString().trim();
      if (text.includes("ready")) this._ready = true;
      logger.debug({ text }, "[python_bridge stderr]");
    });

    this._proc.on("exit", (code, signal) => {
      logger.warn({ code, signal }, "Python bridge exited — respawning in 3s");
      this._ready = false;
      // Reject all pending requests
      for (const [, { reject, timer }] of this._pending) {
        clearTimeout(timer);
        reject(new Error("Python bridge restarted"));
      }
      this._pending.clear();
      setTimeout(() => this._spawn(), 3000);
    });

    // Mark ready after 2s warm-up (imports load)
    setTimeout(() => { this._ready = true; }, 2000);
  }

  // ── Core RPC ───────────────────────────────────────────────────────────────

  _mockHandler(method, params = {}) {
    if (method === "transcribeAudio") {
      const lang = params.language || "en-KE";
      return Promise.resolve({
        transcript: lang.startsWith("sw")
          ? "Nielezee zaidi kuhusu somo hili la CBC"
          : "Explain this lesson clearly with a Kenyan example",
        confidence: 0.98,
      });
    }
    if (method === "invokeVoice") {
      const lang = params.language || "en";
      const lessonTitle = params.lesson_context?.lesson_title || "Current CBC Lesson";
      const responseText = lang === "sw"
        ? `Swali zuri kuhusu somo la ${lessonTitle}! Katika mtaala wa CBC, tunajifunza kwa vitendo na mifano halisi ya Kenya.`
        : `That's an excellent question about ${lessonTitle}! In CBC learning, we connect this concept directly to real Kenyan daily life.`;
      return Promise.resolve({
        intent: "QUESTION_ANSWER",
        response_text: responseText,
        audio_b64: Buffer.from("mock_mp3_audio_payload_data").toString("base64"),
        action: {},
        lesson_id: params.lesson_id,
        language: lang,
      });
    }
    if (method === "endVoiceSession") {
      return Promise.resolve({ status: "ended" });
    }
    return Promise.resolve({});
  }

  _call(method, params) {
    if (!this._proc) {
      if (process.env.NODE_ENV === "test") {
        return this._mockHandler(method, params);
      }
      this._spawn();
    }

    return new Promise((resolve, reject) => {
      const id  = uuidv4();
      const msg = JSON.stringify({ id, method, params }) + "\n";

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Bridge timeout: ${method} after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      this._pending.set(id, { resolve, reject, timer });
      this._proc.stdin.write(msg);
    });
  }

  // ── Public API (mirrors Python HANDLERS) ──────────────────────────────────

  invokeGraph(params)              { return this._call("invokeGraph", params); }
  resumeGraphWithAnswers(lessonId, answers) {
    return this._call("resumeGraphWithAnswers", { lesson_id: lessonId, answers });
  }
  invokeVoice(params)              { return this._call("invokeVoice", params); }
  transcribeAudio(params)          { return this._call("transcribeAudio", params); }
  endVoiceSession(params)          { return this._call("endVoiceSession", params); }
}
