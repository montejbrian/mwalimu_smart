import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic, MicOff, Volume2, Send, Loader2,
  MessageSquare, Zap, Globe, RotateCcw,
} from "lucide-react";
import { voiceApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import toast from "react-hot-toast";
import clsx from "clsx";

/* ── Waveform visualiser bars ── */
function Waveform({ active }) {
  const bars = 28;
  return (
    <div className="flex items-center justify-center gap-[3px] h-12">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className={clsx(
            "w-1 rounded-full",
            active ? "bg-brand-400" : "bg-ink-700"
          )}
          animate={active ? {
            height: [6, Math.random() * 32 + 6, 6],
            opacity: [0.6, 1, 0.6],
          } : { height: 4, opacity: 0.3 }}
          transition={active ? {
            duration: 0.5 + Math.random() * 0.4,
            repeat: Infinity,
            delay: (i / bars) * 0.3,
            ease: "easeInOut",
          } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

/* ── Single conversation bubble ── */
function Bubble({ role, text, intent, index }) {
  const isUser = role === "user";
  const intentColors = {
    LESSON_REQUEST:    "badge-green",
    QUESTION_ANSWER:   "badge-gold",
    DIAGNOSTIC_SUBMIT: "badge text-blue-400 bg-blue-500/10 border-blue-500/20",
    HELP:              "badge-muted",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-600 to-jade-600 flex items-center justify-center flex-shrink-0 shadow-glow-green mt-0.5">
          <Zap size={14} className="text-white" />
        </div>
      )}
      <div className={clsx("max-w-[78%] space-y-1", isUser && "items-end flex flex-col")}>
        <div className={clsx(
          "px-4 py-3 rounded-2xl text-sm font-body leading-relaxed",
          isUser
            ? "bg-brand-600/25 border border-brand-500/30 text-ink-100 rounded-tr-sm"
            : "glass border border-[var(--border)] text-ink-200 rounded-tl-sm"
        )}>
          {text}
        </div>
        {intent && intentColors[intent] && (
          <span className={clsx(intentColors[intent], "text-[10px]")}>{intent.replace(/_/g," ")}</span>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-ink-800 border border-[var(--border)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <MessageSquare size={13} className="text-ink-400" />
        </div>
      )}
    </motion.div>
  );
}

/* ── Audio playback hook ── */
function useAudioPlayer() {
  const audioRef = useRef(null);

  function play(b64) {
    const audio = new Audio(`data:audio/mp3;base64,${b64}`);
    audioRef.current = audio;
    audio.play().catch(() => {});
  }

  function stop() {
    audioRef.current?.pause();
  }

  return { play, stop };
}

export default function VoicePage() {
  const user     = useStore((s) => s.user);
  const { voiceResponses, addVoiceResponse, clearVoiceSession } = useStore();

  const [language,   setLanguage]   = useState("en");
  const [text,       setText]       = useState("");
  const [listening,  setListening]  = useState(false);
  const [sending,    setSending]    = useState(false);
  const [lessonId,   setLessonId]   = useState("voice_session_001");
  const [wsReady,    setWsReady]    = useState(false);

  const wsRef       = useRef(null);
  const feedRef     = useRef(null);
  const mediaRef    = useRef(null);
  const chunksRef   = useRef([]);
  const { play }    = useAudioPlayer();

  // Auto-scroll feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [voiceResponses]);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws/voice`);
    wsRef.current = ws;

    ws.onopen  = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "transcript" && msg.payload?.transcript) {
          addVoiceResponse({ role: "user", text: msg.payload.transcript });
        }
        if (msg.type === "response" && msg.payload) {
          const { response_text, audio_b64, intent } = msg.payload;
          addVoiceResponse({ role: "assistant", text: response_text, intent });
          if (audio_b64) play(audio_b64);
          // Auto-start lesson if triggered
          if (msg.payload.action?.type === "TRIGGER_LESSON" && msg.payload.action?.lesson_id) {
            setLessonId(msg.payload.action.lesson_id);
          }
        }
        if (msg.type === "error") {
          toast.error(msg.payload);
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  // MediaRecorder for mic input
  async function startListening() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result.split(",")[1];
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "audio_end",
              payload: b64,
              school_id:  user?.school_id  || "school_001",
              student_id: user?.teacher_id || "student_001",
              lesson_id:  lessonId,
              language,
              encoding:    "WEBM_OPUS",
              sample_rate: 48000,
            }));
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setListening(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopListening() {
    mediaRef.current?.stop();
    setListening(false);
  }

  // Text send (fallback for no mic)
  async function handleTextSend() {
    if (!text.trim()) return;
    setSending(true);
    const msg = text.trim();
    setText("");
    addVoiceResponse({ role: "user", text: msg });
    try {
      const res = await voiceApi.message({
        school_id:  user?.school_id  || "school_001",
        student_id: user?.teacher_id || "student_001",
        lesson_id:  lessonId,
        text:       msg,
        language,
      });
      const { response_text, audio_b64, intent } = res.data;
      addVoiceResponse({ role: "assistant", text: response_text, intent });
      if (audio_b64) play(audio_b64);
      if (res.data.action?.lesson_id) setLessonId(res.data.action.lesson_id);
    } catch {
      toast.error("Voice request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto h-[calc(100vh-8rem)] flex flex-col gap-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-shrink-0"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">Voice Mode</h1>
          <p className="text-ink-500 text-xs font-body mt-0.5">
            Gemini NLU · Google TTS · CBC-aware
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <div className="flex items-center gap-1 p-1 glass rounded-xl border border-[var(--border)]">
            {[{ code: "en", label: "EN" }, { code: "sw", label: "SW" }].map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all",
                  language === l.code
                    ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                    : "text-ink-500 hover:text-ink-300"
                )}
              >
                <Globe size={11} className="inline mr-1" />{l.label}
              </button>
            ))}
          </div>
          {/* Connection status */}
          <span className={clsx("badge", wsReady ? "badge-green" : "badge-muted")}>
            <span className={clsx("w-1.5 h-1.5 rounded-full", wsReady ? "bg-brand-400 animate-pulse" : "bg-ink-600")} />
            {wsReady ? "Connected" : "Connecting"}
          </span>
          {/* Clear */}
          <button
            onClick={clearVoiceSession}
            className="p-2 rounded-lg glass hover:bg-white/5 text-ink-500 hover:text-ink-300 transition-all"
            title="Clear session"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </motion.div>

      {/* Conversation feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto space-y-4 pr-1"
      >
        {voiceResponses.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center justify-center h-full gap-4 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600/30 to-jade-600/30 border border-brand-500/20 flex items-center justify-center">
              <Mic size={28} className="text-brand-400" />
            </div>
            <div>
              <p className="font-body font-medium text-ink-300">Start a conversation</p>
              <p className="text-xs text-ink-600 mt-1 max-w-xs">
                Hold the mic button and speak, or type a message below.
                Try: <em className="text-ink-400">"Teach me photosynthesis for Grade 7"</em>
              </p>
            </div>
            {/* Suggested prompts */}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                "Teach me photosynthesis Grade 7",
                "What is supply and demand?",
                "My answer to question 1 is B",
                "What lesson are we on?",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => { setText(p); }}
                  className="text-xs px-3 py-1.5 glass rounded-lg border border-[var(--border)] text-ink-400 hover:text-ink-200 hover:border-brand-500/30 transition-all font-body"
                >
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {voiceResponses.map((r, i) => (
          <Bubble key={i} {...r} index={i} />
        ))}

        {sending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-600 to-jade-600 flex items-center justify-center flex-shrink-0">
              <Zap size={14} className="text-white" />
            </div>
            <div className="glass border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-ink-500"
                  animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Mic + Input area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex-shrink-0 card !p-4 space-y-3"
      >
        {/* Waveform */}
        <AnimatePresence>
          {listening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Waveform active={listening} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-center gap-3">
          {/* Mic button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            className={clsx(
              "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200",
              listening
                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] text-white"
                : "bg-brand-600/20 border border-brand-500/30 text-brand-400 hover:bg-brand-600/30"
            )}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </motion.button>

          {/* Text input */}
          <input
            className="input flex-1"
            placeholder={language === "sw" ? "Andika ujumbe hapa…" : "Type a message or question…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleTextSend()}
            disabled={sending}
          />

          {/* Send button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleTextSend}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-400 transition-all shadow-glow-green flex-shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </motion.button>
        </div>

        <p className="text-[10px] text-ink-700 font-body text-center">
          Hold mic to record · Release to send · Or type and press Enter
        </p>
      </motion.div>
    </div>
  );
}
